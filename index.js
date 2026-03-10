import "dotenv/config";
import fs from "fs";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";
import { cleanStaleEntries } from "./store.js";
import { initWhatsApp } from "./whatsapp.js";

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/.data";

// ─── RESET ML TOKENS ─────────────────────────────────────────────────────────
if (process.env.RESET_ML_TOKENS === "true") {
  const mlTokensPath = `${DATA_DIR}/ml_tokens_v2.json`;
  if (fs.existsSync(mlTokensPath)) {
    fs.unlinkSync(mlTokensPath);
    console.log("🗑️ Tokens ML deletados.");
  }
}

// ─── RESET STORE ─────────────────────────────────────────────────────────────
if (process.env.RESET_STORE === "true") {
  const storePath = `${DATA_DIR}/store.json`;
  if (fs.existsSync(storePath)) {
    fs.unlinkSync(storePath);
    console.log("🗑️ Store zerado com sucesso.");
  }
}

// ─── RESET WHATSAPP SESSION ──────────────────────────────────────────────────
// Para usar: adicione RESET_WA=true nas variáveis do Railway e faça deploy.
// Isso força novo QR code — use quando a sessão expirar ou número for trocado.
if (process.env.RESET_WA === "true") {
  const waAuthPath = `${DATA_DIR}/wa_auth`;
  if (fs.existsSync(waAuthPath)) {
    fs.rmSync(waAuthPath, { recursive: true, force: true });
    console.log("🗑️ Sessão WhatsApp removida. Novo QR Code será gerado.");
  }
}

const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "60", 10);
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || "4500", 10);
const BACKOFF_BASE = parseInt(process.env.AMAZON_BACKOFF_BASE_MS || "1200", 10);

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

  const activeIds = products.map(p =>
    p.platform === "amazon" ? `amazon_${p.asin}` :
    p.platform === "shopee" ? `shopee_${p.itemId}` :
    `ml_${p.mlId}`
  );
  await cleanStaleEntries(activeIds);

  let consecutiveErrors = 0;
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    let productData = null;
    const progress = `[${i + 1}/${products.length}]`;

    try {
      if (product.platform === "amazon") {
        if (!product.asin) throw new Error("asin ausente no JSON");
        productData = await fetchAmazonProduct(product.asin);
      } else if (product.platform === "mercadolivre") {
        if (!product.mlId) throw new Error("mlId ausente no JSON");
        productData = await fetchMLProduct(product.mlId);
      } else if (product.platform === "shopee") {
        if (!product.itemId || !product.shopId) throw new Error("itemId ou shopId ausentes");
        productData = await fetchShopeeProduct(product.itemId, product.shopId);
      } else {
        throw new Error(`Plataforma '${product.platform}' desconhecida`);
      }

      if (productData) {
        await notifyIfPriceDropped(productData);
        consecutiveErrors = 0;
      } else {
        throw new Error("API/Scraper não retornou dados válidos");
      }
    } catch (e) {
      consecutiveErrors++;
      console.error(`${progress} ❌ Falha (${product.platform || "?"}): ${e.message}`);
    }

    const dynamicDelay = REQUEST_DELAY_MS + consecutiveErrors * BACKOFF_BASE;
    await sleep(dynamicDelay);
  }

  console.log(`✅ Ciclo finalizado. Próxima verificação em ${CHECK_INTERVAL_MINUTES} minutos.`);
}

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────────
console.log("🟢 Monitor Synapse Iniciado");
console.log(`⚙️ Configurações: Intervalo ${CHECK_INTERVAL_MINUTES}m | Delay Base ${REQUEST_DELAY_MS}ms | Backoff ${BACKOFF_BASE}ms`);

// Inicia WhatsApp em paralelo (não bloqueia o monitor)
initWhatsApp().catch(err => {
  console.error("❌ Erro ao iniciar WhatsApp:", err.message);
});

// Aguarda 5s para dar tempo ao WA conectar antes do primeiro ciclo
setTimeout(() => {
  checkOnce();
  setInterval(checkOnce, CHECK_INTERVAL_MINUTES * 60 * 1000);
}, 5000);
