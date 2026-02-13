import axios from "axios";
import { getLastPrice, setLastPrice, isCooldownActive, markNotified } from "./store.js";

const webhook = process.env.WHATSAPP_WEBHOOK_URL;

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

    const message = {
      text: `🔥 OFERTA REAL 🔥\n${product.title}\n💰 R$ ${product.price.toFixed(2)}\n🔗 ${product.url}`
    };

    try {
      await axios.post(webhook, message);
      await markNotified(product.id);
    } catch (err) {
      console.error("Erro ao enviar notificação:", err.message);
    }
  }

  // Atualiza preço salvo
  await setLastPrice(product.id, product.price);
}
