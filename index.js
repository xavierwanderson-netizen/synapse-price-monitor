import "dotenv/config";
import fs from "fs";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";

// Configurações via Variáveis de Ambiente
const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "30", 10);
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || "2500", 10);
const BACKOFF_BASE = parseInt(process.env.AMAZON_BACKOFF_BASE_MS || "1000", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProducts() {
  try {
    return JSON.parse(fs.readFileSync("./products.json", "utf-8"));
  } catch (error) {
    console.error("❌ Erro fatal ao ler products.json:", error.message);
    return [];
  }
}

async function checkOnce() {
  const products = loadProducts();
  if (products.length === 0) return;

  console.log(`🚀 Iniciando ciclo: ${products.length} produtos em monitoramento`);
  
  let consecutiveErrors = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    let productData = null;
    const progress = `[${i + 1}/${products.length}]`;

    try {
      // Validações de Integridade do JSON (Segurança Anti-Retrocesso)
      if (product.platform === "amazon") {
        if (!product.asin) throw new Error("asin ausente no JSON");
        productData = await fetchAmazonProduct(product.asin);
      } 
      else if (product.platform === "mercadolivre") {
        if (!product.mlId) throw new Error("mlId ausente no JSON");
        productData = await fetchMLProduct(product.mlId);
      } 
      else if (product.platform === "shopee") {
        if (!product.itemId || !product.shopId) {
          throw new Error("itemId ou shopId ausentes no JSON");
        }
        productData = await fetchShopeeProduct(product.itemId, product.shopId);
      } 
      else {
        throw new Error(`Plataforma '${product.platform}' desconhecida`);
      }

      // Processamento de Notificação
      if (productData) {
        await notifyIfPriceDropped(productData);
        consecutiveErrors = 0; // Sucesso reseta o backoff
      } else {
        throw new Error("API/Scraper não retornou dados válidos");
      }

    } catch (e) {
      consecutiveErrors++;
      console.error(`${progress} ❌ Falha (${product.platform || 'Desconhecida'}): ${e.message}`);
    }

    // Cálculo de Delay Dinâmico com Backoff Exponencial
    const dynamicDelay = REQUEST_DELAY_MS + (consecutiveErrors * BACKOFF_BASE);
    await sleep(dynamicDelay);
  }

  console.log(`✅ Ciclo finalizado. Próxima verificação em ${CHECK_INTERVAL_MINUTES} minutos.`);
}

console.log("🟢 Monitor Synapse Iniciado");
console.log(`⚙️ Configurações: Intervalo ${CHECK_INTERVAL_MINUTES}m | Delay Base ${REQUEST_DELAY_MS}ms | Backoff ${BACKOFF_BASE}ms`);

checkOnce();
setInterval(checkOnce, CHECK_INTERVAL_MINUTES * 60 * 1000);
