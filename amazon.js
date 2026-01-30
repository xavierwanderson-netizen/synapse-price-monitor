import crypto from "crypto";
import axios from "axios";

/**
 * Amazon Product Advertising API – v2.1
 * Implementação segura e defensiva
 * Compatível com credencial (ID + Segredo) — sem AKIA
 */

const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY; // ID da credencial
const SECRET_KEY = process.env.AMAZON_SECRET_KEY; // Segredo
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;

const REGION = "us-east-1";
const SERVICE = "ProductAdvertisingAPI";
const HOST = "webservices.amazon.com.br";
const ENDPOINT = `https://${HOST}/paapi5/getitems`;

/**
 * Função principal chamada pelo index.js
 */
export async function getAmazonPrice(asin) {
  try {
    if (!ACCESS_KEY || !SECRET_KEY || !PARTNER_TAG) {
      console.log(`⚠️ Credenciais Amazon ausentes. Pulando ASIN ${asin}`);
      return null;
    }

    console.log(`🔎 Consultando preço do ASIN ${asin}`);

    const payload = {
      ItemIds: [asin],
      Resources: [
        "ItemInfo.Title",
        "Offers.Listings.Price",
        "Images.Primary.Large"
      ],
      PartnerTag: PARTNER_TAG,
      PartnerType: "Associates",
      Marketplace: "www.amazon.com.br"
    };

    const body = JSON.stringify(payload);
    const headers = signRequest(body);

    const response = await axios.post(ENDPOINT, body, {
      headers,
      timeout: 15000
    });

    const item = response.data?.ItemsResult?.Items?.[0];
    if (!item) return null;

    const title = item.ItemInfo?.Title?.DisplayValue || null;
    const price = item.Offers?.Listings?.[0]?.Price?.Amount || null;
    const image = item.Images?.Primary?.Large?.URL || null;

    if (!title || !price) return null;

    return {
      title,
      price,
      image,
      affiliateUrl: `https://www.amazon.com.br/dp/${asin}?tag=${PARTNER_TAG}`
    };

  } catch (error) {
    const msg =
      error.response?.data?.Errors?.[0]?.Message ||
      error.response?.statusText ||
      error.message;

    console.error(`❌ Erro Amazon ASIN ${asin}: ${msg}`);
    return null; // NUNCA quebra o sistema
  }
}

/**
 * Assinatura Amazon PA-API (SigV4 custom)
 */
function signRequest(body) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders =
    "content-encoding;content-type;host;x-amz-date";

  const payloadHash = sha256(body);

  const canonicalRequest =
    `POST\n/paapi5/getitems\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const stringToSign =
    `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/${REGION}/${SERVICE}/aws4_request\n${sha256(canonicalRequest)}`;

  const signingKey = getSignatureKey(
    SECRET_KEY,
    dateStamp,
    REGION,
    SERVICE
  );

  const signature = hmac(signingKey, stringToSign);

  return {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Encoding": "amz-1.0",
    "X-Amz-Date": amzDate,
    "Authorization":
      `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${dateStamp}/${REGION}/${SERVICE}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

/* Helpers */

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function getSignatureKey(secret, date, region, service) {
  const kDate = crypto.createHmac("sha256", "AWS4" + secret).update(date).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
  return crypto.createHmac("sha256", kService).update("aws4_request").digest();
}
