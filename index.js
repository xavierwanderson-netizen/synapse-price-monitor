import fs from "fs";
import path from "path";
import cron from "node-cron";
import { fileURLToPath } from "url";
import { fetchAmazonData } from "./amazon.js";
import { notifyTelegram } from "./notifier.js";
import { getLastPrice, setLastPrice } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`📦 Produtos carregados: ${products.length}`);

const INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const DROP_PERCENT = Number(process.env.PRICE_DROP_PERCENT || 5);

cron.schedule(`*/${INTERVAL_MINUTES} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  for (const product of products) {
    const fallbackTitle = product.title || product.name;
    const lastPrice = getLastPrice(product.asin);

    const data = await fetchAmazonData(product.asin, fallbackTitle);

    if (!data.price) {
      console.log(`⚠️ Preço não encontrado para ${data.title} (${product.asin})`);
      continue;
    }

    if (lastPrice) {
      const diff = lastPrice - data.price;
      const dropPercent = (diff / lastPrice) * 100;

      console.log(
        `🔎 ${data.title} → R$ ${data.price} (anterior: R$ ${lastPrice}, queda: ${dropPercent.toFixed(
          2
        )}%)`
      );

      if (data.price < lastPrice && dropPercent >= DROP_PERCENT) {
        const message = [
          "🔥 PROMOÇÃO DETECTADA",
          "",
          data.title,
          `💰 R$ ${data.price}`,
          `📉 Queda: ${dropPercent.toFixed(2)}%`,
          "",
          data.url,
        ].join("\n");

        await notifyTelegram({
          text: message,
          imageUrl: data.imageUrl,
        });
      }
    } else {
      console.log(`🔎 ${data.title} → R$ ${data.price} (primeira coleta)`);
    }

    setLastPrice(product.asin, data.price);
  }
});

setInterval(() => {
  console.log("🟢 Processo ativo (keep-alive)");
}, 300000);
