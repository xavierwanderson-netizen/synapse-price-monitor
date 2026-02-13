import axios from "axios";
import { getLastPrice, setLastPrice, isCooldownActive, markNotified } from "./store.js";

const webhook = process.env.WHATSAPP_WEBHOOK_URL;

// Função para classificar intensidade da oferta
function getOfferLevel(oldPrice, newPrice) {
  const discount = ((oldPrice - newPrice) / oldPrice) * 100;

  if (discount >= 40) return { label: "💥 IMPERDÍVEL", discount };
  if (discount >= 25) return { label: "🚨 SUPER OFERTA", discount };
  if (discount >= 10) return { label: "🔥 BOA OFERTA", discount };
  return { label: "📉 QUEDA DE PREÇO", discount };
}

export async function notifyIfPriceDropped(product) {
  if (!product || !product.id || !product.price) return;

  const lastPrice = await getLastPrice(product.id);

  // Primeira vez vendo o produto
  if (lastPrice === null) {
    await setLastPrice(product.id, product.price);
    return;
  }

  // Só notifica se caiu o preço
  if (product.price < lastPrice) {
    const cooldown = await isCooldownActive(product.id);
    if (cooldown) return;

    const { label, discount } = getOfferLevel(lastPrice, product.price);
    const savings = lastPrice - product.price;

    const textMessage =
`${label}
${product.title}

💰 De: R$ ${lastPrice.toFixed(2)}
🔥 Por: R$ ${product.price.toFixed(2)}
💸 Economia: R$ ${savings.toFixed(2)} (${discount.toFixed(0)}% OFF)

🛒 Comprar agora:
${product.url}`;

    try {
      // Se tiver imagem, tenta enviar com imagem
      if (product.image) {
        await axios.post(webhook, {
          image: product.image,
          caption: textMessage
        });
      } else {
        // Envio padrão sem imagem
        await axios.post(webhook, {
          text: textMessage
        });
      }

      await markNotified(product.id);
    } catch (err) {
      console.error("Erro ao enviar notificação com imagem, tentando fallback:", err.message);

      // fallback para texto puro
      try {
        await axios.post(webhook, { text: textMessage });
        await markNotified(product.id);
      } catch (err2) {
        console.error("Erro no fallback de texto:", err2.message);
      }
    }
  }

  // Atualiza preço salvo
  await setLastPrice(product.id, product.price);
}
