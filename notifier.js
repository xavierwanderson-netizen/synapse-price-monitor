import axios from "axios";
// CORREÇÃO TÉCNICA: Ajustado para os nomes reais exportados pelo seu store.js
import { getStore, setLastPrice, isCooldownActive, markNotified, getLastPrice } from "./store.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false
    });
  } catch (error) {
    console.error("❌ Erro ao enviar Telegram:", error?.message || error);
  }
}

export async function notifyIfPriceDropped(product) {
  const { id, title, price, url, platform } = product;
  if (!id || typeof price !== "number") return;

  const lastPrice = await getLastPrice(id);

  // Se é a primeira vez, apenas registra para ter base de comparação futura
  if (lastPrice === null) {
    console.log(`🆕 [${platform.toUpperCase()}] Primeiro registro: ${title} - R$ ${price.toFixed(2)}`);
    await setLastPrice(id, price);
    return;
  }

  // MANTIDA SUA REGRA DE MARKETING: Notifica apenas se o preço caiu
  if (price < lastPrice) {
    const cooldown = await isCooldownActive(id);
    const dropPercent = ((lastPrice - price) / lastPrice) * 100;

    // SUA FORMATAÇÃO DE MARKETING PRESERVADA
    const message = `
🔥 <b>PREÇO BAIXOU (${platform.toUpperCase()})</b>

📦 <b>${title}</b>

💰 De: <s>R$ ${lastPrice.toFixed(2)}</s>
✅ Por: <b>R$ ${price.toFixed(2)}</b>
📉 Queda: <b>${dropPercent.toFixed(0)}% OFF!</b>

🚀 <i>Aproveite antes que o estoque acabe!</i>

🛒 <b>Compre aqui:</b> ${url}
`.trim();

    if (!cooldown) {
      await sendTelegramMessage(message);
      await markNotified(id);
      console.log(`📢 [ALERTA] ${title} baixou ${dropPercent.toFixed(0)}%`);
    } else {
      console.log(`⏳ Cooldown ativo para ${title}. Preço atual: R$ ${price.toFixed(2)}`);
    }

    // Atualiza o preço no banco para a próxima verificação
    await setLastPrice(id, price);
  } else if (price > lastPrice) {
    // Se o preço subiu, apenas atualizamos o registro sem enviar notificação
    await setLastPrice(id, price);
    console.log(`📈 Preço subiu em ${platform}: ${title} (R$ ${price.toFixed(2)})`);
  }
}
