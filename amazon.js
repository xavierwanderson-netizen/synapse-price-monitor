import axios from "axios";
import crypto from "crypto";
import cheerio from "cheerio";

/* ===============================
   CONFIG
   =============================== */
const REGION = "us-east-1";
const SERVICE = "ProductAdvertisingAPI";
const HOST = "webservices.amazon.com.br";
const ENDPOINT = `https://${HOST}/paapi5/getitems`;

const ACCESS_KEY = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;

/* ===============================
   AMAZON PA-API (GET ITEMS)
   =============================== */
function signRequest(payload) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:application/json; charset=utf-8\n` +
    `host:${HOST}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders =
    "content-encoding;content-type;host;x-amz-date";

  const payloadHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  const canonicalRequest =
    `POST\n/paapi5/getitems\n\n` +
    canonicalHeaders +
    `\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;

  const stringToSign =
    `${algorithm}\n${amzDate}\n${credentialScope}\n` +
    crypto.createHash("sha256").update(canonicalRequest).digest("hex");

  const kDate = crypto
    .createHmac("sha256", "AWS4" + SECRET_KEY)
    .update(dateStamp)
    .digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(REGION).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(SERVICE).digest();
  const kSigning = crypto
    .createHmac("sha256", kService)
    .update("aws4_request")
    .digest();

  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const authorization =
    `${algorithm} Credential=${ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate };
}

async function getFromApi(asin) {
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

  const { authorization, amzDate } = signRequest(payload);

  const res = await axios.post(ENDPOINT, payload, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "amz-1.0",
      "X-Amz-Date": amzDate,
      Authorization: authorization
    },
    timeout: 15000
  });

  const item = res.data?.ItemsResult?.Items?.[0];
  if (!item) return null;

  const price =
    item?.Offers?.Listings?.[0]?.Price?.Amount ?? null;

  if (!price) return null;

  return {
    title: item.ItemInfo.Title.DisplayValue,
    price,
    image: item.Images.Primary.Large.URL,
    affiliateUrl: `https://www.amazon.com.br/dp/${asin}?tag=${PARTNER_TAG}`
  };
}

/* ===============================
   FALLBACK SCRAPING
   =============================== */
async function getFromScraping(asin) {
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

  const title =
    $("#productTitle").text().trim() ||
    $("h1 span").first().text().trim();

  let priceText =
    $("#priceblock_dealprice").text() ||
    $("#priceblock_ourprice").text() ||
    $(".a-price .a-offscreen").first().text();

  if (!priceText) return null;

  const price = Number(
    priceText
      .replace("R$", "")
      .replace(".", "")
      .replace(",", ".")
      .trim()
  );

  if (!price || isNaN(price)) return null;

  const image =
    $("#imgTagWrapperId img").attr("src") ||
    $("#landingImage").attr("src");

  return {
    title,
    price,
    image,
    affiliateUrl: `${url}?tag=${PARTNER_TAG}`
  };
}

/* ===============================
   EXPORT PRINCIPAL
   =============================== */
export async function getAmazonPrice(asin) {
  try {
    // 1️⃣ tenta PA-API
    const apiData = await getFromApi(asin);
    if (apiData) return apiData;

    // 2️⃣ fallback scraping
    console.warn(`⚠️ PA-API indisponível para ${asin}, usando scraping`);
    return await getFromScraping(asin);

  } catch (error) {
    console.error(`❌ Falha total ASIN ${asin}:`, error.message);
    return null;
  }
}
