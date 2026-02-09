import axios from "axios";

/**
 * Anti-captcha hardening (mínimo, sem mudar arquitetura)
 * - Headers browser-like
 * - Rotação de UA
 * - Retry com backoff em 429/503/timeouts
 * - Detecção de CAPTCHA/Robot Check
 */

const DEFAULT_TIMEOUT_MS = Number(process.env.AMAZON_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.AMAZON_MAX_RETRIES || 2); // total tentativas = 1 + retries
const BASE_BACKOFF_MS = Number(process.env.AMAZON_BACKOFF_BASE_MS || 1200);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickUserAgent() {
  const agents = [
    // Desktop Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    // Desktop Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    // Android Chrome
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
    // iPhone Safari
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1"
  ];
  return agents[randInt(0, agents.length - 1)];
}

function browserLikeHeaders(url) {
  const ua = pickUserAgent();

  // Alguns headers variam conforme UA mobile/desktop; aqui mantemos genéricos e consistentes
  return {
    "User-Agent": ua,
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Referer": "https://www.amazon.com.br/",
    // Fetch metadata (ajuda a parecer navegador)
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document"
  };
}

function parseBrazilPriceToNumber(text) {
  if (!text) return null;

  const cleaned = text
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function looksLikeCaptcha(html) {
  if (!html) return false;
  const h = html.toLowerCase();

  // Padrões comuns de bloqueio/captcha da Amazon
  const signals = [
    "captcha",
    "robot check",
    "digite os caracteres",
    "insira os caracteres",
    "type the characters you see",
    "/errors/validatecaptcha",
    "api-services-support@amazon.com" // aparece em páginas de bloqueio
  ];

  return signals.some((s) => h.includes(s));
}

function parseTitle(html) {
  if (!html) return "Produto Amazon";
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return titleMatch
    ? titleMatch[1].replace("Amazon.com.br:", "").trim()
    : "Produto Amazon";
}

function parsePrice(html) {
  if (!html) return null;

  // 1) Mais comum
  const m1 = html.match(/a-offscreen">([^<]+)</);
  if (m1?.[1]) return parseBrazilPriceToNumber(m1[1]);

  // 2) Alternativa (algumas páginas mudam)
  const m2 = html.match(/"priceAmount"\s*:\s*"([^"]+)"/i);
  if (m2?.[1]) return parseBrazilPriceToNumber(m2[1]);

  return null;
}

export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  const base = `https://www.amazon.com.br/dp/${asin}`;
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

async function fetchHtmlWithRetry(url) {
  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // jitter leve antes de cada request (evita padrão fixo)
      if (attempt > 0) {
        const backoff = BASE_BACKOFF_MS * attempt + randInt(200, 700);
        await sleep(backoff);
      }

      const res = await axios.get(url, {
        headers: browserLikeHeaders(url),
        timeout: DEFAULT_TIMEOUT_MS,
        // Aceitar 4xx/5xx sem explodir; vamos tratar manualmente
        validateStatus: () => true
      });

      const status = res.status;
      const html = typeof res.data === "string" ? res.data : "";

      // Detecção captcha (mesmo com 200)
      if (looksLikeCaptcha(html)) {
        const err = new Error("CAPTCHA_DETECTED");
        err.code = "CAPTCHA_DETECTED";
        err.status = status;
        throw err;
      }

      // Rate limit / proteção
      if (status === 429 || status === 503) {
        const err = new Error(`HTTP_${status}`);
        err.code = `HTTP_${status}`;
        err.status = status;
        throw err;
      }

      // Outras respostas ruins: não retry infinito; mas se for 5xx, tentamos
      if (status >= 500 && status <= 599) {
        const err = new Error(`HTTP_${status}`);
        err.code = `HTTP_${status}`;
        err.status = status;
        throw err;
      }

      // 200..499 (exceto os tratados acima): retorna e deixa parse decidir
      return { status, html };
    } catch (e) {
      lastErr = e;

      // Só retry para erros “de rede / proteção”
      const retryable =
        e?.code === "ECONNABORTED" ||
        e?.code === "ETIMEDOUT" ||
        e?.code === "CAPTCHA_DETECTED" ||
        String(e?.code || "").startsWith("HTTP_");

      if (!retryable || attempt === MAX_RETRIES) {
        throw lastErr;
      }
    }
  }

  throw lastErr || new Error("UNKNOWN_FETCH_ERROR");
}

export async function fetchAmazonProduct(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}`;

  const { html } = await fetchHtmlWithRetry(url);

  const title = parseTitle(html);
  const price = parsePrice(html);

  // Se não achou preço, não salva como 0/NaN — retorna null e o motor ignora
  if (!price) {
    return { asin, title, price: null };
  }

  return { asin, title, price };
}
