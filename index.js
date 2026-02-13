import "dotenv/config";
import fs from "fs";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";

// Configurações via Variáveis de Ambiente
const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "30", 10);
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || "2500", 10);

/**
 * Utilitário para pausa entre requisições
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Carrega a lista de produtos do arquivo local
 */
function loadProducts() {
  try {
    return JSON.parse(fs.readFileSync("./products.json", "utf-8"));
  } catch (error) {
    console.error("❌ Erro ao ler products.json:", error.message);
    return [];
  }
}

/**
 * Função principal de verificação
 */
async function checkOnce() {
  const products = loadProducts();
  if (products.length === 0) {
    console.warn("⚠️ Nenhum produto encontrado para monitorar.");
    return;
  }

  console.log(`🚀 Iniciando ciclo: ${products.length} produtos em monitoramento`);

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    let productData = null;
    
    const progress = `[${i + 1}/${products.length}]`;

    // Lógica de Identificação por Plataforma
    try {
      if (product.platform === "amazon") {
        if (!product.asin) throw new Error("Atributo 'asin' ausente no JSON");
        productData = await fetchAmazonProduct(product.asin);
      } 
      else if (product.platform === "mercadolivre") {
        if (!product.mlId) throw new Error("Atributo 'mlId' ausente no JSON");
        productData = await fetchMLProduct(product.mlId);
      } 
      else if (product.platform === "shopee") {
        if (!product.itemId || !product.shopId) {
          throw new Error("Atributos 'itemId' ou 'shopId' ausentes no JSON");
        }
        productData = await fetchShopeeProduct(product.itemId, product.shopId);
      } 
      else {
        console.warn(`${progress} ⚠️ Plataforma desconhecida:`, product.platform);
        continue;
      }

      // Se capturou dados com sucesso, processa a notificação
      if (productData) {
        await notifyIfPriceDropped(productData);
      } else {
        console.warn(`${progress} ℹ️ Dados não obtidos para: ${product.asin || product.mlId || product.itemId}`);
      }

    } catch (e) {
      console.error(`${progress} ❌ Falha crítica no processamento:`, e.message);
    }

    // Delay entre produtos para evitar bloqueios de IP/API
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`✅ Ciclo finalizado. Próxima verificação em ${CHECK_INTERVAL_MINUTES} minutos.`);
}

// Inicialização do Monitor
console.log("🟢 Bot de Monitoramento Iniciado");
console.log(`⚙️ Intervalo: ${CHECK_INTERVAL_MINUTES}min | Delay: ${REQUEST_DELAY_MS}ms`);

// Executa a primeira vez imediatamente
checkOnce();

// Agenda as próximas execuções
setInterval(checkOnce, CHECK_INTERVAL_MINUTES * 60 * 1000);
