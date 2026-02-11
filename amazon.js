import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const DEFAULT_TIMEOUT_MS = Number(process.env.AMAZON_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.AMAZON_MAX_RETRIES || 2);
const BASE_BACKOFF_MS = Number(process.env.AMAZON_BACKOFF_BASE_MS || 1200);

// 🔐 Proxy opcional
const PROXY_URL = process.env.PROXY_URL || null;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1"
  ];
  return agents[randInt(0, agents.length - 1)];
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
  return (
    h.includes("captcha") ||
    h.includes("robot check") ||
    h.includes("validatecaptcha")
  );
}

function parseTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match
    ? match[1].replace("Amazon.com.br:", "").trim()
    : "Produto Amazon";
}

function parsePrice(html) {
  const m1 = html.match(/a-offscreen">([^<]+)</);
  if (m1?.[1]) return parseBrazilPriceToNumber(m1[1]);
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
      if (attempt > 0) {
        const backoff = BASE_BACKOFF_MS * attempt + randInt(300, 800);
        await sleep(backoff);
      }

      const res = await axios.get(url, {
        headers: {
          "User-Agent": pickUserAgent(),
          "Accept-Language": "pt-BR,pt;q=0.9"
        },
        timeout: DEFAULT_TIMEOUT_MS,
        httpsAgent: proxyAgent || undefined,
        validateStatus: () => true
      });

      const html = typeof res.data === "string" ? res.data : "";

      if (looksLikeCaptcha(html)) {
        const err = new Error("CAPTCHA_DETECTED");
        err.code = "CAPTCHA_DETECTED";
        throw err;
      }

      return html;
    } catch (e) {
      lastErr = e;

      if (attempt === MAX_RETRIES) {
        throw lastErr;
      }
    }
  }

  throw lastErr;
}

export async function fetchAmazonProduct(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}`;
  const html = await fetchHtmlWithRetry(url);

  const title = parseTitle(html);
  const price = parsePrice(html);

  if (!price) return { asin, title, price: null };

  return { asin, title, price };
}
