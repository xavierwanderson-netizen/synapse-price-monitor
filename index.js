import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { initWhatsApp } from "./whatsapp.js";
import { monitorAmazon } from "./amazon.js";
import { monitorMercadoLivre } from "./mercadolivre.js";
import { monitorShopee } from "./shopee.js";
import { sendAlert } from "./notifier.js";
import { getStore, updatePrice, markNotified, isCooldownActive } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, "products.json");

// ✅ Volume persistente do Railway (corrigido de /.data para /data)
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data";

// ✅ Controle de concorrência (evita múltiplos ciclos simultâneos)
let isRunning = false;
const MONITOR_INTERVAL = 60000; // 1 minuto entre ciclos

// ✅ Proteção contra crashes globais
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ [CRÍTICO] Promise rejection não tratada:", reason);
  console.error("Promise:", promise);
});

process.on("uncaughtException", (error) => {
  console.error("❌ [CRÍTICO] Exceção não tratada:", error);
  // Continua executando em vez de derrubar o processo
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

async function monitorCycle() {
  // ✅ Proteção contra sobreposição de ciclos
  if (isRunning) {
    console.warn("⚠️ Ciclo anterior ainda em execução, pulando...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`🔄 [${new Date().toISOString()}] Iniciando ciclo de monitoramento...`);

    const products = await loadProducts();
    if (!products.length) {
      console.warn("⚠️ Nenhum produto para monitorar");
      return;
    }

    let changedCount = 0;

    for (const product of products) {
      try {
        const { id, url, platform, targetPrice } = product;

        // ✅ Rota por plataforma
        let currentPrice = null;

        if (platform.toLowerCase() === "amazon") {
          currentPrice = await monitorAmazon(url);
        } else if (platform.toLowerCase() === "mercadolivre") {
          currentPrice = await monitorMercadoLivre(url);
        } else if (platform.toLowerCase() === "shopee") {
          currentPrice = await monitorShopee(url);
        }

        if (currentPrice === null) {
          console.warn(`⚠️ Falha ao monitorar ${id} (${platform})`);
          continue;
        }

        // ✅ Comparação e alerta
        const lastPrice = await updatePrice(id, currentPrice);

        if (lastPrice && Math.abs(currentPrice - lastPrice) > 1) {
          changedCount++;
          const change = ((currentPrice - lastPrice) / lastPrice * 100).toFixed(2);
          const emoji = currentPrice < lastPrice ? "📉" : "📈";

          console.log(`${emoji} ${id}: R$ ${lastPrice.toFixed(2)} → R$ ${currentPrice.toFixed(2)} (${change}%)`);

          // ✅ Alerta se atingiu target e cooldown ativo
          if (currentPrice <= targetPrice && !(await isCooldownActive(id))) {
            await sendAlert(product, currentPrice);
            await markNotified(id);
          }
        }

        // ✅ Delay entre requests (evita bloqueios)
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`❌ Erro ao processar produto ${product.id}:`, err.message);
        // Continua para o próximo produto
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Ciclo concluído em ${elapsed}s (${changedCount} mudanças detectadas)\n`);
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
  console.log("═══════════════════════════════════════════════════\n");

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
