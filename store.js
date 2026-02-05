import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_PATH = path.join(__dirname, ".prices.json");

let lastPrices = new Map();

try {
  if (fs.existsSync(STORE_PATH)) {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const data = JSON.parse(raw);
    lastPrices = new Map(Object.entries(data));
  }
} catch (error) {
  console.log("⚠️ Falha ao carregar histórico de preços:", error.message);
}

function persistPrices() {
  try {
    const data = Object.fromEntries(lastPrices);
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log("⚠️ Falha ao salvar histórico de preços:", error.message);
  }
}

export function getLastPrice(asin) {
  const value = lastPrices.get(asin);
  return value ? Number(value) : undefined;
}

export function setLastPrice(asin, price) {
  lastPrices.set(asin, price);
  persistPrices();
}
