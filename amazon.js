import axios from "axios";

/**
 * Amazon Creators API (substitui PA-API)
 * - Auth: OAuth2 (Credential ID + Credential Secret)
 * - Marketplace: Brasil -> www.amazon.com.br (Credential Version 2.1)
 *
 * Variáveis esperadas (Railway):
 *   AMAZON_ACCESS_KEY   = Credential ID (ex: 4ues9op... / 6sik7b...)
 *   AMAZON_SECRET_KEY   = Credential Secret (string longa)
 *   AMAZON_PARTNER_TAG  = seu tracking id (ex: imperdivel-20)
 *   AMAZON_REGION       = br (opcional; default br)
 */

const CREDENTIAL_ID = process.env.AMAZON_ACCESS_KEY;      // Credential ID
const CREDENTIAL_SECRET = process.env.AMAZON_SECRET_KEY;  // Credential Secret
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;

const REGION = (process.env.AMAZON_REGION || "br").toLowerCase();

// Mapeamento mínimo (você usa BR)
const MARKETPLACE_BY_REGION = {
  br: "www.amazon.com.br"
};

// Versão por região (BR fica em NA => 2.1)
const CREDENTIAL_VERSION_BY_REGION = {
  br: "2.1"
};

// Token endpoint por Credential Version
const TOKEN_ENDPOINT_BY_VERSION = {
  "2.1": "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
  "2.2": "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token",
  "2.3": "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token"
};

const CREATORS_API_BASE = "https://creatorsapi.amazon/catalog/v1";

let cachedToken = null;
let tokenExpiresAtMs = 0;

function getMarketplace() {
  return MARKETPLACE_BY_REGION[REGION] || "www.amazon.com.br";
}

function getCredentialVersion() {
  return CREDENTIAL_VERSION_BY_REGION[REGION] || "2.1";
}

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAtMs - 60_000) return cachedToken;

  if (!CREDENTIAL_ID || !CREDENTIAL_SECRET) return null;

  const version = getCredentialVersion();
  const tokenUrl = TOKEN_ENDPOINT_BY_VERSION[version] || TOKEN_ENDPOINT_BY_VERSION["2.1"];

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", CREDENTIAL_ID);
  body.set("client_secret", CREDENTIAL_SECRET);
  body.set("scope", "creatorsapi/default");

  const resp = await axios.post(tokenUrl, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000
  });

  const token = resp.data?.access_token;
  const expiresIn = Number(resp.data?.expires_in || 3600);

  if (!token) return null;

  cachedToken = token;
  tokenExpiresAtMs = Date.now() + (expiresIn * 1000);
  return token;
}

/**
 * Função principal chamada pelo index.js
 * Retorna: { title, price, image, affiliateUrl }
 */
export async function getAmazonPrice(asin) {
  try {
    if (!CREDENTIAL_ID || !CREDENTIAL_SECRET || !PARTNER_TAG) {
      console.log(`⚠️ Credenciais Amazon ausentes. Pulando ASIN ${asin}`);
      return null;
    }

    const marketplace = getMarketplace();
    const version = getCredentialVersion();

    const token = await getAccessToken();
    if (!token) {
      console.log(`⚠️ Não consegui gerar token OAuth (verifique Credential ID/Secret). ASIN ${asin}`);
      return null;
    }

    console.log(`🔎 Consultando preço do ASIN ${asin}`);

    const payload = {
      itemIds: [asin],
      itemIdType: "ASIN",
      marketplace,
      partnerTag: PARTNER_TAG,
      resources: [
        "images.primary.large",
        "images.primary.medium",
        "itemInfo.title",
        "offersV2.listings.price",
        "offersV2.listings.dealDetails"
      ]
    };

    const resp = await axios.post(`${CREATORS_API_BASE}/getItems`, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-marketplace": marketplace,
        "Authorization": `Bearer ${token}, Version ${version}`
      },
      timeout: 15000
    });

    const item =
      resp.data?.itemsResult?.items?.[0] ||
      resp.data?.itemsResult?.items?.find?.((x) => x?.asin === asin);

    if (!item) return null;

    const title = item.itemInfo?.title?.displayValue || null;

    // preço: tenta BuyBox (listings[0]) e pega amount
    const listing = item.offersV2?.listings?.[0] || null;
    const price = listing?.price?.money?.amount ?? null;

    const image =
      item.images?.primary?.large?.url ||
      item.images?.primary?.medium?.url ||
      item.images?.primary?.small?.url ||
      null;

    // Use o link vended (não edite parâmetros). Fallback simples se vier vazio.
    const affiliateUrl =
      item.detailPageURL ||
      `https://${marketplace}/dp/${asin}?tag=${PARTNER_TAG}`;

    if (!title || price == null) return null;

    return { title, price: Number(price), image, affiliateUrl };

  } catch (error) {
    const msg =
      error.response?.data?.errors?.[0]?.message ||
      error.response?.data?.errors?.[0]?.code ||
      error.response?.statusText ||
      error.message;

    console.error(`❌ Erro Amazon ASIN ${asin}: ${msg}`);
    return null;
  }
}
