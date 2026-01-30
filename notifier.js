import axios from "axios";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function notifyTelegram({
  title,
  price,
  oldPrice,
  discountPercent,
  affiliateUrl,
  image,
  customText
}) {
  try {
    // Caso especial: ranking diário (texto puro)
    if (customText) {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: CHAT_ID,
        text: customText,
        parse_mode: "Markdown",
        disable_web_page_preview: false
      });
      return;
    }

    // Copy otimizada para conversão
    const caption =
`🚨 *OFERTA IMPERDÍVEL AGORA*

🛒 *${title}*

💸 *DESCONTO REAL:* ${discountPercent.toFixed(1)}%
💰 De *R$ ${oldPrice.toFixed(2)}* por *R$ ${price.toFixed(2)}*

⚠️ *Preço pode subir a qualquer momento*
👉 *Clique e garanta agora:*
${affiliateUrl}
`;

    // Se tiver imagem, envia com foto
    if (image) {
      await axios.post(`${TELEGRAM_API}/sendPhoto`, {
        chat_id: CHAT_ID,
        photo: image,
        caption,
        parse_mode: "Markdown"
      });
    } else {
      // fallback sem imagem
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: CHAT_ID,
        text: caption,
        parse_mode: "Markdown",
        disable_web_page_preview: false
      });
    }

  } catch (error) {
    console.error(
      "Erro ao enviar Telegram:",
      error.response?.data || error.message
    );
  }
}
