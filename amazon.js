import axios from "axios";
import * as cheerio from "cheerio";
import {
  retryWithBackoff,
  isBlockedOrErrorPage,
  getRandomUserAgent
} from "./retry.js";

let cachedToken = null;
let tokenExpiry = 0;
let blockadeStart = 0;

const BLOCKADE_WAIT_MS = 5 * 60 * 1000; // 5 minutos

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

function extractPrice(html) {
  const $ = cheerio.load(html);

  // Tentar múltiplos seletores para preço inteiro
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

  // Tentar múltiplos seletores para fração (centavos)
  let fraction = $(".a-price-fraction").first().text().replace(/[^\d]/g, "") || "00";
  if (fraction === "00") {
    fraction = $("[data-a-price-fraction]").first().attr("data-a-price-fraction")?.replace(/[^\d]/g, "") || "00";
  }

  if (!whole) return null;
  return parseFloat(`${whole}.${fraction}`);
}

function extractTitle(html) {
  const $ = cheerio.load(html);

  // Tentar múltiplos seletores para título
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

  // Tentar múltiplos seletores para imagem
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
  // Se bloqueado, aguardar antes de tentar
  if (blockadeStart && Date.now() - blockadeStart < BLOCKADE_WAIT_MS) {
    const remaining = Math.round((BLOCKADE_WAIT_MS - (Date.now() - blockadeStart)) / 1000);
    throw new Error(`Amazon bloqueada. Aguardando ${remaining}s antes de retry.`);
  }

  const marketplace = process.env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const partnerTag = process.env.AMAZON_PARTNER_TAG;
  const version = process.env.AMAZON_CREDENTIAL_VERSION || "3"; // v3 credentials compatível com SDK v1.2.0+

  try {
    const token = await getAccessToken();
    const { data } = await axios.post(
      "https://creatorsapi.amazon/catalog/v1/getItems",
      {
        itemIds: [asin],
        marketplace: marketplace,
        partnerTag: partnerTag,
        resources: ["itemInfo.title", "images.primary.small", "offersV2.listings.price"]
      },
      {
        headers: {
          "Authorization": `Bearer ${token}, Version ${version}`,
          "x-marketplace": marketplace,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const item = data?.itemsResult?.items?.[0];
    if (item && item.offersV2?.listings?.[0]?.price) {
      blockadeStart = 0; // Reset bloqueio
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
    // Se API falhar com 403, marcar bloqueio
    if (error.response?.status === 403) {
      blockadeStart = Date.now();
      console.warn("⚠️ Amazon: IP bloqueado (403). Aguardando 5 minutos.");
      throw new Error("Amazon bloqueou o IP. Pulando scrapers até recuperação.");
    }

    // Tentar scraper como fallback
    return await scrapeAmazonWithRetry(asin, marketplace, partnerTag);
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

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept-Language": "pt-BR,pt;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    timeout: 30000
  });

  // Validar se resposta é bloqueio ou página de erro
  if (isBlockedOrErrorPage(data)) {
    blockadeStart = Date.now();
    throw new Error("Página de bloqueio ou erro detectada");
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
