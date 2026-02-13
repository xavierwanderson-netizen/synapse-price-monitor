import axios from "axios";
import * as cheerio from "cheerio";

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Obtém o Token OAuth 2.0 (Válido por 1h)
 */
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const credentialId = process.env.AMAZON_CREDENTIAL_ID;
  const credentialSecret = process.env.AMAZON_CREDENTIAL_SECRET;
  
  // Endpoint de autenticação para a região NA (Brasil incluído)
  const authUrl = "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token";
  const auth = Buffer.from(`${credentialId}:${credentialSecret}`).toString("base64");
  
  const { data } = await axios.post(authUrl, 
    "grant_type=client_credentials&scope=creatorsapi/default", 
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`
      }
    }
  );

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
  return cachedToken;
}

export async function fetchAmazonProduct(asin) {
  const marketplace = "www.amazon.com.br";
  const partnerTag = process.env.AMAZON_PARTNER_TAG;
  const credVersion = process.env.AMAZON_CREDENTIAL_VERSION || "2.1"; // NA: 2.1

  try {
    const token = await getAccessToken();
    
    // Chamada GetItems usando resources offersV2
    const { data } = await axios.post(
      "https://creatorsapi.amazon/catalog/v1/getItems",
      {
        itemIds: [asin],
        marketplace: marketplace,
        partnerTag: partnerTag,
        resources: [
          "itemInfo.title", 
          "images.primary.small", 
          "offersV2.listings.price", 
          "offersV2.listings.availability"
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${token}, Version ${credVersion}`, // Formato obrigatório
          "x-marketplace": marketplace,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    // Tratamento de erro específico da API
    if (data.errors) {
      throw new Error(data.errors[0].message);
    }

    const item = data?.itemsResult?.items?.[0]; // Estrutura v1/getItems
    if (item && item.offersV2?.listings?.[0]?.price) {
      return {
        id: `amazon_${asin}`,
        title: item.itemInfo?.title?.displayValue || "Produto Amazon",
        price: parseFloat(item.offersV2.listings[0].price.amount),
        url: `https://www.amazon.com.br/dp/${asin}?tag=${partnerTag}`,
        image: item.images?.primary?.small?.url || null,
        platform: "amazon",
        method: "creators_api"
      };
    }
    
    throw new Error("Preço não encontrado na API");

  } catch (error) {
    console.warn(`⚠️ Amazon API (${asin}) falhou, iniciando Scraper... Motivo: ${error.message}`);
    return await scrapeAmazon(asin);
  }
}

/**
 * Fallback via Scraping (Cheerio)
 */
async function scrapeAmazon(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  const url = `https://www.amazon.com.br/dp/${asin}?tag=${tag}`;
  
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9"
      },
      timeout: 15000
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
  } catch (err) {
    console.error(`❌ Falha total Amazon (${asin}):`, err.message);
    return null;
  }
}
