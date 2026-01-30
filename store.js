import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "prices.db"));

db.prepare(`
  CREATE TABLE IF NOT EXISTS prices (
    asin TEXT PRIMARY KEY,
    last_price REAL,
    last_alert_at INTEGER
  )
`).run();

export function getLastPrice(asin) {
  const row = db.prepare(
    "SELECT last_price FROM prices WHERE asin = ?"
  ).get(asin);
  return row?.last_price ?? null;
}

export function setLastPrice(asin, price) {
  db.prepare(`
    INSERT INTO prices (asin, last_price)
    VALUES (?, ?)
    ON CONFLICT(asin) DO UPDATE SET last_price = excluded.last_price
  `).run(asin, price);
}

export function canAlert(asin, cooldownHours = 12) {
  const row = db.prepare(
    "SELECT last_alert_at FROM prices WHERE asin = ?"
  ).get(asin);

  if (!row?.last_alert_at) return true;

  const elapsed = Date.now() - row.last_alert_at;
  return elapsed >= cooldownHours * 60 * 60 * 1000;
}

export function markAlerted(asin) {
  db.prepare(`
    INSERT INTO prices (asin, last_alert_at)
    VALUES (?, ?)
    ON CONFLICT(asin) DO UPDATE SET last_alert_at = excluded.last_alert_at
  `).run(asin, Date.now());
}
