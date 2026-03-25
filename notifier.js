import axios from "axios";
import fs from "fs";
import {
  getLastPrice,
  setLastPrice,
  isCooldownActive,
  markNotified
} from "./store.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WA_GROUP_ID = process.env.WA_GROUP_ID;
const WHATSAPP_JSON_PATH = "/.data/whatsapp.json";

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

async function sendTelegramPhoto(image, caption, url, attempt = 1) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      chat_id: TELEGRAM_CHAT_ID,
      photo: image,
      caption,
      parse_mode: "HTML",
      reply_markup: inlineKeyboard(url)
    }, {
      timeout: 10000
    });
  } catch (error) {
    if (attempt < 2) {
      console.warn(`⚠️ Telegram Photo falhou. Tentando novamente em 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      return sendTelegramPhoto(image, caption, url, attempt + 1);
    }
    throw error;
  }
}

async function sendTelegramText(text, url, attempt = 1) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: inlineKeyboard(url)
    }, {
      timeout: 10000
    });
  } catch (error) {
    if (attempt < 2) {
      console.warn(`⚠️ Telegram Text falhou. Tentando novamente em 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      return sendTelegramText(text, url, attempt + 1);
    }
    throw error;
  }
}

async function sendWhatsAppMessage(message, attempt = 1) {
  try {
    const response = await axios.post(`https://graph.instagram.com/v18.0/${WA_GROUP_ID}/messages`, {
      messaging_product: "whatsapp",
      to: WA_GROUP_ID,
      type: "text",
      text: { body: message }
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.WHATSAPP_BUSINESS_ACCOUNT_TOKEN || process.env.WA_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    console.log(`✅ [WhatsApp] Mensagem enviada ao grupo.`);
    updateWhatsAppStats();
    return response.data;
  } catch (error) {
    if (attempt < 2) {
      console.warn(`⚠️ WhatsApp falhou. Tentando novamente em 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      return sendWhatsAppMessage(message, attempt + 1);
    }
    throw error;
  }
}

function updateWhatsAppStats() {
  try {
    let stats = {
      lastMessageTime: Date.now(),
      messageCount: 0,
      messagesLast24h: 0,
      lastProductIds: [],
      maxMessagesPerDay: 100
    };

    if (fs.existsSync(WHATSAPP_JSON_PATH)) {
      const existing = JSON.parse(fs.readFileSync(WHATSAPP_JSON_PATH, "utf-8"));
      stats = { ...existing, lastMessageTime: Date.now(), messageCount: (existing.messageCount || 0) + 1 };
    }

    const dir = "/.data";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(WHATSAPP_JSON_PATH, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.warn(`⚠️ Erro ao atualizar WhatsApp stats:`, err.message);
  }
}

export function validateNotificationChannels() {
  let channels = [];

  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    console.log("✅ Telegram: Configurado");
    channels.push("telegram");
  } else {
    console.warn("⚠️ Telegram: NÃO configurado");
  }

  if (WA_GROUP_ID && (process.env.WHATSAPP_BUSINESS_ACCOUNT_TOKEN || process.env.WA_TOKEN)) {
    console.log("✅ WhatsApp: Configurado");
    channels.push("whatsapp");
  } else {
    console.warn("⚠️ WhatsApp: NÃO configurado");
  }

  if (channels.length === 0) {
    console.error("❌ NENHUM CANAL DE NOTIFICAÇÃO CONFIGURADO! Defina Telegram ou WhatsApp.");
  }

  return channels;
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

    const whatsappMessage = textMessage.replace(/<[^>]*>/g, ''); // Remove HTML tags for WhatsApp

    let notificationSent = false;

    // Tentar Telegram com foto
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        if (product.image && product.image.startsWith("http")) {
          await sendTelegramPhoto(product.image, textMessage, product.url);
        } else {
          await sendTelegramText(textMessage, product.url);
        }
        notificationSent = true;
      } catch (err) {
        console.warn("⚠️ Erro ao notificar Telegram:", err.message);
        try {
          await sendTelegramText(textMessage, product.url);
          notificationSent = true;
        } catch (err2) {
          console.error("❌ Falha total no envio Telegram:", err2.message);
        }
      }
    }

    // Tentar WhatsApp como complemento ou fallback
    if (WA_GROUP_ID && (process.env.WHATSAPP_BUSINESS_ACCOUNT_TOKEN || process.env.WA_TOKEN)) {
      try {
        await sendWhatsAppMessage(whatsappMessage);
        notificationSent = true;
      } catch (err) {
        console.error("❌ Erro ao notificar WhatsApp:", err.message);
      }
    }

    if (notificationSent) {
      await markNotified(product.id);
    }
  }

  await setLastPrice(product.id, product.price);
}
