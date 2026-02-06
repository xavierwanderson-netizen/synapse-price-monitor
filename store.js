import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Persistência simples via arquivo JSON.
// Em Railway, o filesystem é efêmero entre deploys, mas persiste durante a execução do container.
// Isso é suficiente para manter histórico/lowest durante a vida do deploy.
const DATA_DIR = path.join(__dirname, ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function atomicWrite(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    atomicWrite(STORE_FILE, { lastPrice: {}, lowest: {}, alerts: {}, history: {} });
  }
}

function readStoreSafe() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    if (!raw || !raw.trim()) throw new Error("store vazio");
    const data = JSON.parse(raw);

    // migração leve (caso existam chaves antigas)
    if (!data.lastPrice && data.prices) data.lastPrice = data.prices;
    if (!data.lowest) data.lowest = {};
    if (!data.alerts) data.alerts = {};
    if (!data.history) data.history = {};
    return data;
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
    const fresh = { lastPrice: {}, lowest: {}, alerts: {}, history: {} };
    atomicWrite(STORE_FILE, fresh);
    return fresh;
  }
}

function writeStore(store) {
  atomicWrite(STORE_FILE, store);
}

export function getLastPrice(asin) {
  const store = readStoreSafe();
  return store.lastPrice[asin] ?? null;
}

export function setLastPrice(asin, price) {
  const store = readStoreSafe();
  store.lastPrice[asin] = price;
  writeStore(store);
}

export function getLowestPrice(asin) {
  const store = readStoreSafe();
  return store.lowest[asin] ?? null;
}

export function setLowestPrice(asin, price) {
  const store = readStoreSafe();
  store.lowest[asin] = price;
  writeStore(store);
}

export function addPriceHistory(asin, price, max = 30) {
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
