import "dotenv/config";
import fs from "fs";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";

const CHECK_INTERVAL_MINUTES = parseInt(process.env.CHECK_INTERVAL_MINUTES || "30", 10);
const REQUEST_DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || "2500", 10);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProducts() {
  return JSON.parse(fs.readFileSync("./products.json", "utf-8"));
}

async function checkOnce() {
  const products = loadProducts();
  console.log(`🚀 Iniciando ciclo: ${products.length} produtos`);

  for (const product of products) {
    let productData = null;

    // AMAZON
    if (product.platform === "amazon") {
      try {
        if (!product.asin) throw new Error("ASIN ausente");
        productData = await fetchAmazonProduct(product.asin);
      } catch (e) {
        console.error(`❌ Amazon falhou (asin=${product.asin}):`, e.message);
      }
    }

    // MERCADO LIVRE
    else if (product.platform === "mercadolivre") {
      try {
        if (!product.mlId) throw new Error("mlId ausente");
        productData = await fetchMLProduct(product.mlId);
      } catch (e) {
        console.error(`❌ ML falhou (mlId=${product.mlId}):`, e.message);
      }
    }

    // SHOPEE
    else if (product.platform === "shopee") {
      try {
        if (!product.itemId || !product.shopId) {
          throw new Error("itemId ou shopId ausente");
        }
        productData = await fetchShopeeProduct(product.itemId, product.shopId);
      } catch (e) {
        console.error(
          `❌ Shopee falhou (itemId=${product.itemId}, shopId=${product.shopId}):`,
          e.message
        );
      }
    } else {
      console.warn("⚠️ Plataforma desconhecida:", product);
      continue;
    }

    if (productData) {
      await notifyIfPriceDropped(productData);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log("✅ Ciclo finalizado");
}

console.log("🟢 Monitor iniciado");
checkOnce();
setInterval(checkOnce, CHECK_INTERVAL_MINUTES * 60 * 1000);
