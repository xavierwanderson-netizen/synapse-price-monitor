import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { initWhatsApp } from "./whatsapp.js";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";
import { getStore, updatePrice, markNotified, isCooldownActive, getLastPrice } from "./store.js";

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
  console.error("Promise:", promise);
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
  const { id, url, platform } = product;
  let result = null;

  try {
    if (platform.toLowerCase() === "amazon") {
      // Extrai ASIN da URL
      const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
      if (!asinMatch) throw new Error("ASIN não encontrado na URL");
      result = await fetchAmazonProduct(asinMatch[1]);
    } else if (platform.toLowerCase() === "mercadolivre" || platform.toLowerCase() === "ml") {
      // Extrai ID do ML (MLxxxxxxxxxxxx)
      const mlIdMatch = url.match(/MLB?\d+/) || id.match(/ml_([A-Z0-9]+)/i);
      if (!mlIdMatch) throw new Error("ID do ML não encontrado");
      result = await fetchMLProduct(mlIdMatch[0] || mlIdMatch[1]);
    } else if (platform.toLowerCase() === "shopee") {
      // Extrai itemId e shopId (shopee.com.br/itemId-shopId)
      const shopeeMatch = url.match(/\/(\d+)-(\d+)/);
      if (!shopeeMatch) throw new Error("itemId ou shopId não encontrados");
      result = await fetchShopeeProduct(parseInt(shopeeMatch[1]), parseInt(shopeeMatch[2]));
    }

    if (!result) return null;

    // Sobrescreve ID para garantir compatibilidade
    result.id = id;
    return result;
  } catch (err) {
    console.error(`❌ Erro ao buscar ${id} (${platform}):`, err.message);
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
    if (!products.length) {
      console.warn("⚠️ Nenhum produto para monitorar");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const product of products) {
      try {
        const result = await fetchProduct(product);

        if (!result || result.price === null) {
          failCount++;
          console.warn(`⚠️ ${product.id}: Sem preço disponível`);
          continue;
        }

        successCount++;

        // Notifica se houver mudança significativa
        await notifyIfPriceDropped(result);

        // ✅ Delay entre requests
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        failCount++;
        console.error(`❌ Erro ao processar ${product.id}:`, err.message);
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

  // ✅ Inicializa WhatsApp de forma segura
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

// ✅ Inicia o monitor ao carregar
startMonitor().catch(err => {
  console.error("❌ Falha crítica ao iniciar monitor:", err.message);
  process.exit(1);
});
