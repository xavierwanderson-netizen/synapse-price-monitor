import axios from "axios";
import {
  getLastPrice,
  setLastPrice,
  isCooldownActive,
  markNotified
} from "./store.js";
import { sendWhatsAppMessage } from "./whatsapp.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const DISCOUNT_THRESHOLD = parseInt(process.env.DISCOUNT_THRESHOLD_PERCENT || "12", 10);

function isNotificationPauseTime() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const pauseStartMinutes = 23 * 60 + 30;
  const pauseEndMinutes = 8 * 60 + 30;
  return totalMinutes >= pauseStartMinutes || totalMinutes < pauseEndMinutes;
}

function getNotificationWindowInfo() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const pauseStartMinutes = 23 * 60 + 30;
  const pauseEndMinutes = 8 * 60 + 30;

  if (totalMinutes >= pauseStartMinutes) {
    const minutesUntilResume = (24 * 60 - totalMinutes) + pauseEndMinutes;
    const resumeTime = new Date(now.getTime() + minutesUntilResume * 60000).toLocaleTimeString('pt-BR');
    return { isPaused: true, minutesUntilResume, resumeTime };
  } else if (totalMinutes < pauseEndMinutes) {
    const minutesUntilResume = pauseEndMinutes - totalMinutes;
    const resumeTime = new Date(now.getTime() + minutesUntilResume * 60000).toLocaleTimeString('pt-BR');
    return { isPaused: true, minutesUntilResume, resumeTime };
  } else {
    const minutesUntilPause = pauseStartMinutes - totalMinutes;
    return { isPaused: false, minutesUntilPause, pauseStartsAt: new Date(now.getTime() + minutesUntilPause * 60000).toLocaleTimeString('pt-BR') };
  }
}

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

// ─── TELEGRAM ────────────────────────────────────────────────────────────────

const inlineKeyboard = (url) => ({
  inline_keyboard: [[{ text: "🛒 COMPRAR AGORA", url }]]
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

// ─── MENSAGENS ───────────────────────────────────────────────────────────────

function buildTelegramMessage(product, label, icon, discount, lastPrice, savings) {
  return `${icon} <b>${label}</b> ${icon}
━━━━━━━━━━━━━━━━━━
📦 <b>${escapeHtml(product.title)}</b>

❌ De: <s>R$ ${formatCurrency(lastPrice)}</s>
✅ Por: <b>R$ ${formatCurrency(product.price)}</b>

💰 <b>Economia de: R$ ${formatCurrency(savings)}</b>
📉 Desconto: <b>${discount.toFixed(0)}% OFF</b>
🏷️ Loja: <code>${product.platform.toUpperCase()}</code>
━━━━━━━━━━━━━━━━━━`;
}

function buildWhatsAppMessage(product, label, icon, discount, lastPrice, savings) {
  // WhatsApp usa markdown próprio: *bold*, ~strikethrough~
  return `${icon} *${label}* ${icon}
━━━━━━━━━━━━━━━━━━
📦 *${product.title}*

❌ De: ~R$ ${formatCurrency(lastPrice)}~
✅ Por: *R$ ${formatCurrency(product.price)}*

💰 *Economia de: R$ ${formatCurrency(savings)}*
📉 Desconto: *${discount.toFixed(0)}% OFF*
🏷️ Loja: ${product.platform.toUpperCase()}

🛒 *COMPRAR AGORA:*
${product.url}
━━━━━━━━━━━━━━━━━━`;
}

// ─── NOTIFICAÇÃO PRINCIPAL ───────────────────────────────────────────────────

export async function notifyIfPriceDropped(product) {
  if (!product || !product.id || !product.price) return;

  // Sanity check: ignora preços obviamente inválidos (< R$ 1,00)
  if (product.price < 1.0) {
    console.warn(`⚠️ Preço suspeito ignorado para ${product.id}: R$ ${product.price} (< R$ 1,00)`);
    return;
  }

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
      await setLastPrice(product.id, product.price);
      return;
    }

    // Verificar horário de pausa (23:30 - 08:30)
    if (isNotificationPauseTime()) {
      const windowInfo = getNotificationWindowInfo();
      console.log(`⏸️  Notificação em pausa (23:30-08:30). Será enviada após ${windowInfo.resumeTime}`);
      await setLastPrice(product.id, product.price);
      return;
    }

    const { label, icon, discount } = getOfferLevel(lastPrice, product.price);
    const savings = lastPrice - product.price;

    const telegramMsg = buildTelegramMessage(product, label, icon, discount, lastPrice, savings);
    const whatsappMsg = buildWhatsAppMessage(product, label, icon, discount, lastPrice, savings);
    const hasImage = product.image && product.image.startsWith("http");

    // ── Telegram ──
    try {
      if (hasImage) {
        await sendTelegramPhoto(product.image, telegramMsg, product.url);
      } else {
        await sendTelegramText(telegramMsg, product.url);
      }
      await markNotified(product.id);
    } catch (err) {
      console.error("❌ Erro Telegram (foto), tentando texto...");
      try {
        await sendTelegramText(telegramMsg, product.url);
        await markNotified(product.id);
      } catch (err2) {
        console.error("❌ Falha total Telegram:", err2.message);
      }
    }

    // ── WhatsApp ──
    try {
      await sendWhatsAppMessage(whatsappMsg, hasImage ? product.image : null);
    } catch (err) {
      console.error("❌ Falha WhatsApp:", err.message);
    }
  }

  await setLastPrice(product.id, product.price);
}

// Exportada para debug/monitoramento
export function debugNotificationWindow() {
  const info = getNotificationWindowInfo();
  if (info.isPaused) {
    console.log(`⏸️  NOTIFICAÇÕES EM PAUSA até ${info.resumeTime} (${info.minutesUntilResume} minutos)`);
  } else {
    console.log(`✅ NOTIFICAÇÕES ATIVAS até ${info.pauseStartsAt} (${info.minutesUntilPause} minutos)`);
  }
  return info;
}
