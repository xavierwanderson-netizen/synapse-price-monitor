import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ prices: {}, alerts: {}, history: {} }, null, 2),
      "utf-8"
    );
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
}

function writeStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function addPriceHistory(asin, price, max = 20) {
  const store = readStore();
  if (!store.history[asin]) store.history[asin] = [];
  store.history[asin].push({ price, ts: Date.now() });
  store.history[asin] = store.history[asin].slice(-max);
  writeStore(store);
}

export function getAveragePrice(asin) {
  const store = readStore();
  const list = store.history[asin];
  if (!list || list.length < 3) return null;
  const sum = list.reduce((acc, p) => acc + p.price, 0);
  return sum / list.length;
}

export function getLastPrice(asin) {
  const store = readStore();
  return store.prices[asin] ?? null;
}

export function setLastPrice(asin, price) {
  const store = readStore();
  store.prices[asin] = price;
  writeStore(store);
}

export function canAlert(asin, cooldownHours = 12) {
  const store = readStore();
  const last = store.alerts[asin];
  if (!last) return true;
  return Date.now() - last >= cooldownHours * 60 * 60 * 1000;
}

export function markAlerted(asin) {
  const store = readStore();
  store.alerts[asin] = Date.now();
  writeStore(store);
}
