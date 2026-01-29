import cron from "node-cron";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { notifyTelegram } from "./notifier.js";
import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

const interval = Number(process.env.CHECK_INTERVAL_MINUTES || 30);

console.log("🚀 Synapse Price Monitor iniciado");
notifyTelegram("✅ Synapse Price Monitor online");

cron.schedule(`*/${interval} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  for (const product of products) {
    try {
      const price = await getAmazonPrice(product.asin);
      const lastPrice = getLastPrice(product.asin);

      if (!lastPrice || price < lastPrice) {
        await notifyTelegram(
          `🔥 *Oferta detectada!*\n\n📦 ${product.title}\n💰 R$ ${price}`
        );
      }

      setLastPrice(product.asin, price);
    } catch (err) {
      console.error(`❌ Erro no produto ${product.asin}:`, err.message);
    }
  }
});
