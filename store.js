import fs from "fs/promises";
import path from "path";

const DATA_DIR = process.env.VOLUME_PATH || "/data";
const STORE_FILE = path.join(DATA_DIR, "store.json");

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

export async function getStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch { return {}; }
}

// Funções padronizadas conforme o contrato solicitado
export async function getLastPrice(id) {
  const store = await getStore();
  return store[id]?.lastPrice ?? null;
}

export async function setLastPrice(id, price) {
  const store = await getStore();
  store[id] = { ...store[id], lastPrice: price, lastSeenAt: Date.now() };
  await writeStore(store);
}

export async function isCooldownActive(id) {
  const store = await getStore();
  const lastNotifiedAt = store[id]?.lastNotifiedAt;
  if (!lastNotifiedAt) return false;
  return (Date.now() - lastNotifiedAt) < (12 * 60 * 60 * 1000);
}

export async function markNotified(id) {
  const store = await getStore();
  store[id] = { ...store[id], lastNotifiedAt: Date.now() };
  await writeStore(store);
}
