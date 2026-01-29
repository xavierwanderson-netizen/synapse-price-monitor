import axios from "axios";

export async function notifyTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
    });
    console.log("📨 Mensagem enviada para o Telegram");
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem Telegram:", err.message);
  }
}
