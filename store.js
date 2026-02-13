import fs from "fs/promises";
import path from "path";

// Prioriza o caminho oficial do volume no Railway para persistência garantida
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.VOLUME_PATH || "/data";
const STORE_FILE = path.join(DATA_DIR, "store.json");

// Converte a variável do Railway ALERT_COOLDOWN_HOURS para milissegundos (padrão 12h)
const COOLDOWN_HOURS = parseInt(process.env.ALERT_COOLDOWN_HOURS || "12", 10);
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

async function writeStore(store) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error("❌ Erro ao persistir dados no volume Railway:", err.message);
  }
}

export async function getStore() {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    // Retorna objeto vazio caso o arquivo ainda não exista no volume
    return {};
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

/**
 * Verifica se o período de silêncio (cooldown) está ativo para o produto.
 * Utiliza a variável ALERT_COOLDOWN_HOURS definida no painel do Railway.
 */
export async function isCooldownActive(id) {
  const store = await getStore();
  const lastNotifiedAt = store[id]?.lastNotifiedAt;
  if (!lastNotifiedAt) return false;

  const timePassed = Date.now() - lastNotifiedAt;
  return timePassed < COOLDOWN_MS;
}

export async function markNotified(id) {
  const store = await getStore();
  store[id] = {
    ...store[id],
    lastNotifiedAt: Date.now()
  };
  await writeStore(store);
}

/**
 * Função utilitária para atualizar preço e retornar o valor antigo em uma única operação.
 */
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
