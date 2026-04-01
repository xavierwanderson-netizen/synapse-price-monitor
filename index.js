import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import validateEnvironment from "./config.js";
import { initWhatsApp } from "./whatsapp.js";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";
import { getLastPrice } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, "products.json");

// ✅ VALIDAR CONFIGURAÇÃO NO STARTUP
const config = validateEnvironment();

// ✅ VARIÁVEIS DO RAILWAY
const DATA_DIR = config.dataDir;
const CHECK_INTERVAL_MINUTES = config.timing.checkIntervalMinutes;
const MONITOR_INTERVAL = CHECK_INTERVAL_MINUTES * 60 * 1000;
const REQUEST_DELAY_MS = config.timing.requestDelayMs;

// ✅ Controle de concorrência e cooldown
let isRunning = false;
const amazonCooldownTracker = {}; // Rastreia cooldown por ASIN

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

    // ✅ AMAZON: com verificação de cooldown inteligente
    if (platform.toLowerCase() === "amazon" && asin) {
      // ✅ Verificar se está em cooldown
      if (amazonCooldownTracker[asin]) {
        const remainingMs = amazonCooldownTracker[asin] - Date.now();
        if (remainingMs > 0) {
          const remainingSec = Math.round(remainingMs / 1000);
          // ✅ FIX: cooldown é comportamento esperado, não erro
          console.log(`⏸️  ${asin}: Em cooldown por ${remainingSec}s, pulando...`);
          return null;
        } else {
          delete amazonCooldownTracker[asin]; // Cooldown expirou
        }
      }

      try {
        result = await fetchAmazonProduct(asin);
      } catch (err) {
        // Se detectar cooldown, registrar e pular próximas tentativas
        if (err.message.includes("Amazon em cooldown")) {
          const cooldownSec = parseInt(err.message.match(/\d+/)?.[0] || "300", 10);
          amazonCooldownTracker[asin] = Date.now() + (cooldownSec * 1000);
          // ✅ FIX: cooldown é comportamento esperado, não erro
          console.log(`⏸️  ${asin}: Cooldown registrado por ${cooldownSec}s`);
          return null;
        }
        throw err;
      }
    }
    // ✅ SHOPEE: itemId + shopId
    else if (platform.toLowerCase() === "shopee" && itemId && shopId) {
      if (!config.shopee.enabled) {
        console.warn(`⚠️  Shopee não configurado (faltam APP_ID/APP_KEY), pulando...`);
        return null;
      }
      result = await fetchShopeeProduct(parseInt(itemId), parseInt(shopId));
    }
    // ✅ MERCADO LIVRE: mlId
    else if ((platform.toLowerCase() === "mercadolivre" || platform.toLowerCase() === "ml") && mlId) {
      if (!config.mercadolivre.enabled) {
        console.warn(`⚠️  Mercado Livre não configurado (faltam credenciais), pulando...`);
        return null;
      }
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
      console.warn(`⚠️  ${platform}: Faltam parâmetros obrigatórios (${required[platform.toLowerCase()]})`);
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
    console.log(`⏱️  Próximo ciclo em: ${CHECK_INTERVAL_MINUTES} minutos`);
    console.log(`⏸️  Delay entre produtos: ${REQUEST_DELAY_MS}ms`);

    const products = await loadProducts();
    if (!products || !products.length) {
      console.warn("⚠️ Nenhum produto para monitorar");
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const product of products) {
      try {
        const result = await fetchProduct(product);

        if (result === null) {
          skipCount++;
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
          continue;
        }

        if (result.price === null || result.price === undefined) {
          failCount++;
          const id = product.asin || product.mlId || `shopee_${product.itemId}`;
          console.warn(`⚠️ ${id}: Sem preço disponível`);
          await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
          continue;
        }

        successCount++;

        // ✅ Notifica se houver mudança
        await notifyIfPriceDropped(result);

        // ✅ RESPEITANDO REQUEST_DELAY_MS do Railway
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
      } catch (err) {
        failCount++;
        console.error(`❌ Erro ao processar produto:`, err.message);

        // ✅ RESPEITANDO REQUEST_DELAY_MS do Railway mesmo em erro
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalAttempted = successCount + failCount;
    const successRate = totalAttempted > 0
      ? ((successCount / totalAttempted) * 100).toFixed(1)
      : "0.0";

    console.log(`✅ Ciclo concluído em ${elapsed}s`);
    console.log(`📊 Resultado: ${successCount}✅ | ${failCount}❌ | ⏸️  ${skipCount} | Taxa: ${successRate}%\n`);
  } catch (err) {
    console.error("❌ Erro no ciclo de monitoramento:", err.message);
  } finally {
    isRunning = false;
  }
}

async function initWhatsAppSafe() {
  if (!config.whatsapp.enabled) {
    console.log("⚠️  WhatsApp não configurado (WA_GROUP_ID faltando)");
    return;
  }

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
  console.log("\n═══════════════════════════════════════════════════");
  console.log("🚀 Monitor Synapse Iniciado");
  console.log(`📁 Diretório de dados: ${DATA_DIR}`);
  console.log(`⏱️  Intervalo de monitoramento: ${CHECK_INTERVAL_MINUTES} minutos`);
  console.log(`⏸️  Delay entre produtos: ${REQUEST_DELAY_MS}ms`);
  console.log("═══════════════════════════════════════════════════");

  // ✅ Plataformas habilitadas
  console.log("\n📊 Plataformas habilitadas:");
  console.log(`   ${config.amazon.enabled ? "✅" : "❌"} Amazon`);
  console.log(`   ${config.shopee.enabled ? "✅" : "❌"} Shopee`);
  console.log(`   ${config.mercadolivre.enabled ? "✅" : "❌"} Mercado Livre`);
  console.log(`   ${config.telegram.enabled ? "✅" : "❌"} Telegram`);
  console.log(`   ${config.whatsapp.enabled ? "✅" : "❌"} WhatsApp\n`);

  // ✅ Inicializa WhatsApp
  await initWhatsAppSafe();

  // ✅ Primeiro ciclo imediato
  await monitorCycle();

  // ✅ Próximos ciclos respeitando CHECK_INTERVAL_MINUTES do Railway
  console.log(`\n⏲️  Aguardando ${CHECK_INTERVAL_MINUTES} minutos até próximo ciclo...`);
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
