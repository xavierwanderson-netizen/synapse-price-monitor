import axios from "axios";
import * as cheerio from "cheerio";
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  retryWithBackoff,
  isBlockedOrErrorPage,
  getRandomUserAgent
} from "./retry.js";

let cachedToken = null;
let tokenExpiry = 0;
let blockadeStart = 0;

const BLOCKADE_WAIT_MS = 5 * 60 * 1000; // 5 minutos

// Configuração do Agente de Proxy (só cria se a variável existir)
const proxyUrl = process.env.PROXY_URL;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  
  const credentialId = process.env.AMAZON_CREDENTIAL_ID;
  const credentialSecret = process.env.AMAZON_CREDENTIAL_SECRET;
  
  const authUrl = "https://api.amazon.com/auth/o2/token";

  try {
    const requestConfig = {
      headers: { "Content-Type": "application/json" }
    };
    
    // Injeta o proxy na requisição de token, se configurado
    if (proxyAgent) requestConfig.httpsAgent = proxyAgent;

    const { data } = await axios.post(
      authUrl,
      {
        grant_type: "client_credentials",
        client_id: credentialId,
        client_secret: credentialSecret,
        scope: "creatorsapi::default" 
      },
      requestConfig
    );
    
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; 
    return cachedToken;
  } catch (error) {
    throw new Error(`Falha ao obter token V3: ${error.response?.data?.error_description || error.message}`);
  }
}

function extractPrice(html) {
  const $ = cheerio.load(html);

  let whole = $(".a-price-whole").first().text().replace(/[^\d]/g, "");
  if (!whole) {
    whole = $("[data-a-price-whole]").first().attr("data-a-price-whole")?.replace(/[^\d]/g, "") || "";
  }
  if (!whole) {
    whole = $(".a-price.a-text-price.a-size-medium.apexPriceToPay")
      .first()
      .text()
      .match(/\d+/)?.[0] || "";
  }

  let fraction = $(".a-price-fraction").first().text().replace(/[^\d]/g, "") || "00";
  if (fraction === "00") {
    fraction = $("[data-a-price-fraction]").first().attr("data-a-price-fraction")?.replace(/[^\d]/g, "") || "00";
  }

  if (!whole) return null;
  return parseFloat(`${whole}.${fraction}`);
}

function extractTitle(html) {
  const $ = cheerio.load(html);

  let title = $("#productTitle").text().trim();
  if (!title) {
    title = $("h1 .product-title").text().trim();
  }
  if (!title) {
    title = $("span[data-feature-name='title']").text().trim();
  }
  if (!title) {
    title = $("h1").first().text().trim();
  }

  return title || "Produto Amazon";
}

function extractImage(html) {
  const $ = cheerio.load(html);

  let image = $("#landingImage").attr("src");
  if (!image) {
    image = $("img.a-dynamic-image").first().attr("src");
  }
  if (!image) {
    image = $("[data-old-hires]").first().attr("src");
  }

  return image || null;
}

export async function fetchAmazonProduct(asin) {
  if (blockadeStart && Date.now() - blockadeStart < BLOCKADE_WAIT_MS) {
    const remaining = Math.round((BLOCKADE_WAIT_MS - (Date.now() - blockadeStart)) / 1000);
    throw new Error(`Amazon em cooldown. Restam ${remaining}s.`);
  }

  const marketplace = process.env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const partnerTag = process.env.AMAZON_PARTNER_TAG;

  try {
    const token = await getAccessToken();
    
    const requestConfig = {
        headers: {
          "Authorization": `Bearer ${token}`, 
          "x-marketplace": marketplace,
          "Content-Type": "application/json"
        },
        timeout: 20000
    };

    // Injeta o proxy na chamada da API Creators, se configurado
    if (proxyAgent) requestConfig.httpsAgent = proxyAgent;

    const { data } = await axios.post(
      "https://creatorsapi.amazon.com/catalog/v1/getItems", 
      {
        itemIds: [asin],
        marketplace: marketplace,
        partnerTag: partnerTag,
        resources: ["itemInfo.title", "images.primary.small", "offersV2.listings.price"]
      },
      requestConfig
    );

    const item = data?.itemsResult?.items?.[0];
    if (item && item.offersV2?.listings?.[0]?.price) {
      blockadeStart = 0; 
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
    throw new Error("API não retornou oferta válida");
  } catch (error) {
    if (error.response?.status === 403) {
      blockadeStart = Date.now();
      console.warn("⚠️ Amazon API: IP bloqueado (403). Tentando Scraper como fallback...");
    } else {
      console.warn(`⚠️ Amazon API Falhou: ${error.message}. Tentando Scraper...`);
    }

    try {
      const scrapedData = await scrapeAmazonWithRetry(asin, marketplace, partnerTag);
      if (scrapedData) blockadeStart = 0; 
      return scrapedData;
    } catch (scraperError) {
      throw new Error(`Falha Total Amazon: API (${error.message}) + Scraper (${scraperError.message})`);
    }
  }
}

async function scrapeAmazonWithRetry(asin, marketplace, partnerTag) {
  return retryWithBackoff(
    () => scrapeAmazon(asin, marketplace, partnerTag),
    3,
    2000,
    20000,
    `Amazon Scraper (${asin})`
  );
}

async function scrapeAmazon(asin, marketplace, partnerTag) {
  const url = `https://${marketplace}/dp/${asin}?tag=${partnerTag}`;

  const requestConfig = {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "Referer": `https://${marketplace}/`
    },
    timeout: 30000
  };

  // Injeta o proxy no scraper HTML, se configurado
  if (proxyAgent) requestConfig.httpsAgent = proxyAgent;

  const { data } = await axios.get(url, requestConfig);

  if (isBlockedOrErrorPage(data)) {
    blockadeStart = Date.now();
    throw new Error("Página de bloqueio detectada no scraper.");
  }

  const price = extractPrice(data);
  if (!price) return null;

  const title = extractTitle(data);
  const image = extractImage(data);

  return {
    id: `amazon_${asin}`,
    title: title,
    price: price,
    url: url,
    image: image,
    platform: "amazon",
    method: "scraper"
  };
}
