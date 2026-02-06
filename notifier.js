import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fetchAmazonProduct } from "./amazon.js";
import {
  addPriceHistory,
  getLowestPrice,
  setLowestPrice,
  getLastPrice,
  setLastPrice,
  canAlert,
  markAlerted,
} from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readProducts() {
  const file = path.join(__dirname, "products.json");
  const raw = fs.readFileSync(file, "utf-8");
  const list = JSON.parse(raw);
  // Normaliza para {asin,title?,category?}
  return list
    .map((p) => ({
      asin: String(p.asin || "").trim(),
      title: p.title ? String(p.title).trim() : null,
      category: p.category ? String(p.category).trim() : null,
      status: p.status ? String(p.status).trim() : "active",
    }))
    .filter((p) => p.asin && p.asin.length === 10 && p.status !== "disabled");
}

function pctDrop(from, to) {
  if (!from || from <= 0) return null;
  return ((from - to) / from) * 100;
}

async function sendTelegramPhoto({ imageUrl, caption }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  await axios.post(url, {
    chat_id: chatId,
    photo: imageUrl,
    caption,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

async function sendTelegramMessage({ text }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await axios.post(url, {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  });
}

function formatBRL(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function runCheckOnce() {
  const products = readProducts();
  const thresholdPct = Number(process.env.DROP_THRESHOLD_PERCENT || 5); // % vs menor histórico anterior
  const cooldownHours = Number(process.env.ALERT_COOLDOWN_HOURS || 12);

  console.log(`🔎 Checando ${products.length} produtos | threshold=${thresholdPct}% cooldown=${cooldownHours}h`);

  for (const p of products) {
    const asin = p.asin;
    try {
      const prevLowest = getLowestPrice(asin); // menor histórico ANTES desta leitura
      const prevLast = getLastPrice(asin);

      const data = await fetchAmazonProduct(asin);

      if (data.price == null) {
        console.log(`⚠️ [${asin}] preço não encontrado (html sem preço)`);
        continue;
      }

      // Atualiza last price e histórico sempre
      setLastPrice(asin, data.price);
      addPriceHistory(asin, data.price);

      // Inicialização do menor histórico (primeiro valor não alerta)
      if (prevLowest == null) {
        setLowestPrice(asin, data.price);
        console.log(`📌 [${asin}] init lowest=${data.price}`);
        continue;
      }

      const newLowest = Math.min(prevLowest, data.price);
      if (newLowest !== prevLowest) {
        setLowestPrice(asin, newLowest);
      }

      const drop = pctDrop(prevLowest, data.price);
      const isNewRecordLow = data.price < prevLowest;
      const shouldAlert = isNewRecordLow && drop != null && drop >= thresholdPct && canAlert(asin, cooldownHours);

      console.log(
        `📊 [${asin}] lowest=${prevLowest} now=${data.price} drop=${drop?.toFixed?.(2) ?? "—"}% alert=${shouldAlert}`
      );

      if (shouldAlert) {
        const title = data.title || p.title || `Produto ${asin}`;
        const link = data.link;

        const lines = [
          `🔥 <b>Nova mínima histórica!</b>`,
          `<b>${title}</b>`,
          ``,
          `🧾 ASIN: <code>${asin}</code>`,
          `💰 Agora: <b>${formatBRL(data.price)}</b>`,
          `📉 Anterior (mínima): ${formatBRL(prevLowest)} (${drop.toFixed(1)}% ↓)`,
          prevLast != null ? `🕒 Último preço visto: ${formatBRL(prevLast)}` : null,
          ``,
          `🔗 <a href="${link}">Abrir na Amazon</a>`,
        ].filter(Boolean);

        const caption = lines.join("\n");

        if (data.image) {
          await sendTelegramPhoto({ imageUrl: data.image, caption });
        } else {
          await sendTelegramMessage({ text: caption });
        }

        markAlerted(asin);
      }
    } catch (e) {
      const msg = e?.message || String(e);
      console.log(`❌ [${asin}] erro: ${msg}`);
    }
  }
}
