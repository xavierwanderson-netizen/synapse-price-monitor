export async function notifyTelegram({
  title,
  price,
  oldPrice,
  discountPercent,
  affiliateUrl,
  image,
  customText
}) {
  const caption = customText || `
🔥 OFERTA REAL DETECTADA

🛒 ${title}

💰 De R$ ${oldPrice.toFixed(2)} por R$ ${price.toFixed(2)}
📉 Desconto: ${discountPercent.toFixed(1)}%

🔗 ${affiliateUrl}
`;

  // ... (envio igual ao que você já tem)
}
