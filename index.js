import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import http from "http";

import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice, canAlert, markAlerted } from "./store.js";
import { notifyTelegram } from "./notifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ===============================
   HTTP SERVER (Railway online)
   =============================== */
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Synapse Price Monitor ONLINE");
}).listen(PORT, () => {
  console.log(`🌐 HTTP server ativo na porta ${PORT}`);
});

/* ===============================
   CONFIG
   =============================== */
const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

const INTERVAL = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const MIN_DISCOUNT_PERCENT = 15;
const ALERT_COOLDOWN_HOURS = Number(process.env.ALERT_COOLDOWN_HOURS || 12);

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`⏱️ Intervalo: ${INTERVAL} minutos`);
console.log(`📉 Desconto mínimo: ${MIN_DISCOUNT_PERCENT}%`);
console.log(`🧊 Cooldown alerta: ${ALERT_COOLDOWN_HOURS}h`);

/* ===============================
   FUNÇÃO DE VERIFICAÇÃO
   =============================== */
async function checkPrices(reason = "cron") {
  console.log(`🔍 Verificando preços (${reason})...`);

  for (const product of products) {
    try {
      const result = await getAmazonPrice(product.asin);
      if (!result) continue;

      const { title, price, image, affiliateUrl } = result;
      const lastPrice = getLastPrice(product.asin);

      if (lastPrice == null) {
        setLastPrice(product.asin, price);
        continue;
      }

      if (price >= lastPrice) {
        setLastPrice(product.asin, price);
        continue;
      }

      const discountPercent = ((lastPrice - price) / lastPrice) * 100;

      if (
        discountPercent >= MIN_DISCOUNT_PERCENT &&
        canAlert(product.asin, ALERT_COOLDOWN_HOURS)
      ) {
        await notifyTelegram({
          title,
          price,
          oldPrice: lastPrice,
          discountPercent,
          image,
          affiliateUrl
        });
        markAlerted(product.asin);
      }

      setLastPrice(product.asin, price);

    } catch (error) {
      console.error(`Erro ASIN ${product.asin}:`, error?.message || error);
    }
  }
}

/* ===============================
   EXECUÇÃO IMEDIATA (FORÇADA)
   =============================== */
checkPrices("startup");

/* ===============================
   CRON NORMAL
   =============================== */
cron.schedule(`*/${INTERVAL} * * * *`, () => {
  checkPrices("cron");
});
