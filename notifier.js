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

const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1500);
const DISCOUNT_THRESHOLD_PERCENT = Number(
  process.env.DISCOUNT_THRESHOLD_PERCENT || 12
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadProducts() {
  const filePath = path.join(__dirname, "products.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function sleepWithJitter(ms) {
  return new Promise(r =>
    setTimeout(r, ms + Math.floor(Math.random() * 500))
  );
}

function isSuspiciousPrice(now, lowest) {
  return lowest && now < lowest * 0.4;
}

function minimumEconomyRequired(lowest) {
  if (lowest <= 100) return 15;
  if (lowest <= 300) return 30;
  if (lowest <= 800) return 60;
  return 100;
}

// 🎯 CLASSIFICA INTENSIDADE
function classifyIntensity(dropPercent) {
  if (dropPercent >= 30) return "imperdivel";
  if (dropPercent >= 20) return "otima";
  return "boa";
}

// 📝 COPY DINÂMICA
function buildMessage({ title, now, lowest, dropPercent, url }) {
  const economy = (lowest - now).toFixed(2);
  const intensity = classifyIntensity(dropPercent);

  let header, subtitle, cta;

  if (intensity === "imperdivel") {
    header = "🚨🚨 OFERTA IMPERDÍVEL NA AMAZON 🚨🚨";
    subtitle = "🔥 Preço mais baixo já registrado";
    cta = "👉 Aproveite agora antes que acabe";
  } else if (intensity === "otima") {
    header = "🔥 ÓTIMA OFERTA NA AMAZON 🔥";
    subtitle = "📉 Preço muito abaixo do normal";
    cta = "👉 Vale muito a pena conferir";
  } else {
    header = "🔔 BOA OFERTA NA AMAZON 🔔";
    subtitle = "💰 Economia real no preço";
    cta = "👉 Veja os detalhes";
  }

  return `
${header}

🔥 ${title}
${subtitle}

💰 De: R$ ${lowest.toFixed(2)}
💥 Por: R$ ${now.toFixed(2)}
📉 Economia: R$ ${economy} (${dropPercent.toFixed(1)}% OFF)

⚠️ Preço pode subir a qualquer momento.
${cta}

🔗 ${url}
`.trim();
}

async function sendAlert(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      disable_web_page_preview: false
    })
  });
}

export async function runCheckOnce() {
  const products = loadProducts();

  for (const { asin } of products) {
    try {
      const product = await fetchAmazonProduct(asin);
      if (!product?.price) {
        await sleepWithJitter(REQUEST_DELAY_MS);
        continue;
      }

      const now = product.price;
      const lowest = getLowestPrice(asin);

      addPriceHistory(asin, now);

      if (!lowest || now < lowest) setLowestPrice(asin, now);
      setLastPrice(asin, now);

      if (lowest && now < lowest && canAlert(asin)) {
        const dropPercent = ((lowest - now) / lowest) * 100;
        const economy = lowest - now;

        if (
          dropPercent >= DISCOUNT_THRESHOLD_PERCENT &&
          economy >= minimumEconomyRequired(lowest) &&
          !isSuspiciousPrice(now, lowest)
        ) {
          await sendAlert(
            buildMessage({
              title: product.title,
              now,
              lowest,
              dropPercent,
              url: buildAffiliateLink(asin)
            })
          );
          markAlerted(asin);
        }
      }
    } catch (e) {
      console.log(`❌ Erro ASIN ${asin}:`, e?.message || e);
    }

    await sleepWithJitter(REQUEST_DELAY_MS);
  }
}
