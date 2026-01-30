import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Arquivo persistente (fica junto do app)
const DATA_DIR = path.join(__dirname, ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(
      STORE_PATH,
      JSON.stringify({ prices: {}, alerts: {} }, null, 2),
      "utf-8"
    );
  }
}

function readStore() {
  ensureStore();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.prices) parsed.prices = {};
    if (!parsed.alerts) parsed.alerts = {};
    return parsed;
  } catch {
    // Se corromper por qualquer motivo, recria
    const fresh = { prices: {}, alerts: {} };
    fs.writeFileSync(STORE_PATH, JSON.stringify(fresh, null, 2), "utf-8");
    return fresh;
  }
}

function writeStore(data) {
  ensureStore();
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, STORE_PATH); // write atomic
}

export function getLastPrice(asin) {
  const store = readStore();
  const val = store.prices?.[asin];
  return typeof val === "number" ? val : null;
}

export function setLastPrice(asin, price) {
  const store = readStore();
  store.prices[asin] = price;
  writeStore(store);
}

export function canAlert(asin, cooldownHours = 12) {
  const store = readStore();
  const last = store.alerts?.[asin];
  if (!last) return true;

  const elapsed = Date.now() - last;
  return elapsed >= cooldownHours * 60 * 60 * 1000;
}

export function markAlerted(asin) {
  const store = readStore();
  store.alerts[asin] = Date.now();
  wri
