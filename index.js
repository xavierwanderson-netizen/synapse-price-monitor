import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice } from "./store.js";
import { notifyTelegram } from "./notifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega products.json
const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

const INTERVAL = process.env.CHECK_INTERVAL_MINUTES || 30;
const MIN_DISCOUNT_PERCENT = 15;

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`⏱️ Intervalo: ${INTERVAL} minutos`);
console.log(`📉 Desconto mínimo: ${MIN_DISCOUNT_PERCENT}%`);

cron.schedule(`*/${INTERVAL} * * * *`, async () => {
  console.log("🔍 Verificando preços...");

  for (const product of products) {
    try {
      const result = await getAmazonPrice(product.asin);
      if (!result) continue;

      const { title, price, image, affiliateUrl } = result;
      const lastPrice = getLastPrice(product.asin);

      if (lastPrice && price >= lastPrice) {
        continue;
      }

      if (lastPrice) {
        const discountPercent = ((lastPrice - price) / lastPrice) * 100;

        if (discountPercent >= MIN_DISCOUNT_PERCENT) {
          await notifyTelegram({
            title,
            price,
            oldPrice: lastPrice,
            discountPercent,
            image,
            affiliateUrl
          });
        }
      }

      setLastPrice(product.asin, price);

    } catch (error) {
      console.error(`Erro ao processar ASIN ${product.asin}:`, error.message);
    }
  }
});
