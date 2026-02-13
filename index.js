import "dotenv/config";
import fs from "fs";
import { fetchAmazonProduct } from "./amazon.js";
import { fetchMLProduct } from "./mercadolivre.js";
import { fetchShopeeProduct } from "./shopee.js";
import { notifyIfPriceDropped } from "./notifier.js";

async function checkOnce() {
  const products = JSON.parse(fs.readFileSync("./products.json", "utf-8"));
  console.log(`🚀 Verificando ${products.length} produtos...`);

  for (const product of products) {
    let productData = null;
    try {
      if (product.platform === "amazon") {
        productData = await fetchAmazonProduct(product.asin);
      } else if (product.platform === "mercadolivre") {
        productData = await fetchMLProduct(product.mlId);
      } else if (product.platform === "shopee") {
        productData = await fetchShopeeProduct(product.itemId, product.shopId);
      }
      
      if (productData) await notifyIfPriceDropped(productData);
    } catch (e) {
      console.error(`❌ Falha no produto ${product.platform}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 2500));
  }
}

checkOnce();
setInterval(checkOnce, 30 * 60 * 1000);
