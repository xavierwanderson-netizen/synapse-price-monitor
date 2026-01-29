import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice } from "./store.js";
import { notifyWhatsApp } from "./notifier.js";

// Resolver __dirname em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar products.json SEM assert (FORMA CORRETA)
const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

const interval = Number(process.env.CHECK_INTERVAL_MINUTES || 30);

console.log("🚀 Synapse Price Monitor iniciado");

cron.schedule(`*/${interval} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  for (const product of products) {
    const price = await getAmazonPrice(product.asin);
    const lastPrice = getLastPrice(product.asin);

    if (!lastPrice || price < lastPrice) {
      await notifyWhatsApp(
        `🔥 Oferta detectada!\n${product.title}\n💰 Preço: R$ ${price}`
      );
    }

    setLastPrice(product.asin, price);
  }
});

// KEEP-ALIVE obrigatório para Railway
setInterval(() => {
  console.log("🟢 Processo ativo (keep-alive)");
}, 300000);
