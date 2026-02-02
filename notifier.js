import fs from "fs";
import axios from "axios";
import { getAmazonPrice } from "./amazon.js";
import {
  addPriceHistory,
  getLowestPrice,
  canAlert,
  markAlerted
} from "./store.js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const DISCOUNT_THRESHOLD = Number(process.env.DISCOUNT_THRESHOLD_PERCENT || 15);
const COOLDOWN_HOURS = Number(process.env.ALERT_COOLDOWN_HOURS || 12);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1200);

function brl(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function sendTelegram({ title, oldPrice, newPrice, url }) {
  const text =
`🔥 *MELHOR PREÇO HISTÓRICO*
📦 ${title}

📉 Menor histórico: ${brl(oldPrice)}
🔥 Agora: ${brl(newPrice)}

🔗 ${url}`;

  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown"
    }
  );
}

export async function runCheckOnce() {
  const products = JSON.parse(fs.readFileSync("./products.json", "utf-8"));

  for (const { asin, title } of products) {
    try {
      const data = await getAmazonPrice(asin);
      if (!data?.price) continue;

      addPriceHistory(asin, data.price);

      const lowest = getLowestPrice(asin);
      if (!lowest) continue;

      const drop = ((lowest - data.price) / lowest) * 100;

      const shouldAlert =
        data.price < lowest &&
        Math.abs(drop) >= DISCOUNT_THRESHOLD &&
        canAlert(asin, COOLDOWN_HOURS);

      console.log(
        `📊 [${asin}] lowest=${lowest} now=${data.price} drop=${drop.toFixed(2)}% alert=${shouldAlert}`
      );

      if (shouldAlert) {
        await sendTelegram({
          title: data.title || title || asin,
          oldPrice: lowest,
          newPrice: data.price,
          url: data.affiliateUrl
        });
        markAlerted(asin);
      }

    } catch (e) {
      console.log(`❌ [${asin}] erro:`, e.message);
    }

    await sleep(REQUEST_DELAY_MS);
  }
}
