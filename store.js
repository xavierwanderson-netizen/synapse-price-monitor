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
    atomicWrite(STORE_FILE, { prices: {}, alerts: {}, history: {} });
  }
}

function atomicWrite(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function readStoreSafe() {
  ensureStore();

  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    if (!raw || !raw.trim()) throw new Error("store vazio");
    return JSON.parse(raw);
  } catch (e) {
    // Backup do arquivo corrompido e recria limpo
    try {
      const broken = fs.readFileSync(STORE_FILE, "utf-8");
      fs.writeFileSync(
        path.join(DATA_DIR, `store.broken.${Date.now()}.json`),
        broken,
        "utf-8"
      );
    } catch {}
    const fresh = { prices: {}, alerts: {}, history: {} };
    atomicWrite(STORE_FILE, fresh);
    return fresh;
  }
}

function writeStore(store) {
  atomicWrite(STORE_FILE, store);
}

export function addPriceHistory(asin, price, max = 20) {
  const store = readStoreSafe();
  if (!store.history[asin]) store.history[asin] = [];
  store.history[asin].push({ price, ts: Date.now() });
  store.history[asin] = store.history[asin].slice(-max);
  writeStore(store);
}

export function getAveragePrice(asin) {
  const store = readStoreSafe();
  const list = store.history[asin];
  if (!list || list.length < 3) return null;
  const sum = list.reduce((acc, p) => acc + p.price, 0);
  return sum / list.length;
}

export function getLastPrice(asin) {
  const store = readStoreSafe();
  return store.prices[asin] ?? null;
}

export function setLastPrice(asin, price) {
  const store = readStoreSafe();
  store.prices[asin] = price;
  writeStore(store);
}

export function canAlert(asin, cooldownHours = 12) {
  const store = readStoreSafe();
  const last = store.alerts[asin];
  if (!last) return true;
  return Date.now() - last >= cooldownHours * 60 * 60 * 1000;
}

export function markAlerted(asin) {
  const store = readStoreSafe();
  store.alerts[asin] = Date.now();
  writeStore(store);
}
