import axios from "axios";
import * as cheerio from "cheerio";

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const credentialId = process.env.AMAZON_CREDENTIAL_ID;
  const credentialSecret = process.env.AMAZON_CREDENTIAL_SECRET;
  const authUrl = "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token";
  const auth = Buffer.from(`${credentialId}:${credentialSecret}`).toString("base64");
  
  const { data } = await axios.post(authUrl, "grant_type=client_credentials&scope=creatorsapi/default", {
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": `Basic ${auth}` }
  });
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
  return cachedToken;
}

export async function fetchAmazonProduct(asin) {
  const marketplace = process.env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const partnerTag = process.env.AMAZON_PARTNER_TAG;
  const version = process.env.AMAZON_CREDENTIAL_VERSION || "2.1";
  const timeout = parseInt(process.env.AMAZON_TIMEOUT_MS || "15000", 10);

  try {
    const token = await getAccessToken();
    const { data } = await axios.post("https://creatorsapi.amazon/catalog/v1/getItems", {
      itemIds: [asin],
      marketplace: marketplace,
      partnerTag: partnerTag,
      resources: ["itemInfo.title", "images.primary.small", "offersV2.listings.price"]
    }, {
      headers: { "Authorization": `Bearer ${token}, Version ${version}`, "x-marketplace": marketplace, "Content-Type": "application/json" },
      timeout: timeout
    });

    const item = data?.itemsResult?.items?.[0]; 
    if (item && item.offersV2?.listings?.[0]?.price) {
      return {
        id: `amazon_${asin}`,
        title: item.itemInfo.title.displayValue,
        price: parseFloat(item.offersV2.listings[0].price.amount),
        url: `https://${marketplace}/dp/${asin}?tag=${partnerTag}`,
        image: item.images?.primary?.small?.url || null,
        platform: "amazon",
        method: "api"
      };
    }
    throw new Error("API não retornou oferta");
  } catch (error) {
    // Se a API falhar (Erro 400/403), o Scraper assume
    return await scrapeAmazon(asin, marketplace, partnerTag, timeout);
  }
}

async function scrapeAmazon(asin, marketplace, partnerTag, timeout) {
  const url = `https://${marketplace}/dp/${asin}?tag=${partnerTag}`;
  const { data } = await axios.get(url, {
    headers: { 
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9"
    },
    timeout: timeout
  });
  const $ = cheerio.load(data);
  const whole = $(".a-price-whole").first().text().replace(/[^\d]/g, "");
  const fraction = $(".a-price-fraction").first().text().replace(/[^\d]/g, "") || "00";
  
  if (!whole) return null;

  return { 
    id: `amazon_${asin}`, 
    title: $("#productTitle").text().trim() || "Produto Amazon", 
    price: parseFloat(`${whole}.${fraction}`), 
    url, 
    image: $("#landingImage").attr("src") || null, 
    platform: "amazon",
    method: "scraper" 
  };
}
