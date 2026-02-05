import axios from "axios";

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️ Telegram não configurado (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID)");
    return null;
  }

  return { token, chatId };
}

export async function notifyTelegram({ text, imageUrl }) {
  const config = getTelegramConfig();

  if (!config) {
    return;
  }

  const { token, chatId } = config;
  const baseUrl = `https://api.telegram.org/bot${token}`;

  if (imageUrl) {
    await axios.post(`${baseUrl}/sendPhoto`, {
      chat_id: chatId,
      photo: imageUrl,
      caption: text,
    });
    console.log("📲 Mensagem com imagem enviada ao Telegram");
    return;
  }

  await axios.post(`${baseUrl}/sendMessage`, {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
  });

  console.log("📲 Mensagem enviada ao Telegram");
}
