import fs from "fs";
import axios from "axios";
import { getAmazonPrice } from "./amazon.js";
import {
  addPriceHistory,
  getLastPrice,
  setLastPrice,
  canAlert,
  markAlerted
} from "./store.js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Ajustáveis via Railway Variables
const DISCOUNT_THRESHOLD = Number(process.env.DISCOUNT_THRESHOLD_PERCENT || 15);
const COOLDOWN_HOURS = Number(process.env.ALERT_COOLDOWN_HOURS || 12);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1200);

// Telegram Markdown (versão “Markdown” antiga) quebra fácil com caracteres do título
function escapeMarkdown(text = "") {
  return text
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/`/g, "\\`");
}

function brl(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendTelegram({ title, oldPrice, newPrice, image, url }) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("⚠️ Telegram não configurado (TOKEN/CHAT_ID). Pulando alerta.");
    return;
  }

  const safeTitle = escapeMarkdown(title);
  const text =
`🔥 *OFERTA DETECTADA*
📦 ${safeTitle}

💸 De ${brl(oldPrice)}
👉 Por ${brl(newPrice)}

🔗 ${url}`;

  // 1) tenta com foto
  if (image) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
        {
          chat_id: TELEGRAM_CHAT_ID,
          photo: image,
          caption: text,
          parse_mode: "Markdown"
        },
        { timeout: 20000 }
      );
      return;
    } catch (e) {
      console.log("⚠️ sendPhoto falhou, tentando sendMessage:", e?.response?.data || e?.message || e);
    }
  }

  // 2) fallback: só texto
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown"
    },
    { timeout: 20000 }
  );
}

export async function runCheckOnce() {
  const products = JSON.parse(fs.readFileSync("./products.json", "utf-8"));

  for (const product of products) {
    const asin = product.asin;

    try {
      const data = await getAmazonPrice(asin);
      if (!data?.price) {
        console.log(`⚠️ [${asin}] sem preço (scraping falhou / página mudou).`);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      const last = getLastPrice(asin);
      addPriceHistory(asin, data.price);

      if (last != null) {
        const drop = ((last - data.price) / last) * 100;

        const shouldAlert =
          drop >= DISCOUNT_THRESHOLD &&
          canAlert(asin, COOLDOWN_HOURS) &&
          data.price > 0;

        console.log(
          `📌 [${asin}] last=${last} now=${data.price} drop=${drop.toFixed(2)}% alert=${shouldAlert}`
        );

        if (shouldAlert) {
          await sendTelegram({
            title: data.title || product.title || `Produto ${asin}`,
            oldPrice: last,
            newPrice: data.price,
            image: data.image || null,
            url: data.affiliateUrl
          });
          markAlerted(asin);
        }
      } else {
        console.log(`🆕 [${asin}] primeiro preço capturado: ${data.price}`);
      }

      setLastPrice(asin, data.price);
    } catch (err) {
      console.log(`❌ [${asin}] erro no check:`, err?.response?.status, err?.message || err);
    }

    // pequeno delay entre produtos para reduzir bloqueio
    await sleep(REQUEST_DELAY_MS);
  }
}
