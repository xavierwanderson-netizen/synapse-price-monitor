import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

import { getAmazonPrice } from "./amazon.js";
import { getLastPrice, setLastPrice } from "./store.js";
import { notifyTelegram } from "./notifier.js";

// ===============================
// Resolver __dirname em ESM
// ===============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===============================
// Carregar products.json
// ===============================
const productsPath = path.join(__dirname, "products.json");
const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

// ===============================
// Intervalo (minutos)
// ===============================
const interval = Number(process.env.CHECK_INTERVAL_MINUTES || 30);

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`⏱️ Intervalo de verificação: ${interval} minutos`);
console.log(`📦 Produtos monitorados: ${products.length}`);

// ===============================
// Agendamento
// ===============================
cron.schedule(`*/${interval} * * * *`, async () => {
  console.log("🔍 Verificando preços...");

  for (const product of products) {
    try {
      const price = await getAmazonPrice(product.asin);
      const lastPrice = getLastPrice(product.asin);

      console.log(
        `📦 ${product.title} | Atual: R$ ${price} | Anterior: ${
          lastPrice ?? "N/A"
        }`
      );

      if (!lastPrice || price < lastPrice) {
        await notifyTelegram(
          `🔥 *Oferta detectada!*\n\n` +
          `📦 ${product.title}\n` +
          `💰 Preço: R$ ${price}\n` +
          `🛒 https://www.amazon.com.br/dp/${product.asin}`
        );
      }

      setLastPrice(product.asin, price);
    } catch (err) {
      console.error(`❌ Erro no ASIN ${product.asin}:`, err.message);
    }
  }
});
