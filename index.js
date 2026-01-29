import fs from "fs";
import path from "path";
import cron from "node-cron";
import { fileURLToPath } from "url";
import { checkAmazonPrice } from "./amazon.js";
import { notifyWhatsApp } from "./notifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`📦 Produtos carregados: ${products.length}`);

const INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 30);

cron.schedule(`*/${INTERVAL_MINUTES} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  for (const product of products) {
    try {
      const price = await checkAmazonPrice(product.asin);
      console.log(`🔍 ${product.name} → R$ ${price}`);

      if (product.targetPrice && price <= product.targetPrice) {
        await notifyWhatsApp(
          `🔥 PROMOÇÃO DETECTADA

${product.name}
💰 R$ ${price}

${product.url}`
        );
      }
    } catch (err) {
      console.error(`Erro no produto ${product.asin}:`, err.message);
    }
  }
});

setInterval(() => {
  console.log("🟢 Processo ativo (keep-alive)");
}, 300000);
