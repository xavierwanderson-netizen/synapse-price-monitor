import fs from "fs/promises";
import path from "path";

// ✅ CORRIGIDO: path consistente com o volume Railway montado em /.data
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/.data";
const STORE_FILE = path.join(DATA_DIR, "store.json");

const COOLDOWN_HOURS = parseInt(process.env.ALERT_COOLDOWN_HOURS || "12", 10);
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

// ✅ MELHORIA: Cache em memória evita centenas de leituras de disco por ciclo
let memoryCache = null;

async function getStore() {
  if (memoryCache) return memoryCache;
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    memoryCache = JSON.parse(raw);
    return memoryCache;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

async function writeStore(store) {
  memoryCache = store;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error("❌ Erro ao persistir dados no volume Railway:", err.message);
  }
}

export async function getLastPrice(id) {
  const store = await getStore();
  return store[id]?.lastPrice ?? null;
}

export async function setLastPrice(id, price) {
  const store = await getStore();
  store[id] = {
    ...store[id],
    lastPrice: price,
    lastSeenAt: Date.now()
  };
  await writeStore(store);
}

export async function isCooldownActive(id) {
  const store = await getStore();
  const lastNotifiedAt = store[id]?.lastNotifiedAt;
  if (!lastNotifiedAt) return false;
  return Date.now() - lastNotifiedAt < COOLDOWN_MS;
}

export async function markNotified(id) {
  const store = await getStore();
  store[id] = {
    ...store[id],
    lastNotifiedAt: Date.now()
  };
  await writeStore(store);
}

export async function updatePrice(id, price) {
  const store = await getStore();
  const lastPrice = store[id]?.lastPrice ?? null;
  store[id] = {
    ...store[id],
    lastPrice: price,
    lastSeenAt: Date.now()
  };
  await writeStore(store);
  return lastPrice;
}
