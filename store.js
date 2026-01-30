import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, ".data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ prices: {}, alerts: {} }, null, 2),
      "utf-8"
    );
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(STORE_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeStore(store) {
  const tmp = STORE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmp, STORE_FILE);
}

export function getLastPrice(asin) {
  const store = readStore();
  return typeof store.prices[asin] === "number"
    ? store.prices[asin]
    : null;
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

  const elapsed = Date.now() - last;
  return elapsed >= cooldownHours * 60 * 60 * 1000;
}

export function markAlerted(asin) {
  const store = readStore();
  store.alerts[asin] = Date.now();
  writeStore(store);
}
