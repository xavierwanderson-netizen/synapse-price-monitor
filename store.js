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

    data.lastPrices = data.lastPrices || {};
    data.priceHistory = data.priceHistory || {};
    data.alertState = data.alertState || {};
    return data;
  } catch {
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

export function addPriceHistory(asin, price, maxLen = 60) {
  const store = safeReadStore();
  store.priceHistory[asin] = store.priceHistory[asin] || [];
  store.priceHistory[asin].push({ ts: Date.now(), price });

  if (store.priceHistory[asin].length > maxLen) {
    store.priceHistory[asin] = store.priceHistory[asin].slice(-maxLen);
  }

  safeWriteStore(store);
}

export function getLowestPrice(asin) {
  const store = safeReadStore();
  const history = store.priceHistory?.[asin];
  if (!history || history.length === 0) return null;

  return Math.min(...history.map(h => h.price));
}

export function canAlert(asin, cooldownHours = 12) {
  const store = safeReadStore();
  const lastAlert = store.alertState?.[asin]?.lastAlertTs;
  if (!lastAlert) return true;

  return Date.now() - lastAlert >= cooldownHours * 3600 * 1000;
}

export function markAlerted(asin) {
  const store = safeReadStore();
  store.alertState[asin] = { lastAlertTs: Date.now() };
  safeWriteStore(store);
}
