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

// ✅ V3.1 LWA (Login with Amazon) - CORRETO PARA SUAS CREDENCIAIS
async function getAccessToken() {
  // Retorna token em cache se ainda válido
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  
  const clientId = process.env.AMAZON_CREDENTIAL_ID;
  const clientSecret = process.env.AMAZON_CREDENTIAL_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("❌ AMAZON_CREDENTIAL_ID ou AMAZON_CREDENTIAL_SECRET não configurados no Railway");
  }

  // ✅ ENDPOINT CORRETO PARA V3.1: api.amazon.com (não amazoncognito)
  const authUrl = "https://api.amazon.com/auth/o2/token";
  
  // ✅ FORMATO CORRETO: URLSearchParams com scope creatorsapi::default (:: não /)
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "creatorsapi::default"  // ✅ :: (dois-pontos-duplos)
  });

  try {
    const { data } = await axios.post(authUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    });

    cachedToken = data.access_token;
    // Token expires_in é em segundos, converte para ms com 1 min de margem
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    
    return cachedToken;
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message;
    console.error(`❌ Erro na autenticação V3.1: ${errorMsg}`);
    throw new Error(`Falha na autenticação Amazon V3.1: ${errorMsg}`);
  }
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
    throw new Error(`Amazon em cooldown. Restam ${remaining}s.`);
  }

  const marketplace = process.env.AMAZON_MARKETPLACE || "www.amazon.com.br";
  const partnerTag = process.env.AMAZON_PARTNER_TAG;

  if (!partnerTag) {
    throw new Error("❌ AMAZON_PARTNER_TAG não configurado");
  }

  try {
    const token = await getAccessToken();
    
    // ✅ URL CORRIGIDA PARA V3.1: creatorsapi.amazon.com (com .com no final)
    const apiUrl = "https://creatorsapi.amazon.com/catalog/v1/getItems";
    
    const { data } = await axios.post(
      apiUrl,
      {
        itemIds: [asin],
        marketplace: marketplace,
        partnerTag: partnerTag,
        resources: [
          "itemInfo.title",
          "images.primary.small",
          "offersV2.listings.price"
        ]
      },
      {
        headers: {
          // ✅ HEADER CORRETO V3.1: Bearer token APENAS (SEM versão no header)
          "Authorization": `Bearer ${token}`,
          "x-marketplace": marketplace,
          "Content-Type": "application/json"
        },
        timeout: parseInt(process.env.AMAZON_TIMEOUT_MS || "30000", 10)
      }
    );

    const item = data?.itemsResult?.items?.[0];
    if (item && item.itemInfo?.title && item.offersV2?.listings?.[0]?.price) {
      blockadeStart = 0; // Reset cooldown ao sucesso
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
    
    // Item não tem preço (out of stock, erro, etc)
    throw new Error("API não retornou oferta válida (item.offersV2 vazio ou sem preço)");
    
  } catch (error) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    // Tratamento específico para erros da API
    if (statusCode === 401) {
      console.error("❌ HTTP 401: Credenciais V3.1 inválidas ou expiradas");
      throw new Error("Autenticação falhou: verifique AMAZON_CREDENTIAL_ID/SECRET no Railway");
    }
    
    if (statusCode === 403) {
      const errorCode = errorData?.Errors?.[0]?.Code;
      
      if (errorCode === "AssociateNotEligible") {
        console.warn("⚠️ HTTP 403: AssociateNotEligible - Você precisa de 10 vendas em 30 dias");
        throw new Error("Amazon: Sua conta não tem 10 vendas qualificadas em 30 dias (elegibilidade)");
      }
      
      // IP bloqueado
      blockadeStart = Date.now();
      console.warn("⚠️ HTTP 403: IP bloqueado pela Amazon. Cooldown de 5 minutos ativado");
      throw new Error("Amazon bloqueou o IP. Tentando scraper como fallback...");
    }
    
    if (statusCode === 400) {
      const errorCode = errorData?.Errors?.[0]?.Code;
      console.warn(`⚠️ HTTP 400: ${errorCode} - Verificar parâmetros da requisição`);
    }
    
    // Qualquer outro erro: tentar scraper como fallback
    console.warn(`⚠️ Amazon API Falhou (${statusCode || 'erro desconhecido'}): ${error.message}. Tentando Scraper...`);
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

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"
    },
    timeout: parseInt(process.env.AMAZON_TIMEOUT_MS || "30000", 10)
  });

  // Validar se resposta é bloqueio ou página de erro
  if (isBlockedOrErrorPage(data)) {
    blockadeStart = Date.now();
    throw new Error("Página de bloqueio detectada no scraper");
  }

  const price = extractPrice(data);
  if (!price) return null; // Produto sem preço (out of stock, etc)

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
