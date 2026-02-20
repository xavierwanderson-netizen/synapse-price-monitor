import axios from "axios";
import {
  getLastPrice,
  setLastPrice,
  isCooldownActive,
  markNotified
} from "./store.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const DISCOUNT_THRESHOLD = parseInt(process.env.DISCOUNT_THRESHOLD_PERCENT || "12", 10);

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getOfferLevel(oldPrice, newPrice) {
  const discount = ((oldPrice - newPrice) / oldPrice) * 100;
  if (discount >= 40) return { label: "💥 PREÇO EXPLODIU (IMPERDÍVEL)", icon: "🧨", discount };
  if (discount >= 25) return { label: "🚨 SUPER OFERTA DETECTADA", icon: "⭐", discount };
  if (discount >= DISCOUNT_THRESHOLD) return { label: "🔥 BOA OFERTA", icon: "✅", discount };
  return { label: "📉 QUEDA DE PREÇO", icon: "🏷️", discount };
}

// Botão inline clicável — converte muito mais que link no texto
const inlineKeyboard = (url) => ({
  inline_keyboard: [[
    { text: "🛒 COMPRAR AGORA", url }
  ]]
});

async function sendTelegramPhoto(image, caption, url) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    chat_id: TELEGRAM_CHAT_ID,
    photo: image,
    caption,
    parse_mode: "HTML",
    reply_markup: inlineKeyboard(url)
  });
}

async function sendTelegramText(text, url) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
    reply_markup: inlineKeyboard(url)
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

    if (discountPercent < DISCOUNT_THRESHOLD) {
      await setLastPrice(product.id, product.price);
      return;
    }

    const cooldown = await isCooldownActive(product.id);
    if (cooldown) {
      await setLastPrice(product.id, product.price); // atualiza preço mesmo em cooldown
      return;
    }

    const { label, icon, discount } = getOfferLevel(lastPrice, product.price);
    const savings = lastPrice - product.price;

    const textMessage =
`${icon} <b>${label}</b> ${icon}
━━━━━━━━━━━━━━━━━━
📦 <b>${escapeHtml(product.title)}</b>

❌ De: <s>R$ ${formatCurrency(lastPrice)}</s>
✅ Por: <b>R$ ${formatCurrency(product.price)}</b>

💰 <b>Economia de: R$ ${formatCurrency(savings)}</b>
📉 Desconto: <b>${discount.toFixed(0)}% OFF</b>
🏷️ Loja: <code>${product.platform.toUpperCase()}</code>
━━━━━━━━━━━━━━━━━━`;

    try {
      if (product.image && product.image.startsWith("http")) {
        await sendTelegramPhoto(product.image, textMessage, product.url);
      } else {
        await sendTelegramText(textMessage, product.url);
      }
      await markNotified(product.id);
    } catch (err) {
      console.error("❌ Erro ao notificar Telegram, tentando fallback apenas texto.");
      try {
        await sendTelegramText(textMessage, product.url);
        await markNotified(product.id);
      } catch (err2) {
        console.error("❌ Falha total no envio Telegram:", err2.message);
      }
    }
  }

  await setLastPrice(product.id, product.price);
}
