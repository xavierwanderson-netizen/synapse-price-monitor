import axios from "axios";

function normalizePriceText(txt) {
  if (!txt) return null;
  // Ex: "R$ 1.234,56" -> "1234.56"
  const cleaned = txt
    .replace(/\s+/g, " ")
    .replace("R$", "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const num = Number(cleaned.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function extractFirstMatch(html, regex) {
  const m = html.match(regex);
  return m && m[1] ? m[1] : null;
}

function decodeHtmlEntities(s = "") {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTitle(html) {
  const t =
    extractFirstMatch(html, /<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/i) ||
    extractFirstMatch(html, /<title>([\s\S]*?)<\/title>/i);
  if (!t) return null;
  return decodeHtmlEntities(t.replace(/\s+/g, " ").trim());
}

function parseImage(html) {
  // Meta og:image costuma funcionar
  const og =
    extractFirstMatch(html, /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i) ||
    extractFirstMatch(html, /<meta[^>]*name="og:image"[^>]*content="([^"]+)"/i);
  return og || null;
}

function parsePrice(html) {
  // A Amazon muda muito. Tentamos padrões comuns:
  const candidates = [];

  // 1) Padrão clássico: a-price-whole / a-price-fraction
  const whole = extractFirstMatch(html, /<span[^>]*class="a-price-whole"[^>]*>([\d.]+)<\/span>/i);
  const frac = extractFirstMatch(html, /<span[^>]*class="a-price-fraction"[^>]*>(\d+)<\/span>/i);
  if (whole) {
    const combined = `${whole.replace(/\./g, "")},${(frac || "00").padStart(2, "0")}`;
    candidates.push(`R$ ${combined}`);
  }

  // 2) Padrão em JSON embutido (às vezes aparece)
  // Ex: "price":"1234.56" ou "priceAmount":1234.56
  const jsonPrice1 = extractFirstMatch(html, /"price"\s*:\s*"(\d+(?:\.\d+)?)"/i);
  if (jsonPrice1) candidates.push(`R$ ${jsonPrice1.replace(".", ",")}`);

  const jsonPrice2 = extractFirstMatch(html, /"priceAmount"\s*:\s*(\d+(?:\.\d+)?)/i);
  if (jsonPrice2) candidates.push(`R$ ${jsonPrice2.replace(".", ",")}`);

  // 3) Padrão “a-offscreen”
  // Ex: <span class="a-offscreen">R$ 1.234,56</span>
  const offscreen = extractFirstMatch(html, /<span[^>]*class="a-offscreen"[^>]*>\s*(R\$\s*[\d.]+,\d{2})\s*<\/span>/i);
  if (offscreen) candidates.push(offscreen);

  // 4) Padrão fallback: "R$ 1.234,56" em qualquer lugar (menos preciso)
  const any = extractFirstMatch(html, /(R\$\s*[\d.]+,\d{2})/i);
  if (any) candidates.push(any);

  for (const c of candidates) {
    const num = normalizePriceText(c);
    if (num && num > 0) return num;
  }
  return null;
}

function buildAffiliateUrl(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG || "";
  // Link simples e estável
  if (tag) return `https://www.amazon.com.br/dp/${asin}?tag=${encodeURIComponent(tag)}`;
  return `https://www.amazon.com.br/dp/${asin}`;
}

async function scrapeAmazon(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}`;

  const res = await axios.get(url, {
    timeout: 25000,
    headers: {
      // Header básico; não é “anti-bot”, só evita alguns retornos ruins
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  const html = res.data;

  if (typeof html === "string" && html.toLowerCase().includes("captcha")) {
    throw new Error("Página retornou CAPTCHA/anti-bot (sem preço confiável).");
  }

  const title = parseTitle(html);
  const image = parseImage(html);
  const price = parsePrice(html);

  return {
    asin,
    title,
    image,
    price,
    affiliateUrl: buildAffiliateUrl(asin)
  };
}

export async function getAmazonPrice(asin) {
  // Única fonte de preço: scraping
  return scrapeAmazon(asin);
}
