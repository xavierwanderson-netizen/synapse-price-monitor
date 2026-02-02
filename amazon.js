import axios from "axios";

/**
 * Amazon price monitor (BR) - definitivo
 *
 * Estratégia:
 * 1) Tenta pegar preço via Creators API (OAuth) quando disponível.
 * 2) Se não vier preço (offersV2 vazio / not found / acesso revogado), faz fallback para scraping do HTML do produto.
 *
 * Assim o motor NÃO PARA de alertar quedas de preço.
 */

/** ENV (mantém compatibilidade com seu projeto atual) */
const CREDENTIAL_ID = process.env.AMAZON_ACCESS_KEY; // Credential ID (Creators API)
const CREDENTIAL_SECRET = process.env.AMAZON_SECRET_KEY; // Credential Secret (Creators API)
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG; // ex: imperdivel-20
const MARKETPLACE = process.env.AMAZON_MARKETPLACE || "www.amazon.com.br"; // BR
const CREDENTIAL_VERSION = process.env.AMAZON_CREDENTIAL_VERSION || "2.1"; // BR está no grupo 2.1

/** Creators API endpoints */
const CREATORS_API_BASE = "https://creatorsapi.amazon";
const TOKEN_ENDPOINT_BY_VERSION = {
  "2.1": "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
  "2.2": "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token",
  "2.3": "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token"
};

let tokenCache = {
  accessToken: null,
  expiresAtMs: 0
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hasCreatorsEnv() {
  return Boolean(CREDENTIAL_ID && CREDENTIAL_SECRET && PARTNER_TAG && CREDENTIAL_VERSION);
}

/** HTTP com retry + backoff (sem quebrar o job) */
async function requestWithRetry(fn, { retries = 3, baseDelayMs = 700 } = {}) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const transient =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT";

      if (!transient || attempt === retries) break;

      const jitter = Math.floor(Math.random() * 250);
      const wait = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      await sleep(wait);
    }
  }
  throw lastErr;
}

/** ====== Creators API (OAuth) ====== */
async function getCreatorsAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.accessToken;
  }

  const tokenUrl = TOKEN_ENDPOINT_BY_VERSION[CREDENTIAL_VERSION];
  if (!tokenUrl) {
    throw new Error(`CREDENTIAL_VERSION inválida: ${CREDENTIAL_VERSION}`);
  }

  const basic = Buffer.from(`${CREDENTIAL_ID}:${CREDENTIAL_SECRET}`).toString("base64");

  const res = await requestWithRetry(
    () =>
      axios.post(
        tokenUrl,
        "grant_type=client_credentials&scope=creatorsapi/default",
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basic}`
          },
          timeout: 15000
        }
      ),
    { retries: 3 }
  );

  const accessToken = res?.data?.access_token;
  const expiresIn = Number(res?.data?.expires_in || 3600);

  if (!accessToken) {
    throw new Error("Falha ao obter access_token (Creators API).");
  }

  tokenCache.accessToken = accessToken;
  tokenCache.expiresAtMs = Date.now() + expiresIn * 1000;

  return accessToken;
}

async function creatorsGetItem(asin) {
  const token = await getCreatorsAccessToken();

  const payload = {
    itemIds: [asin],
    itemIdType: "ASIN",
    marketplace: MARKETPLACE,
    partnerTag: PARTNER_TAG,
    resources: [
      "images.primary.large",
      "itemInfo.title",
      "offersV2.listings.price",
      "offersV2.listings.availability"
    ]
  };

  const res = await requestWithRetry(
    () =>
      axios.post(`${CREATORS_API_BASE}/catalog/v1/getItems`, payload, {
        headers: {
          "Content-Type": "application/json",
          "x-marketplace": MARKETPLACE,
          Authorization: `Bearer ${token}, Version ${CREDENTIAL_VERSION}`
        },
        timeout: 15000
      }),
    { retries: 3 }
  );

  const item = res?.data?.itemsResult?.items?.[0] || null;
  if (!item) return null;

  const title = item?.itemInfo?.title?.displayValue || null;

  // Imagem
  const image =
    item?.images?.primary?.large?.url ||
    item?.images?.primary?.medium?.url ||
    item?.images?.primary?.small?.url ||
    null;

  // Preço (pode vir nulo em vários casos)
  const price =
    item?.offersV2?.listings?.[0]?.price?.money?.amount ??
    null;

  const affiliateUrl =
    item?.detailPageURL ||
    `https://${MARKETPLACE}/dp/${asin}?tag=${PARTNER_TAG}`;

  return { title, price: typeof price === "number" ? price : null, image, affiliateUrl };
}

/** ====== Scraping (fallback confiável para preço) ====== */
function parseBRLToNumber(str) {
  if (!str) return null;
  // Ex: "1.234,56" -> 1234.56 | "119,00" -> 119.00
  const cleaned = str
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractTitle(html) {
  const m1 = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
  if (m1) return m1[1].replace(/\s+/g, " ").trim();
  const m2 = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (m2) return m2[1].replace(/\s+/g, " ").trim();
  return null;
}

function extractImage(html) {
  const og = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (og) return og[1];
  const tw = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (tw) return tw[1];
  return null;
}

function extractPriceFromHtml(html) {
  // 1) meta price amount
  const meta = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (meta) {
    const n = Number(meta[1]);
    if (Number.isFinite(n)) return n;
  }

  // 2) JSON "priceToPay":{"value":119.00
  const p2p = html.match(/"priceToPay"\s*:\s*\{\s*"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (p2p) {
    const n = Number(p2p[1]);
    if (Number.isFinite(n)) return n;
  }

  // 3) a-price-whole + a-price-fraction
  const whole = html.match(/<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>\s*([0-9\.\,]+)\s*<\/span>/i);
  const frac = html.match(/<span[^>]*class=["'][^"']*a-price-fraction[^"']*["'][^>]*>\s*([0-9]{2})\s*<\/span>/i);
  if (whole) {
    const w = whole[1].replace(/\./g, "").replace(",", "");
    const f = frac ? frac[1] : "00";
    const n = Number(`${w}.${f}`);
    if (Number.isFinite(n)) return n;
  }

  // 4) fallback: "R$ 119,00"
  const brl = html.match(/R\$\s*([0-9\.\,]+)\b/);
  if (brl) {
    return parseBRLToNumber(brl[1]);
  }

  return null;
}

function detectBlocked(html) {
  const s = html.toLowerCase();
  return (
    s.includes("digite os caracteres") ||
    s.includes("captcha") ||
    s.includes("sorry") && s.includes("robot") ||
    s.includes("to discuss automated access") ||
    s.includes("bot detection")
  );
}

async function scrapeAmazonProduct(asin) {
  const url = `https://${MARKETPLACE}/dp/${asin}?tag=${PARTNER_TAG}`;
  const res = await requestWithRetry(
    () =>
      axios.get(url, {
        timeout: 20000,
        headers: {
          // headers conservadores (menos bloqueio)
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      }),
    { retries: 3 }
  );

  const html = res?.data || "";
  if (!html || typeof html !== "string") return null;

  if (detectBlocked(html)) {
    // bloqueio → não quebra o motor, apenas sinaliza
    console.log(`⚠️ Amazon bloqueou scraping (captcha) para ASIN ${asin}`);
    return null;
  }

  const title = extractTitle(html);
  const image = extractImage(html);
  const price = extractPriceFromHtml(html);

  return {
    title,
    price,
    image,
    affiliateUrl: url
  };
}

/** ====== FUNÇÃO PRINCIPAL ====== */
export async function getAmazonPrice(asin) {
  // Pequeno espaçamento para reduzir bloqueio / 429 quando há muitos ASINs
  await sleep(250);

  let apiData = null;

  // 1) Creators API (se tiver env + se estiver elegível)
  if (hasCreatorsEnv()) {
    try {
      apiData = await creatorsGetItem(asin);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data || e?.message;
      console.log(`⚠️ Creators API falhou para ${asin}:`, msg);
      apiData = null;
    }
  }

  // Se Creators API trouxe preço e título, ótimo.
  if (apiData?.price && apiData?.title) {
    return {
      title: apiData.title,
      price: apiData.price,
      image: apiData.image || null,
      affiliateUrl: apiData.affiliateUrl || `https://${MARKETPLACE}/dp/${asin}?tag=${PARTNER_TAG}`
    };
  }

  // 2) Scraping (fallback definitivo para preço)
  const scraped = await scrapeAmazonProduct(asin);

  if (!scraped || !scraped.price) {
    // Último fallback: se API trouxe pelo menos título/imagem, devolve sem preço (motor vai pular)
    if (apiData?.title) {
      return {
        title: apiData.title,
        price: null,
        image: apiData.image || null,
        affiliateUrl: apiData.affiliateUrl || `https://${MARKETPLACE}/dp/${asin}?tag=${PARTNER_TAG}`
      };
    }
    return null;
  }

  return {
    title: scraped.title || apiData?.title || `ASIN ${asin}`,
    price: scraped.price,
    image: scraped.image || apiData?.image || null,
    affiliateUrl: scraped.affiliateUrl
  };
}
