import axios from "axios";
import {
  getLastPrice,
  setLastPrice,
  isCooldownActive,
  markNotified
} from "./store.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Lê o limite do Railway ou usa 12 como fallback padrão
const DISCOUNT_THRESHOLD = parseInt(process.env.DISCOUNT_THRESHOLD_PERCENT || "12", 10);

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getOfferLevel(oldPrice, newPrice) {
  const discount = ((oldPrice - newPrice) / oldPrice) * 100;
  
  if (discount >= 40) return { label: "💥 IMPERDÍVEL", discount };
  if (discount >= 25) return { label: "🚨 SUPER OFERTA", discount };
  if (discount >= DISCOUNT_THRESHOLD) return { label: "🔥 BOA OFERTA", discount };
  return { label: "📉 QUEDA DE PREÇO", discount };
}

async function sendTelegramPhoto(image, caption) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    photo: image,
    caption,
    parse_mode: "HTML"
  });
}

async function sendTelegramText(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await axios.post(url, {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false
  });
}

export async function notifyIfPriceDropped(product) {
  if (!product || !product.id || !product.price) return;

  const lastPrice = await getLastPrice(product.id);

  if (lastPrice === null) {
    await setLastPrice(product.id, product.price);
    return;
  }

  if (product.price < lastPrice) {
    const discountPercent = ((lastPrice - product.price) / lastPrice) * 100;

    // Filtro dinâmico baseado na variável do Railway
    if (discountPercent < DISCOUNT_THRESHOLD) {
      await setLastPrice(product.id, product.price);
      return; 
    }

    const cooldown = await isCooldownActive(product.id);
    if (cooldown) return;

    const { label, discount } = getOfferLevel(lastPrice, product.price);
    const savings = lastPrice - product.price;

    const textMessage =
`<b>${label}</b>
${escapeHtml(product.title)}

💰 De: <s>R$ ${lastPrice.toFixed(2)}</s>
🔥 Por: <b>R$ ${product.price.toFixed(2)}</b>
💸 Economia: R$ ${savings.toFixed(2)} (${discount.toFixed(0)}% OFF)

🛒 <a href="${product.url}">Comprar agora na ${product.platform.toUpperCase()}</a>`;

    try {
      if (product.image) {
        await sendTelegramPhoto(product.image, textMessage);
      } else {
        await sendTelegramText(textMessage);
      }
      await markNotified(product.id);
    } catch (err) {
      console.error("❌ Erro ao notificar Telegram, tentando fallback apenas texto.");
      try {
        await sendTelegramText(textMessage);
        await markNotified(product.id);
      } catch (err2) {
        console.error("❌ Falha total no envio Telegram:", err2.message);
      }
    }
  }

  await setLastPrice(product.id, product.price);
}
