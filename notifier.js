import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { fetchAmazonProduct, buildAffiliateLink } from "./amazon.js";
import {
  getLastPrice,
  setLastPrice,
  getLowestPrice,
  setLowestPrice,
  addPriceHistory,
  canAlert,
  markAlerted
} from "./store.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ⏱️ Delay base entre ASINs (ms)
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1500);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 📦 Leitura segura do products.json
function loadProducts() {
  const filePath = path.join(__dirname, "products.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

// 😴 Delay com jitter humano (anti-captcha)
function sleepWithJitter(baseMs) {
  const jitter = Math.floor(Math.random() * 500); // 0–500ms
  const total = baseMs + jitter;
  return new Promise((resolve) => setTimeout(resolve, total));
}

function isSuspiciousPrice(now, previousLowest) {
  if (!previousLowest) return false;
  return now < previousLowest * 0.4;
}

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
👉 Garanta agora:

🔗 ${url}
`.trim();
}

async function sendAlert(data) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  await fetch(telegramUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: buildCommercialMessage(data),
      disable_web_page_preview: false
    })
  });
}

export async function runCheckOnce() {
  const products = loadProducts();

  for (const { asin } of products) {
    try {
      console.log(`🔍 Verificando ASIN ${asin}`);

      const product = await fetchAmazonProduct(asin);
      if (!product || !product.price) {
        // Delay mesmo quando falha (mantém padrão humano)
        await sleepWithJitter(REQUEST_DELAY_MS);
        continue;
      }

      const now = product.price;
      const last = getLastPrice(asin);
      const lowest = getLowestPrice(asin);

      addPriceHistory(asin, now);

      if (!lowest || now < lowest) {
        setLowestPrice(asin, now);
      }

      setLastPrice(asin, now);

      if (lowest && now < lowest && canAlert(asin)) {
        const dropPercent = ((lowest - now) / lowest) * 100;

        if (!isSuspiciousPrice(now, lowest)) {
          await sendAlert({
            title: product.title,
            asin,
            now,
            previousLowest: lowest,
            dropPercent,
            url: buildAffiliateLink(asin)
          });

          markAlerted(asin);
        }
      }

    } catch (e) {
      console.log(`❌ Erro no ASIN ${asin}:`, e?.message || e);
    }

    // ⏱️ DELAY HUMANO ENTRE ASINs (ANTI-CAPTCHA)
    await sleepWithJitter(REQUEST_DELAY_MS);
  }
}
