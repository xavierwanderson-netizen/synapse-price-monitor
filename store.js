import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");
const LEGACY_STORE_PATH = path.join(__dirname, ".prices.json");

let lastPrices = new Map();
let errorCounts = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore() {
  ensureDataDir();

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      const data = JSON.parse(raw);
      lastPrices = new Map(Object.entries(data.lastPrices || {}));
      errorCounts = new Map(Object.entries(data.errorCounts || {}));
      return;
    }

    if (fs.existsSync(LEGACY_STORE_PATH)) {
      const raw = fs.readFileSync(LEGACY_STORE_PATH, "utf-8");
      const data = JSON.parse(raw);
      lastPrices = new Map(Object.entries(data));
      persistStore();
    }
  } catch (error) {
    console.log("⚠️ Falha ao carregar histórico de preços:", error.message);
  }
}

function persistStore() {
  try {
    ensureDataDir();
    const data = {
      lastPrices: Object.fromEntries(lastPrices),
      errorCounts: Object.fromEntries(errorCounts),
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log("⚠️ Falha ao salvar histórico de preços:", error.message);
  }
}

loadStore();

export function getLastPrice(asin) {
  const value = lastPrices.get(asin);
  return value ? Number(value) : undefined;
}

export function setLastPrice(asin, price) {
  lastPrices.set(asin, price);
  errorCounts.delete(asin);
  persistStore();
}

export function recordError(asin) {
  const current = Number(errorCounts.get(asin) || 0);
  const updated = current + 1;
  errorCounts.set(asin, updated);
  persistStore();
  return updated;
}

export function resetErrorCount(asin) {
  if (errorCounts.has(asin)) {
    errorCounts.delete(asin);
    persistStore();
  }
}
