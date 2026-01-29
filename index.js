import cron from "node-cron";
import products from "./products.json" assert { type: "json" };
import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice } from "./store.js";
import { notifyTelegram } from "./notifier.js";

const interval = Number(process.env.CHECK_INTERVAL_MINUTES || 30);

console.log("🚀 Synapse Price Monitor iniciado");
notifyTelegram("✅ Synapse Price Monitor iniciado e conectado ao Telegram");

cron.schedule(`*/${interval} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  for (const product of products) {
    try {
      const price = await getAmazonPrice(product.asin);
      const lastPrice = getLastPrice(product.asin);

      if (!lastPrice || price < lastPrice) {
        await notifyTelegram(
          `🔥 Oferta detectada!\n\n${product.title}\n💰 R$ ${price}\n🛒 https://www.amazon.com.br/dp/${product.asin}`
        );
      }

      setLastPrice(product.asin, price);
    } catch (err) {
      console.error(`Erro no ASIN ${product.asin}:`, err.message);
    }
  }
});
