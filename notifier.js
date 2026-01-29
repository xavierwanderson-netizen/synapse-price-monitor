import axios from "axios";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function notifyTelegram({
  title,
  price,
  oldPrice,
  discountPercent,
  affiliateUrl,
  image
}) {
  const caption = `
🔥 OFERTA REAL DETECTADA

🛒 ${title}

💰 De R$ ${oldPrice.toFixed(2)} por R$ ${price.toFixed(2)}
📉 Desconto: ${discountPercent.toFixed(1)}%

🔗 ${affiliateUrl}
`;

  try {
    await axios.post(`${TELEGRAM_API}/sendPhoto`, {
      chat_id: CHAT_ID,
      photo: image,
      caption
    });
  } catch (error) {
    console.error("Erro ao enviar mensagem para o Telegram:", error.response?.data || error.message);
  }
}
