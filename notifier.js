import { fetchAmazonProduct, buildAffiliateLink } from "./amazon.js";
import { fetchShopeeProduct } from "./shopee.js"; // Importa o novo motor que criamos
import { getStore, updatePrice, isCooldownActive } from "./store.js";
import axios from "axios";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DISCOUNT_THRESHOLD = parseFloat(process.env.DISCOUNT_THRESHOLD_PERCENT || "12");
const REQUEST_DELAY = parseInt(process.env.REQUEST_DELAY_MS || "3000");

// Função para enviar as mensagens para o Telegram
async function sendTelegramMessage(text) {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: false
    });
  } catch (error) {
    console.error("❌ Erro ao enviar Telegram:", error.message);
  }
}

async function checkPriceAndNotify(product, platform) {
  const { id, title, price, url } = product;
  const store = await getStore();
  const lastPrice = store[id]?.lowestPrice;

  // Se o preço não existir ou for zero, apenas salva e sai
  if (!price) return;

  if (!lastPrice) {
    console.log(`🆕 Novo produto registrado (${platform}): ${title} - R$ ${price}`);
    await updatePrice(id, price);
    return;
  }

  // Calcula a queda de preço
  if (price < lastPrice) {
    const discountPercent = ((lastPrice - price) / lastPrice) * 100;

    if (discountPercent >= DISCOUNT_THRESHOLD && !await isCooldownActive(id)) {
      const message = `
🔥 <b>PROMOÇÃO ENCONTRADA NA ${platform.toUpperCase()}!</b> 🔥

📦 <b>${title}</b>

💰 De: <s>R$ ${lastPrice.toFixed(2)}</s>
✅ <b>Por: R$ ${price.toFixed(2)}</b>
📉 <b>Queda de ${discountPercent.toFixed(0)}%</b>

🛒 <b>Compre aqui:</b> ${url}
      `;

      await sendTelegramMessage(message);
      await updatePrice(id, price);
      console.log(`📢 Alerta enviado: ${title} (-${discountPercent.toFixed(0)}%)`);
    } else {
      await updatePrice(id, price);
    }
  } else if (price > lastPrice) {
    // Se o preço subiu, apenas atualiza o registro sem alertar
    await updatePrice(id, price);
  }
}

export async function runCheckOnce(products) {
  console.log(`🚀 Iniciando verificação de ${products.length} produtos...`);

  for (const p of products) {
    try {
      let productData = null;

      // Decide qual API usar baseada na plataforma
      if (p.platform === 'shopee') {
        productData = await fetchShopeeProduct(p.itemId, p.shopId);
      } else {
        productData = await fetchAmazonProduct(p.asin);
      }

      if (productData) {
        // Usa o link oficial da API ou gera o link da Amazon
        const finalProduct = {
          ...productData,
          url: productData.url || (p.platform === 'amazon' ? buildAffiliateLink(p.asin) : "")
        };
        await checkPriceAndNotify(finalProduct, p.platform || 'amazon');
      }

      // Delay para evitar bloqueios
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    } catch (error) {
      console.error(`❌ Erro ao processar produto:`, error.message);
    }
  }
  console.log("🏁 Verificação concluída.");
}
