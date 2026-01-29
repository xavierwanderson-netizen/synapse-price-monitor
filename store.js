const lastPrices = new Map();

export function getLastPrice(asin) {
  return lastPrices.get(asin);
}

export function setLastPrice(asin, price) {
  lastPrices.set(asin, price);
}
