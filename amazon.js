import axios from "axios";

function pickUserAgent() {
  const agents = [
    // Chrome desktop
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    // Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    // Android
    "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRobotCheck(html) {
  if (!html) return false;
  const h = html.toLowerCase();
  return (
    h.includes("robot check") ||
    h.includes("digite os caracteres") ||
    h.includes("insira os caracteres") ||
    h.includes("captcha") ||
    h.includes("/errors/validatecaptcha")
  );
}

function parseBrazilPriceToNumber(text) {
  // Ex: "R$ 2.199,90" -> 2199.90
  if (!text) return null;
  const cleaned = String(text)
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function extractMeta(html, property) {
  const re = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  return m ? m[1] : null;
}

function extractTitle(html) {
  // og:title costuma vir com sufixos (ex: "Panela ... : Amazon.com.br")
  const og = extractMeta(html, "og:title");
  if (og) return og.replace(/\s*:\s*Amazon\.com\.br\s*$/i, "").trim();
  const t = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  return t ? t.replace(/\s*:\s*Amazon\.com\.br\s*$/i, "").trim() : null;
}

function extractImage(html) {
  return extractMeta(html, "og:image") || null;
}

function extractPrice(html) {
  // 1) meta price
  const metaAmount =
    extractMeta(html, "product:price:amount") ||
    extractMeta(html, "og:price:amount");

  const metaNum = parseBrazilPriceToNumber(metaAmount);
  if (metaNum != null) return metaNum;

  // 2) JSON embutido (às vezes vem com priceToPay.value)
  const jsonMatch = html.match(/"priceToPay"\s*:\s*\{\s*"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,/);
  if (jsonMatch) {
    const n = Number(jsonMatch[1]);
    if (Number.isFinite(n)) return n;
  }

  // 3) a-price-whole + a-price-fraction (buybox)
  const whole = html.match(/a-price-whole">([^<]+)</)?.[1];
  const frac = html.match(/a-price-fraction">([^<]+)</)?.[1];
  if (whole && frac) {
    const n = parseBrazilPriceToNumber(`R$${whole},${frac}`);
    if (n != null) return n;
  }

  // 4) Primeira ocorrência "a-offscreen" (pode pegar preço de outro bloco; ainda assim melhor que nada)
  const off = html.match(/a-offscreen">([^<]+)</)?.[1];
  const offNum = parseBrazilPriceToNumber(off);
  if (offNum != null) return offNum;

  return null;
}

export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  const base = `https://www.amazon.com.br/dp/${asin}`;
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

export async function fetchAmazonProduct(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}`;

  const headers = {
    "User-Agent": pickUserAgent(),
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };

  // 2 tentativas (Amazon ocasionalmente retorna html diferente/403)
  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await axios.get(url, {
        headers,
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (resp.status === 404) {
        throw new Error("NOT_FOUND");
      }

      if (resp.status === 429) {
        throw new Error("RATE_LIMIT");
      }

      if (resp.status >= 500 && resp.status <= 599) {
        throw new Error(`AMAZON_${resp.status}`);
      }

      if (resp.status === 403) {
        // pode vir html do robot-check ou uma página "Access Denied"
        const html = String(resp.data || "");
        if (isRobotCheck(html)) throw new Error("ROBOT_CHECK");
        throw new Error("FORBIDDEN");
      }

      const html = String(resp.data || "");
      if (isRobotCheck(html)) throw new Error("ROBOT_CHECK");

      const price = extractPrice(html);
      const title = extractTitle(html);
      const image = extractImage(html);
      const link = buildAffiliateLink(asin);

      return { asin, price, title, image, link, sourceUrl: url };
    } catch (e) {
      lastErr = e;
      // backoff pequeno
      if (attempt < 2) await sleep(800 + Math.random() * 400);
    }
  }

  throw lastErr || new Error("UNKNOWN");
}
