import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice } from "./store.js";
import { notifyTelegram } from "./notifier.js";

/**
 * Resolver __dirname em ESM
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Carregar produtos (JSON)
 */
const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, "products.json"), "utf-8")
);

/**
 * Configurações via ENV
 */
const INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const MIN_DROP_PERCENT = 0.15; // 15%
const AMAZON_TAG = process.env.AMAZON_PARTNER_TAG;

if (!AMAZON_TAG) {
  console.error("❌ AMAZON_PARTNER_TAG não definido. Links NÃO monetizarão.");
}

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`⏱️ Intervalo: ${INTERVAL_MINUTES} minutos`);
console.log("📉 Alerta apenas para quedas ≥ 15%");
console.log(`🔗 Tag afiliado: ${AMAZON_TAG || "NÃO DEFINIDA"}`);

/**
 * CRON
 */
cron.schedule(`*/${INTERVAL_MINUTES} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  for (const product of products) {
    try {
      const currentPrice = await getAmazonPrice(product.asin);
      const lastPrice = getLastPrice(product.asin);

      // Primeiro registro: só salva e não alerta
      if (!lastPrice) {
        setLastPrice(product.asin, currentPrice);
        continue;
      }

      const dropPercent = (lastPrice - currentPrice) / lastPrice;

      if (dropPercent >= MIN_DROP_PERCENT) {
        const affiliateLink = `https://www.amazon.com.br/dp/${product.asin}?tag=${AMAZON_TAG}`;

        await notifyTelegram(
          `🔥 *OFERTA REAL DETECTADA*\n\n` +
          `🛒 *${product.title}*\n` +
          `💰 *De R$ ${lastPrice.toFixed(2)} por R$ ${currentPrice.toFixed(2)}*\n` +
          `📉 *Queda: ${(dropPercent * 100).toFixed(1)}%*\n\n` +
          `🔗 ${affiliateLink}`
        );
      }

      // Atualiza sempre o último preço
      setLastPrice(product.asin, currentPrice);

    } catch (err) {
      console.error(`❌ Erro no ASIN ${product.asin}:`, err.message);
    }
  }
});
