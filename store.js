import fs from 'fs/promises';
import path from 'path';

// O caminho onde o volume do Railway guarda os dados
const DATA_PATH = process.env.VOLUME_PATH || '/.data';
const STORE_FILE = path.join(DATA_PATH, 'store.json');

// Função que o notifier está procurando e não está achando
export async function getStore() {
  try {
    const data = await fs.readFile(STORE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {}; // Se o arquivo não existir, retorna um banco de dados vazio
  }
}

export async function updatePrice(id, price) {
  const store = await getStore();
  const now = Date.now();
  
  store[id] = {
    lowestPrice: price,
    lastUpdate: now
  };

  try {
    await fs.mkdir(DATA_PATH, { recursive: true });
    await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.error("❌ Erro ao salvar store.json:", error.message);
  }
}

export async function isCooldownActive(id) {
  const store = await getStore();
  const lastUpdate = store[id]?.lastUpdate;
  if (!lastUpdate) return false;

  const hoursSinceLastUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60);
  const cooldownHours = parseInt(process.env.ALERT_COOLDOWN_HOURS || "12");
  
  return hoursSinceLastUpdate < cooldownHours;
}
