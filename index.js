import fs from "fs";
import path from "path";
import cron from "node-cron";
import { fileURLToPath } from "url";
import { fetchAmazonData } from "./amazon.js";
import { notifyTelegram } from "./notifier.js";
import { getLastPrice, recordError, resetErrorCount, setLastPrice } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const productsPath = path.join(__dirname, "products.json");
const quarantinePath = path.join(__dirname, "products.quarantine.json");

const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

console.log("🚀 Synapse Price Monitor iniciado");
console.log(`📦 Produtos carregados: ${products.length}`);

const INTERVAL_MINUTES = Number(process.env.CHECK_INTERVAL_MINUTES || 30);
const DROP_PERCENT = Number(process.env.PRICE_DROP_PERCENT || 5);
const PRODUCT_DELAY_MS = Number(process.env.PRODUCT_DELAY_MS || 800);
const QUARANTINE_404_THRESHOLD = Number(process.env.QUARANTINE_404_THRESHOLD || 3);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeProductsList(list) {
  return list.map((item) => (typeof item === "string" ? { asin: item } : item));
}

function writeProducts(list) {
  fs.writeFileSync(productsPath, JSON.stringify(list, null, 2));
}

function readQuarantine() {
  if (!fs.existsSync(quarantinePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(quarantinePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.log("⚠️ Falha ao ler products.quarantine.json:", error.message);
    return [];
  }
}

function writeQuarantine(list) {
  fs.writeFileSync(quarantinePath, JSON.stringify(list, null, 2));
}

function quarantineAsin(asin) {
  const normalizedProducts = normalizeProductsList(products);
  const updatedProducts = normalizedProducts.filter((product) => product.asin !== asin);
  const quarantineList = readQuarantine();
  const date = new Date().toISOString().slice(0, 10);

  quarantineList.push({
    asin,
    reason: "404_definitive",
    date,
  });

  writeProducts(updatedProducts);
  writeQuarantine(quarantineList);

  products.length = 0;
  products.push(...updatedProducts);

  console.log(
    `🚫 ASIN ${asin} movido para quarentena (motivo: 404_definitive).`
  );
}

cron.schedule(`*/${INTERVAL_MINUTES} * * * *`, async () => {
  console.log("⏱️ Verificando preços...");

  const normalizedProducts = normalizeProductsList(products);

  for (const product of normalizedProducts) {
    const fallbackTitle = product.title || product.name;
    const lastPrice = getLastPrice(product.asin);

    const data = await fetchAmazonData(product.asin, fallbackTitle);

    if (data.errorStatus === 404) {
      const failures = recordError(product.asin);
      console.log(
        `⚠️ ASIN ${product.asin} retornou 404 (${failures}/${QUARANTINE_404_THRESHOLD}).`
      );

      if (failures >= QUARANTINE_404_THRESHOLD) {
        console.log(
          `🧹 Quarentena: ASIN ${product.asin} removido após ${failures} falhas 404 consecutivas.`
        );
        quarantineAsin(product.asin);
      }

      await sleep(PRODUCT_DELAY_MS);
      continue;
    }

    resetErrorCount(product.asin);

    if (!data.price) {
      console.log(`⚠️ Preço não encontrado para ${data.title} (${product.asin})`);
      await sleep(PRODUCT_DELAY_MS);
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
        console.log(
          `🚨 Alerta: queda de ${dropPercent.toFixed(2)}% (limite ${DROP_PERCENT}%)`
        );

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
    await sleep(PRODUCT_DELAY_MS);
  }
});

setInterval(() => {
  console.log("🟢 Processo ativo (keep-alive)");
}, 300000);
