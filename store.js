import fs from "fs";
import path from "path";

const DATA_DIR = "./.data";
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensureStoreFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify(
        {
          lastPrices: {},
          priceHistory: {},
          alertState: {}
        },
        null,
        2
      ),
      "utf-8"
    );
  }
}

function safeReadStore() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const data = JSON.parse(raw);

    // Normaliza caso falte algum campo
    data.lastPrices = data.lastPrices || {};
    data.priceHistory = data.priceHistory || {};
    data.alertState = data.alertState || {};
    return data;
  } catch (e) {
    // Se corromper, renomeia e cria um novo
    try {
      const corrupted = `${STORE_FILE}.corrupted.${Date.now()}`;
      fs.renameSync(STORE_FILE, corrupted);
      console.log("⚠️ Store corrompido. Backup criado:", corrupted);
    } catch (_) {}
    ensureStoreFile();
    return {
      lastPrices: {},
      priceHistory: {},
      alertState: {}
    };
  }
}

function safeWriteStore(data) {
  ensureStoreFile();
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, STORE_FILE);
}

export function getLastPrice(asin) {
  const store = safeReadStore();
  const v = store.lastPrices?.[asin];
  return typeof v === "number" ? v : null;
}

export function setLastPrice(asin, price) {
  const store = safeReadStore();
  store.lastPrices[asin] = price;
  safeWriteStore(store);
}

export function addPriceHistory(asin, price, maxLen = 30) {
  const store = safeReadStore();
  store.priceHistory[asin] = store.priceHistory[asin] || [];
  store.priceHistory[asin].push({ ts: Date.now(), price });

  if (store.priceHistory[asin].length > maxLen) {
    store.priceHistory[asin] = store.priceHistory[asin].slice(-maxLen);
  }

  safeWriteStore(store);
}

export function getPriceHistory(asin) {
  const store = safeReadStore();
  return store.priceHistory?.[asin] || [];
}

export function canAlert(asin, cooldownHours = 12) {
  const store = safeReadStore();
  const lastAlertTs = store.alertState?.[asin]?.lastAlertTs;
  if (!lastAlertTs) return true;

  const elapsed = Date.now() - lastAlertTs;
  return elapsed >= cooldownHours * 60 * 60 * 1000;
}

export function markAlerted(asin) {
  const store = safeReadStore();
  store.alertState[asin] = store.alertState[asin] || {};
  store.alertState[asin].lastAlertTs = Date.now();
  safeWriteStore(store);
}
