import axios from "axios";

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;
const MARKETPLACE = "www.amazon.com.br";

// tenta pegar imagem/título por Creators API (se tiver credencial)
const CREDENTIAL_ID = process.env.AMAZON_ACCESS_KEY;
const CREDENTIAL_SECRET = process.env.AMAZON_SECRET_KEY;
const VERSION = "2.1";
const TOKEN_URL = "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token";
const API_BASE = "https://creatorsapi.amazon/catalog/v1";

let tokenCache = null;
let tokenExp = 0;

async function getToken() {
  const now = Date.now();
  if (tokenCache && now < tokenExp - 60_000) return tokenCache;

  if (!CREDENTIAL_ID || !CREDENTIAL_SECRET) return null;

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", CREDENTIAL_ID);
  body.set("client_secret", CREDENTIAL_SECRET);
  body.set("scope", "creatorsapi/default");

  const res = await axios.post(TOKEN_URL, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000
  });

  const token = res.data?.access_token;
  const exp = Number(res.data?.expires_in || 3600);

  if (!token) return null;

  tokenCache = token;
  tokenExp = Date.now() + exp * 1000;
  return token;
}

function parsePrice(html) {
  const meta = html.match(/property=["']product:price:amount["']\s+content=["']([^"']+)["']/i);
  if (meta) {
    const n = Number(meta[1]);
    if (Number.isFinite(n)) return n;
  }

  const p2p = html.match(/"priceToPay"\s*:\s*\{\s*"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (p2p) {
    const n = Number(p2p[1]);
    if (Number.isFinite(n)) return n;
  }

  const brl = html.match(/R\$\s*([0-9\.\,]+)/);
  if (brl) {
    const cleaned = brl[1].replace(/\./g, "").replace(",", ".");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function parseTitle(html) {
  const m = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
  if (m) return m[1].replace(/\s+/g, " ").trim();
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (t) return t[1].replace(/\s+/g, " ").trim();
  return null;
}

function parseImage(html) {
  const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) return og[1];
  return null;
}

async function getFromCreators(asin) {
  try {
    const token = await getToken();
    if (!token) return null;

    const payload = {
      itemIds: [asin],
      itemIdType: "ASIN",
      marketplace: MARKETPLACE,
      partnerTag: PARTNER_TAG,
      resources: ["images.primary.large", "images.primary.medium", "itemInfo.title"]
    };

    const res = await axios.post(`${API_BASE}/getItems`, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-marketplace": MARKETPLACE,
        "Authorization": `Bearer ${token}, Version ${VERSION}`
      },
      timeout: 15000
    });

    const item = res.data?.itemsResult?.items?.[0];
    if (!item) return null;

    const title = item.itemInfo?.title?.displayValue || null;
    const image =
      item.images?.primary?.large?.url ||
      item.images?.primary?.medium?.url ||
      null;

    const url = item.detailPageURL || null;
    return { title, image, url };
  } catch {
    return null;
  }
}

async function getFromHtml(asin) {
  const url = `https://${MARKETPLACE}/dp/${asin}?tag=${PARTNER_TAG}`;
  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
    }
  });

  const html = res.data || "";
  const price = parsePrice(html);
  const title = parseTitle(html);
  const image = parseImage(html);

  return { price, title, image, url };
}

export async function getAmazonPrice(asin) {
  if (!PARTNER_TAG) return null;

  // 1) pega preço do HTML (mais confiável)
  const scraped = await getFromHtml(asin);
  if (!scraped?.price) return null;

  // 2) tenta enriquecer com Creators (imagem/título melhor)
  const creators = await getFromCreators(asin);

  return {
    title: creators?.title || scraped.title || `ASIN ${asin}`,
    price: scraped.price,
    image: creators?.image || scraped.image || null,
    affiliateUrl: creators?.url || scraped.url
  };
}
