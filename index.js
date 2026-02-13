import { fetchAmazonProduct } from './amazon.js';
import { fetchMLProduct } from './mercadolivre.js';
import { fetchShopeeProduct } from './shopee.js';
import { getStore, updateStore } from './store.js';
import { sendNotification } from './notifier.js';
import fs from 'fs';

async function checkPrices() {
  console.log('🚀 Iniciando verificação de preços...');
  const products = JSON.parse(fs.readFileSync('./products.json', 'utf-8'));
  const store = getStore();

  for (const product of products) {
    let productData = null;

    if (product.platform === 'amazon') {
      productData = await fetchAmazonProduct(product.asin);
    } else if (product.platform === 'mercadolivre') {
      // Correção: usando mlId conforme definido no products.json
      productData = await fetchMLProduct(product.mlId); 
    } else if (product.platform === 'shopee') {
      productData = await fetchShopeeProduct(product.itemId, product.shopId);
    }

    if (productData) {
      const lastPrice = store[productData.id];
      console.log(`🔍 [${productData.platform.toUpperCase()}] ${productData.title}: R$ ${productData.price}`);

      if (lastPrice && productData.price < lastPrice) {
        console.log(`🔥 PREÇO BAIXOU: ${productData.title}`);
        await sendNotification(productData, lastPrice);
      }
      store[productData.id] = productData.price;
    }
  }

  updateStore(store);
  console.log('✅ Verificação concluída.');
}

// Executa a cada 30 minutos
setInterval(checkPrices, 30 * 60 * 1000);
checkPrices();
