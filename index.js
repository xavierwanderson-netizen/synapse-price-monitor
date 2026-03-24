import "dotenv/config";
import fs from "fs";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";

// ─── RESET TEMPORÁRIO DE TOKENS ML ───────────────────────────────────────────
// Para usar: adicione RESET_ML_TOKENS=true nas variáveis do Railway e faça deploy.
// Após ver "🗑️ Tokens ML deletados" nos logs, remova a variável e faça novo deploy.
if (process.env.RESET_ML_TOKENS === "true") {
  const mlTokensPath = "/.data/ml_tokens_v2.json";
  if (fs.existsSync(mlTokensPath)) {
    fs.unlinkSync(mlTokensPath);
    console.log("🗑️ Tokens ML deletados. Próximo ciclo usará o ML_INITIAL_CODE.");
  } else {
    console.log("ℹ️ RESET_ML_TOKENS ativo, mas nenhum arquivo de token encontrado.");
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Configurações via Variáveis de Ambiente
const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "30", 10);
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || "2500", 10);
const BACKOFF_BASE = parseInt(process.env.AMAZON_BACKOFF_BASE_MS || "1000", 10);
const MAX_BACKOFF_MS = 30000; // Limitar backoff máximo a 30s
const PRODUCT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutos por produto
const MAX_CONSECUTIVE_ERRORS = 5; // Máximo de erros antes de skip

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function logTimestamp(msg) {
  const now = new Date().toISOString();
  console.log(`${now} ${msg}`);
}

function loadProducts() {
  try {
    return JSON.parse(fs.readFileSync("./products.json", "utf-8"));
  } catch (error) {
    console.error("❌ Erro fatal ao ler products.json:", error.message);
    return [];
  }
}

// Rastreador de falhas por produto (por ciclo)
const failureTracker = {};

async function checkOnce() {
  const products = loadProducts();
  if (products.length === 0) return;

  const cycleStart = Date.now();
  logTimestamp(`🚀 Iniciando ciclo: ${products.length} produtos em monitoramento`);

  let successCount = 0;
  let failureCount = 0;
  let skipCount = 0;
  let consecutiveErrors = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const productKey = `${product.platform}_${product.asin || product.mlId || product.itemId}`;
    const progress = `[${i + 1}/${products.length}]`;

    // Verificar se produto deve ser skippado por muitas falhas
    if (failureTracker[productKey] && failureTracker[productKey] >= MAX_CONSECUTIVE_ERRORS) {
      logTimestamp(`${progress} ⏭️ SKIP (${product.platform}): Produto com ${MAX_CONSECUTIVE_ERRORS}+ falhas. Pulando este ciclo.`);
      skipCount++;
      failureTracker[productKey] = 0; // Reset after skip
      continue;
    }

    let productData = null;

    try {
      // Validações de Integridade do JSON
      if (product.platform === "amazon") {
        if (!product.asin) throw new Error("asin ausente no JSON");
        productData = await Promise.race([
          fetchAmazonProduct(product.asin),
          sleep(PRODUCT_TIMEOUT_MS).then(() => {
            throw new Error("Timeout Amazon (2min)");
          })
        ]);
      } else if (product.platform === "mercadolivre") {
        if (!product.mlId) throw new Error("mlId ausente no JSON");
        productData = await Promise.race([
          fetchMLProduct(product.mlId),
          sleep(PRODUCT_TIMEOUT_MS).then(() => {
            throw new Error("Timeout Mercado Livre (2min)");
          })
        ]);
      } else if (product.platform === "shopee") {
        if (!product.itemId || !product.shopId) {
          throw new Error("itemId ou shopId ausentes no JSON");
        }
        productData = await Promise.race([
          fetchShopeeProduct(product.itemId, product.shopId),
          sleep(PRODUCT_TIMEOUT_MS).then(() => {
            throw new Error("Timeout Shopee (2min)");
          })
        ]);
      } else {
        throw new Error(`Plataforma '${product.platform}' desconhecida`);
      }

      // Processamento de Notificação
      if (productData) {
        await notifyIfPriceDropped(productData);
        consecutiveErrors = 0;
        failureTracker[productKey] = 0;
        successCount++;
        logTimestamp(`${progress} ✅ OK (${product.platform})`);
      } else {
        throw new Error("API/Scraper não retornou dados válidos");
      }
    } catch (e) {
      consecutiveErrors++;
      failureTracker[productKey] = (failureTracker[productKey] || 0) + 1;
      failureCount++;
      logTimestamp(`${progress} ❌ Falha #${failureTracker[productKey]} (${product.platform}): ${e.message}`);
    }

    // Cálculo de Delay Dinâmico com Backoff Exponencial (limitado a 30s)
    const dynamicDelay = Math.min(REQUEST_DELAY_MS + consecutiveErrors * BACKOFF_BASE, MAX_BACKOFF_MS);
    await sleep(dynamicDelay);
  }

  const cycleDuration = Math.round((Date.now() - cycleStart) / 1000);
  logTimestamp(
    `✅ Ciclo finalizado em ${cycleDuration}s | ✅ ${successCount} | ❌ ${failureCount} | ⏭️ ${skipCount} | ` +
    `Próxima: ${CHECK_INTERVAL_MINUTES}min`
  );
}

console.log("🟢 Monitor Synapse Iniciado");
console.log(`⚙️ Configurações: Intervalo ${CHECK_INTERVAL_MINUTES}m | Delay Base ${REQUEST_DELAY_MS}ms | Backoff ${BACKOFF_BASE}ms`);

checkOnce();
setInterval(checkOnce, CHECK_INTERVAL_MINUTES * 60 * 1000);
