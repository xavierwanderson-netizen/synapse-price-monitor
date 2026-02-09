import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ lastPrice: {}, lowest: {}, alerts: {}, history: {} }, null, 2)
    );
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE));
}

function writeStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

export function getLastPrice(asin) {
  return readStore().lastPrice[asin] ?? null;
}

export function setLastPrice(asin, price) {
  const store = readStore();
  store.lastPrice[asin] = price;
  writeStore(store);
}

export function getLowestPrice(asin) {
  return readStore().lowest[asin] ?? null;
}

export function setLowestPrice(asin, price) {
  const store = readStore();
  store.lowest[asin] = price;
  writeStore(store);
}

export function addPriceHistory(asin, price, max = 30) {
  const store = readStore();
  store.history[asin] = store.history[asin] || [];
  store.history[asin].push({ price, ts: Date.now() });
  store.history[asin] = store.history[asin].slice(-max);
  writeStore(store);
}

export function canAlert(asin, hours = 12) {
  const last = readStore().alerts[asin];
  return !last || Date.now() - last > hours * 3600000;
}

export function markAlerted(asin) {
  const store = readStore();
  store.alerts[asin] = Date.now();
  writeStore(store);
}
