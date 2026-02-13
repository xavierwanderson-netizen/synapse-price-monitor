import fs from "fs/promises";
import path from "path";

function resolveDataDir() {
  return process.env.VOLUME_PATH || "/data";
}

const DATA_DIR = resolveDataDir();
const STORE_FILE = path.join(DATA_DIR, "store.json");

export async function getStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

export async function getLastPrice(id) {
  const store = await getStore();
  return store[id]?.lastPrice ?? null;
}

export async function setLastPrice(id, price) {
  const store = await getStore();
  store[id] = store[id] || {};
  store[id].lastPrice = price;
  store[id].lastSeenAt = Date.now();
  await writeStore(store);
}

export async function markNotified(id) {
  const store = await getStore();
  store[id] = store[id] || {};
  store[id].lastNotifiedAt = Date.now();
  await writeStore(store);
}

export async function isCooldownActive(id) {
  const store = await getStore();
  const lastNotifiedAt = store[id]?.lastNotifiedAt;
  if (!lastNotifiedAt) return false;
  const cooldownHours = parseInt(process.env.ALERT_COOLDOWN_HOURS || "12", 10);
  const hoursSince = (Date.now() - lastNotifiedAt) / (1000 * 60 * 60);
  return hoursSince < cooldownHours;
}
