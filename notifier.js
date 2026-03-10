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

/**
 * Verifica se está no horário de pausa de notificações (23:30 - 08:30)
 * @returns {boolean} true se está em horário de pausa
 */
function isNotificationPauseTime() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 23:30 = 1410 minutos
  // 08:30 = 510 minutos
  const pauseStartMinutes = 23 * 60 + 30; // 1410
  const pauseEndMinutes = 8 * 60 + 30;    // 510

  // Se está entre 23:30 e 23:59 OU entre 00:00 e 08:30
  return totalMinutes >= pauseStartMinutes || totalMinutes < pauseEndMinutes;
}

/**
 * Retorna informações sobre o tempo até a próxima janela de notificação
 * @returns {object} { isPaused: boolean, minutesUntilResume: number, resumeTime: string }
 */
function getNotificationWindowInfo() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const pauseStartMinutes = 23 * 60 + 30; // 1410
  const pauseEndMinutes = 8 * 60 + 30;    // 510

  if (totalMinutes >= pauseStartMinutes) {
    // Está em pausa noturna (23:30 - 23:59)
    const minutesUntilResume = (24 * 60 - totalMinutes) + pauseEndMinutes;
    const resumeTime = new Date(now.getTime() + minutesUntilResume * 60000).toLocaleTimeString('pt-BR');
    return { isPaused: true, minutesUntilResume, resumeTime };
  } else if (totalMinutes < pauseEndMinutes) {
    // Está em pausa madrugada (00:00 - 08:30)
    const minutesUntilResume = pauseEndMinutes - totalMinutes;
    const resumeTime = new Date(now.getTime() + minutesUntilResume * 60000).toLocaleTimeString('pt-BR');
    return { isPaused: true, minutesUntilResume, resumeTime };
  } else {
    // Está ativo (08:30 - 23:30)
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

  // Sanity check: ignora preços obviamente inválidos (< R$ 1,00)
  // Evita falsos alertas causados por erros de unidade (ex: centavos tratados como reais)
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
      await setLastPrice(product.id, product.price); // atualiza preço mesmo em cooldown
      return;
    }

    // ✅ NOVO: Verificar se está no horário de pausa de notificações
    if (isNotificationPauseTime()) {
      const windowInfo = getNotificationWindowInfo();
      console.log(`⏸️  Notificação em pausa (23:30-08:30). Será enviada após ${windowInfo.resumeTime}`);
      await setLastPrice(product.id, product.price); // atualiza preço mesmo em pausa
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

// ✅ EXPORTAR: Função para debug/monitoramento
export function debugNotificationWindow() {
  const info = getNotificationWindowInfo();
  if (info.isPaused) {
    console.log(`⏸️  NOTIFICAÇÕES EM PAUSA até ${info.resumeTime} (${info.minutesUntilResume} minutos)`);
  } else {
    console.log(`✅ NOTIFICAÇÕES ATIVAS até ${info.pauseStartsAt} (${info.minutesUntilPause} minutos)`);
  }
  return info;
}
