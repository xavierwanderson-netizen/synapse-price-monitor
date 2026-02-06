import fetch from 'node-fetch';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Regra de sanidade:
 * Bloqueia alertas com preço muito abaixo do histórico
 * (evita erro de parser virar alerta fake)
 */
function isSuspiciousPrice(now, previousLowest) {
  if (!previousLowest) return false;
  return now < previousLowest * 0.4; // abaixo de 40% do menor histórico
}

/**
 * Monta mensagem comercial focada em conversão
 */
function buildCommercialMessage({
  title,
  asin,
  now,
  previousLowest,
  dropPercent,
  url
}) {
  const economy = (previousLowest - now).toFixed(2);

  return `
🚨 OFERTA REAL NA AMAZON 🚨

🔥 ${title}
🏷️ MENOR PREÇO JÁ REGISTRADO

💰 De: R$ ${previousLowest.toFixed(2)}
💥 Por: R$ ${now.toFixed(2)}
📉 Economia: R$ ${economy} (${dropPercent.toFixed(1)}% OFF)

⚠️ Preço pode subir a qualquer momento.
👉 Garanta agora com desconto:

🔗 ${url}
`.trim();
}

/**
 * Envia alerta ao Telegram
 */
export async function sendAlert({
  title,
  asin,
  now,
  previousLowest,
  dropPercent,
  url
}) {
  // 🔒 Bloqueio de preço suspeito
  if (isSuspiciousPrice(now, previousLowest)) {
    console.log(
      `⚠️ [${asin}] alerta bloqueado (preço suspeito: ${now} < 40% de ${previousLowest})`
    );
    return;
  }

  const message = buildCommercialMessage({
    title,
    asin,
    now,
    previousLowest,
    dropPercent,
    url
  });

  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: false
    })
  });
}
