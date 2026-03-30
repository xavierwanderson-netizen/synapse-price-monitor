import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { initWhatsApp } from "./whatsapp.js";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";
import { getLastPrice } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, "products.json");

// ✅ Volume persistente do Railway
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data";

// ✅ Controle de concorrência
let isRunning = false;
const MONITOR_INTERVAL = 60000; // 1 minuto entre ciclos

// ✅ Proteção contra crashes globais
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ [CRÍTICO] Promise rejection não tratada:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ [CRÍTICO] Exceção não tratada:", error);
  isRunning = false;
});

async function loadProducts() {
  try {
    const data = await fs.readFile(PRODUCTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Erro ao carregar products.json:", err.message);
    return [];
  }
}

async function fetchProduct(product) {
  const { asin, itemId, shopId, mlId, platform } = product;

  if (!platform) {
    console.error("❌ Produto sem plataforma definida:", product);
    return null;
  }

  try {
    let result = null;

    // ✅ AMAZON: asin
    if (platform.toLowerCase() === "amazon" && asin) {
      result = await fetchAmazonProduct(asin);
    }
    // ✅ SHOPEE: itemId + shopId
    else if (platform.toLowerCase() === "shopee" && itemId && shopId) {
      result = await fetchShopeeProduct(parseInt(itemId), parseInt(shopId));
    }
    // ✅ MERCADO LIVRE: mlId
    else if ((platform.toLowerCase() === "mercadolivre" || platform.toLowerCase() === "ml") && mlId) {
      result = await fetchMLProduct(mlId);
    }
    // ❌ Estrutura incompleta
    else {
      const required = {
        amazon: "asin",
        shopee: "itemId + shopId",
        mercadolivre: "mlId",
        ml: "mlId"
      };
      console.warn(`⚠️ ${platform}: Faltam parâmetros obrigatórios (${required[platform.toLowerCase()]})`);
      return null;
    }

    // Se falhou na fetch
    if (!result) {
      return null;
    }

    // ✅ Gera ID único baseado na plataforma
    if (asin) result.id = `amazon_${asin}`;
    else if (itemId && shopId) result.id = `shopee_${itemId}`;
    else if (mlId) result.id = `ml_${mlId}`;

    return result;
  } catch (err) {
    const identifier = asin || mlId || `shopee_${itemId}` || JSON.stringify(product);
    console.error(`❌ Erro ao processar ${identifier}:`, err.message);
    return null;
  }
}

async function monitorCycle() {
  // ✅ Proteção contra sobreposição
  if (isRunning) {
    console.warn("⚠️ Ciclo anterior ainda em execução, pulando...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`\n🔄 [${new Date().toISOString()}] Iniciando ciclo de monitoramento...`);

    const products = await loadProducts();
    if (!products || !products.length) {
      console.warn("⚠️ Nenhum produto para monitorar");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const product of products) {
      try {
        const result = await fetchProduct(product);

        if (!result || result.price === null || result.price === undefined) {
          failCount++;
          const id = product.asin || product.mlId || `shopee_${product.itemId}`;
          console.warn(`⚠️ ${id}: Sem preço disponível`);
          continue;
        }

        successCount++;

        // ✅ Notifica se houver mudança
        await notifyIfPriceDropped(result);

        // ✅ Delay entre requests
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        failCount++;
        console.error(`❌ Erro ao processar produto:`, err.message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Ciclo concluído em ${elapsed}s (✅ ${successCount} | ❌ ${failCount})\n`);
  } catch (err) {
    console.error("❌ Erro no ciclo de monitoramento:", err.message);
  } finally {
    isRunning = false;
  }
}

async function initWhatsAppSafe() {
  try {
    console.log("📱 Inicializando WhatsApp...");
    await initWhatsApp();
    console.log("✅ WhatsApp pronto");
  } catch (err) {
    console.error("❌ Erro ao inicializar WhatsApp:", err.message);
    console.log("⚠️ Continuando sem WhatsApp (alertas desabilitados)");
  }
}

async function startMonitor() {
  console.log("═══════════════════════════════════════════════════");
  console.log("🚀 Monitor Synapse Iniciado");
  console.log(`📁 Diretório de dados: ${DATA_DIR}`);
  console.log(`⏱️  Intervalo de monitoramento: ${MONITOR_INTERVAL / 1000}s`);
  console.log("═══════════════════════════════════════════════════");

  // ✅ Inicializa WhatsApp
  await initWhatsAppSafe();

  // ✅ Primeiro ciclo imediato
  await monitorCycle();

  // ✅ Próximos ciclos em intervalo
  setInterval(() => {
    monitorCycle().catch(err => {
      console.error("❌ Erro não capturado em monitorCycle:", err);
      isRunning = false;
    });
  }, MONITOR_INTERVAL);
}

// ✅ Inicia o monitor
startMonitor().catch(err => {
  console.error("❌ Falha crítica ao iniciar monitor:", err.message);
  process.exit(1);
});
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

// Healthcheck (obrigatório pro Railway)
app.get("/health", (c) => c.json({ status: "ok" }));

// Endpoint simples (opcional)
app.get("/", (c) => {
  return c.json({
    status: "running",
    service: "price-monitor",
    timestamp: new Date().toISOString()
  });
});

// 🚨 IMPORTANTE: usar porta do Railway
const PORT = process.env.PORT || 3000;

serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`🌐 HTTP server rodando na porta ${PORT}`);
