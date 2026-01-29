import axios from "axios";

export async function notifyWhatsApp(message) {
  const url = process.env.WHATSAPP_WEBHOOK_URL;

  if (!url) {
    console.log("⚠️ Webhook do WhatsApp não configurado");
    return;
  }

  await axios.post(url, {
    text: message
  });

  console.log("📲 Mensagem enviada ao WhatsApp");
}
