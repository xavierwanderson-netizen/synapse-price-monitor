import axios from "axios";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TOKEN || !CHAT_ID) {
  throw new Error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos");
}

const API_URL = `https://api.telegram.org/bot${TOKEN}`;

export async function notifyTelegram(message) {
  try {
    await axios.post(`${API_URL}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
      disable_web_page_preview: false
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem para o Telegram:", err.response?.data || err.message);
  }
}
