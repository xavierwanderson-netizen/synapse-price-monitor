import axios from "axios";
import cheerio from "cheerio";

/* ===============================
   CONFIG GERAL
   =============================== */
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;

// Creators API (OAuth 2.0)
const CREATORS_TOKEN_URL =
  "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token";
const CREATORS_API_BASE =
  "https://creatorsapi.amazon/catalog/v1";

const CREDENTIAL_ID = process.env.AMAZON_ACCESS_KEY;     // Credential ID
const CREDENTIAL_SECRET = process.env.AMAZON_SECRET_KEY; // Credential Secret
const CREDENTIAL_VERSION = "2.1"; // BR = 2.1
const MARKETPLACE = "www.amazon.com.br";

/* ===============================
   CACHE DE TOKEN (1 HORA)
   =============================== */
let cachedToken = null;
let tokenExpiresAt = 0;

async function getCreatorsToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const auth = Buffer.from(
    `${CREDENTIAL_ID}:${CREDENTIAL_SECRET}`
  ).toString("base64");

  const res = await axios.post(
    CREATORS_TOKEN_URL,
    "grant_type=client_credentials&scope=creatorsapi/default",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    }
  );

  cachedToken = res.data.access_token;
  tokenExpiresAt = now + (res.data.expires_in - 60) * 1000; // margem 1 min
  return cachedToken;
}

/* ===============================
   CREATORS API — METADADOS
   =============================== */
async function getMetadataFromCreators(asin) {
  try {
    const token = await getCreatorsToken();

    const res = await axios.post(
      `${CREATORS_API_BASE}/getItems`,
      {
        itemIds: [asin],
        partnerTag: PARTNER_TAG,
        marketplace: MARKETPLACE,
        resources: [
          "itemInfo.title",
          "images.primary.large"
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${token}, Version ${CREDENTIAL_VERSION}`,
          "Content-Type": "application/json",
          "x-marketplace": MARKETPLACE
        },
        timeout: 15000
      }
    );

    const item = res.data?.items?.[0];
    if (!item) return {};

    return {
      title: item.itemInfo?.title?.displayValue || null,
      image: item.images?.primary?.large?.url || null
    };
  } catch (err) {
    console.warn(`⚠️ Creators API falhou para ${asin}`);
    return {};
  }
}

/* ===============================
   SCRAPING — PREÇO REAL
   =============================== */
async function getPriceFromScraping(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}`;

  const res = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9"
    },
    timeout: 15000
  });

  const $ = cheerio.load(res.data);

  let priceText =
    $("#priceblock_dealprice").text() ||
    $("#priceblock_ourprice").text() ||
    $(".a-price .a-offscreen").first().text();

  if (!priceText) return null;

  const price = Number(
    priceText
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim()
  );

  if (!price || isNaN(price)) return null;

  return price;
}

/* ===============================
   EXPORT PRINCIPAL
   =============================== */
export async function getAmazonPrice(asin) {
  try {
    // 1️⃣ preço SEMPRE por scraping
    const price = await getPriceFromScraping(asin);
    if (!price) return null;

    // 2️⃣ metadados pela Creators API (se disponível)
    const meta = await getMetadataFromCreators(asin);

    return {
      title: meta.title || `Produto ${asin}`,
      image: meta.image || null,
      price,
      affiliateUrl: `https://www.amazon.com.br/dp/${asin}?tag=${PARTNER_TAG}`
    };

  } catch (error) {
    console.error(`❌ Falha total ASIN ${asin}:`, error.message);
    return null;
  }
}
