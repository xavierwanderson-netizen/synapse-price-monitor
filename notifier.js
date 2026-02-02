import fs from "fs";
import path from "path";
import axios from "axios";
import { getAmazonPrice } from "./amazon.js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const DATA_FILE = path.resolve("./store.json");

// regra: queda mínima (%)
const DISCOUNT_THRESHOLD = 15;

// ---------- STORE ----------
function loadStore() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- TELEGRAM ----------
async function sendTelegram({ title, oldPrice, newPrice, image, url }) {
  const text =
`🔥 *OFERTA DETECTADA*
📦 ${title}

💸 De R$ ${oldPrice.toFixed(2)}
👉 Por R$ ${newPrice.toFixed(2)}

🔗 ${url}`;

  if (image) {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        photo: image,
        caption: text,
        parse_mode: "Markdown"
      }
    );
  } else {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown"
      }
    );
  }
}

// ---------- MAIN ----------
export async function runCheckOnce() {
  const products = JSON.parse(fs.readFileSync("./products.json", "utf-8"));
  const store = loadStore();

  for (const product of products) {
    const asin = product.asin;

    const data = await getAmazonPrice(asin);
    if (!data) continue;

    const last = store[asin]?.price;

    if (last) {
      const drop = ((last - data.price) / last) * 100;

      if (drop >= DISCOUNT_THRESHOLD) {
        await sendTelegram({
          title: data.title,
          oldPrice: last,
          newPrice: data.price,
          image: data.image,
          url: data.affiliateUrl
        });
      }
    }

    store[asin] = {
      price: data.price,
      updatedAt: new Date().toISOString()
    };
  }

  saveStore(store);
}
