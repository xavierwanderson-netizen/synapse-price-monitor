import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import http from "http";

import { getAmazonPrice } from "./amazon.js";
import {
  getLastPrice,
  setLastPrice,
  canAlert,
  markAlerted,
  addPriceHistory,
  getAveragePrice
} from "./store.js";
import { notifyTelegram } from "./notifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* HTTP server */
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => {
  res.writeHead(200);
  res.end("OK");
}).listen(PORT);

/* Config */
const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, "products.json"), "utf-8")
);

const INTERVAL = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const MIN_DROP_FROM_AVG = 0.8; // 80%
const COOLDOWN = 12;

async function checkPrices(reason) {
  console.log(`🔍 Verificando preços (${reason})`);

  for (const product of products) {
    try {
      const data = await getAmazonPrice(product.asin);
      if (!data) continue;

      const { title, price, image, affiliateUrl } = data;

      addPriceHistory(product.asin, price);

      const avg = getAveragePrice(product.asin);
      const last = getLastPrice(product.asin);

      let shouldAlert = false;
      let referencePrice = null;

      // REGRA 1 — queda tradicional
      if (last && price < last) {
        const drop = (last - price) / last;
        if (drop >= 0.15) {
          shouldAlert = true;
          referencePrice = last;
        }
      }

      // REGRA 2 — média histórica (NOVA)
      if (!shouldAlert && avg && price <= avg * MIN_DROP_FROM_AVG) {
        shouldAlert = true;
        referencePrice = avg;
      }

      if (shouldAlert && canAlert(product.asin, COOLDOWN)) {
        const discount =
          ((referencePrice - price) / referencePrice) * 100;

        await notifyTelegram({
          title,
          price,
          oldPrice: referencePrice,
          discountPercent: discount,
          image,
          affiliateUrl
        });

        markAlerted(product.asin);
      }

      setLastPrice(product.asin, price);

    } catch (e) {
      console.error("Erro ASIN", product.asin, e.message);
    }
  }
}

/* startup + cron */
checkPrices("startup");
cron.schedule(`*/${INTERVAL} * * * *`, () => checkPrices("cron"));
