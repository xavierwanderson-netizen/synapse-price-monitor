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
      // CORREÇÃO: Usando mlId do products.json
      productData = await fetchMLProduct(product.mlId); 
    } else if (product.platform === 'shopee') {
      productData = await fetchShopeeProduct(product.itemId, product.shopId);
    }

    if (productData) {
      const lastPrice = store[productData.id];
      console.log(`🔍 [${productData.platform.toUpperCase()}] ${productData.title}: R$ ${productData.price}`);

      // Só notifica se o preço atual for MENOR que o anterior
      if (lastPrice && productData.price < lastPrice) {
        console.log(`🔥 PREÇO BAIXOU: ${productData.title} (De R$ ${lastPrice} por R$ ${productData.price})`);
        await sendNotification(productData, lastPrice);
      }
      
      // Atualiza o preço na memória para a próxima comparação
      store[productData.id] = productData.price;
    }
  }

  updateStore(store);
  console.log('✅ Verificação concluída.');
}

setInterval(checkPrices, 30 * 60 * 1000);
checkPrices();
