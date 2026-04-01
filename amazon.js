import axios from "axios";
import * as cheerio from "cheerio";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";
import {
  retryWithBackoff,
  isBlockedOrErrorPage,
  getRandomUserAgent
} from "./retry.js";

const PROXY_URL = process.env.PROXY_URL || null;

function getProxyAgents() {
  if (!PROXY_URL) return {};
  return {
    httpAgent: new HttpProxyAgent(PROXY_URL),
    httpsAgent: new HttpsProxyAgent(PROXY_URL),
  };
}

let cachedToken = null;
let tokenExpiry = 0;
let blockadeStart = 0;

const BLOCKADE_WAIT_MS = 5 * 60 * 1000; // 5 minutos

// ✅ V3.1 LWA (Login with Amazon)
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.AMAZON_CREDENTIAL_ID;
  const clientSecret = process.env.AMAZON_CREDENTIAL_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("❌ AMAZON_CREDENTIAL_ID ou AMAZON_CREDENTIAL_SECRET não configurados no Railway");
  }

  // ✅ Endpoint de autenticação LwA — correto para v3.1
  const authUrl = "https://api.amazon.com/auth/o2/token";

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "creatorsapi::default"
  });

  try {
    const { data } = await axios.post(authUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000,
      ...getProxyAgents()
    });

    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

    return cachedToken;
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message;
    // ⚠️ Não logar token aqui - pode expor credenciais em produção
    console.error(`❌ Erro na autenticação V3.1: ${errorMsg}`);
    throw new Error(`Falha na autenticação Amazon V3.1: ${errorMsg}`);
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
  if (!title) title = $("h1 .product-title").text().trim();
  if (!title) title = $("span[data-feature-name='title']").text().trim();
  if (!title) title = $("h1").first().text().trim();

  return title || "Produto Amazon";
}

function extractImage(html) {
  const $ = cheerio.load(html);

  let image = $("#landingImage").attr("src");
  if (!image) image = $("img.a-dynamic-image").first().attr("src");
  if (!image) image = $("[data-old-hires]").first().attr("src");

  return image || null;
}

export async function fetchAmazonProduct(asin) {
  if (blockadeStart && Date.now() - blockadeStart < BLOCKADE_WAIT_MS) {
    const remaining = Math.round((BLOCKADE_WAIT_MS - (Date.now() - blockadeStart)) / 1000);
    throw new Error(`Amazon em cooldown. Restam ${remaining}s.`);
  }

  const marketplace = process.env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const partnerTag = process.env.AMAZON_PARTNER_TAG;

  if (!partnerTag) {
    throw new Error("❌ AMAZON_PARTNER_TAG não configurado");
  }

  try {
    const token = await getAccessToken();

    // ✅ ENDPOINT CORRETO DA CREATORS API v3.1
    // O host creatorsapi.amazon.com não existe como DNS público.
    // O endpoint real é affiliate-program.amazon.com/paapi/v5/getItems
    const apiUrl = "https://affiliate-program.amazon.com/paapi/v5/getItems";

    const { data } = await axios.post(
      apiUrl,
      {
        itemIds: [asin],
        marketplace: marketplace,
        partnerTag: partnerTag,
        partnerType: "Associates",
        resources: [
          "itemInfo.title",
          "images.primary.small",
          "offersV2.listings.price"
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: parseInt(process.env.AMAZON_TIMEOUT_MS || "30000", 10),
        ...getProxyAgents()
      }
    );

    const item = data?.itemsResult?.items?.[0];

    if (item && item.itemInfo?.title && item.offersV2?.listings?.[0]?.price) {
      blockadeStart = 0;
      return {
        id: `amazon_${asin}`,
        title: item.itemInfo.title.displayValue,
        price: parseFloat(item.offersV2.listings[0].price.amount),
        url: `https://${marketplace}/dp/${asin}?tag=${partnerTag}`,
        image: item.images?.primary?.small?.url || null,
        platform: "amazon",
        method: "api",
        apiVersion: "v3.1"
      };
    }

    // ⚠️ Item sem oferta de preço — pode ser elegibilidade (< 10 vendas/30d)
    // ou produto sem estoque. Fallback para scraper.
    console.log(`⚠️ Amazon API (${asin}): sem offersV2 na resposta — tentando scraper...`);
    return await scrapeAmazonWithRetry(asin, marketplace, partnerTag);

  } catch (error) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;

    if (statusCode === 401) {
      console.error("❌ HTTP 401: Credenciais V3.1 inválidas ou expiradas");
      throw new Error("Autenticação falhou: verifique AMAZON_CREDENTIAL_ID/SECRET no Railway");
    }

    if (statusCode === 403) {
      const errorCode = errorData?.Errors?.[0]?.Code || errorData?.errors?.[0]?.code;

      if (errorCode === "AssociateNotEligible") {
        // ⚠️ Menos de 10 vendas qualificadas nos últimos 30 dias
        // A API retorna 403 neste caso — não é erro de código, é elegibilidade
        console.log(`⚠️ Amazon API: sem elegibilidade (< 10 vendas/30d) — usando scraper para ${asin}`);
        return await scrapeAmazonWithRetry(asin, marketplace, partnerTag);
      }

      blockadeStart = Date.now();
      console.warn(`⚠️ HTTP 403: IP bloqueado pela Amazon. Cooldown de 5 minutos ativado`);
      throw new Error("Amazon bloqueou o IP. Tentando scraper como fallback...");
    }

    if (statusCode === 400) {
      const errorCode = errorData?.Errors?.[0]?.Code;
      console.warn(`⚠️ HTTP 400: ${errorCode} - Verificar parâmetros da requisição`);
    }

    // Para erros de rede (ENOTFOUND, ECONNREFUSED, timeout, etc.)
    // loga como warn, não como erro — é um fallback esperado
    const isNetworkError = !statusCode;
    if (isNetworkError) {
      console.log(`⚠️ Amazon API indisponível (${error.message}) — usando scraper para ${asin}`);
    } else {
      console.warn(`⚠️ Amazon API Falhou (${statusCode}): ${error.message} — usando scraper para ${asin}`);
    }

    return await scrapeAmazonWithRetry(asin, marketplace, partnerTag);
  }
}

async function scrapeAmazonWithRetry(asin, marketplace, partnerTag) {
  return retryWithBackoff(
    () => scrapeAmazon(asin, marketplace, partnerTag),
    parseInt(process.env.AMAZON_MAX_RETRIES || "3", 10),
    parseInt(process.env.AMAZON_BACKOFF_BASE_MS || "1500", 10),
    parseInt(process.env.AMAZON_TIMEOUT_MS || "30000", 10),
    `Amazon Scraper (${asin})`
  );
}

async function scrapeAmazon(asin, marketplace, partnerTag) {
  const url = `https://${marketplace}/dp/${asin}?tag=${partnerTag}`;

  // Add ±20% jitter to the base delay to prevent pattern detection
  const baseDelay = parseInt(process.env.REQUEST_DELAY_MS || "8000", 10);
  const jitter = baseDelay * 0.2;
  const delay = baseDelay + Math.floor(Math.random() * jitter * 2) - jitter;
  if (delay > 0) await new Promise(r => setTimeout(r, delay));

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Referer": "https://www.amazon.com.br/",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "max-age=0",
      "Pragma": "no-cache",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"'
    },
    timeout: parseInt(process.env.AMAZON_TIMEOUT_MS || "30000", 10),
    ...getProxyAgents()
  });

  const blockReason = isBlockedOrErrorPage(data);
  if (blockReason) {
    blockadeStart = Date.now();
    throw new Error(`Página de bloqueio detectada no scraper [motivo: ${blockReason}]`);
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
