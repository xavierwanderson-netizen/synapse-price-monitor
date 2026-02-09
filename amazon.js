import axios from "axios";

function pickUserAgent() {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

function parseBrazilPriceToNumber(text) {
  if (!text) return null;
  return Number(
    text.replace(/\s/g, "")
      .replace("R$", "")
      .replace(/\./g, "")
      .replace(",", ".")
  );
}

export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_PARTNER_TAG;
  const base = `https://www.amazon.com.br/dp/${asin}`;
  return tag ? `${base}?tag=${encodeURIComponent(tag)}` : base;
}

export async function fetchAmazonProduct(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}`;

  const res = await axios.get(url, {
    headers: {
      "User-Agent": pickUserAgent(),
      "Accept-Language": "pt-BR,pt;q=0.9"
    },
    timeout: 15000
  });

  const html = res.data;

  const priceMatch = html.match(/a-offscreen">([^<]+)</);
  const price = priceMatch ? parseBrazilPriceToNumber(priceMatch[1]) : null;

  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace("Amazon.com.br:", "").trim()
    : "Produto Amazon";

  return { asin, title, price };
}
