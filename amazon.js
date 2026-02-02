import axios from "axios";

const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;
const MARKETPLACE = "www.amazon.com.br";

// -------- SCRAPING (PREÇO) --------
function parsePrice(html) {
  const p2p = html.match(/"priceToPay"\s*:\s*\{\s*"value"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (p2p) return Number(p2p[1]);

  const meta = html.match(/property=["']product:price:amount["']\s+content=["']([^"']+)["']/i);
  if (meta) return Number(meta[1]);

  const brl = html.match(/R\$\s*([0-9\.\,]+)/);
  if (brl) {
    return Number(brl[1].replace(/\./g, "").replace(",", "."));
  }

  return null;
}

function parseTitle(html) {
  const t = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
  if (t) return t[1].replace(/\s+/g, " ").trim();

  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (title) return title[1].replace(/\s+/g, " ").trim();

  return null;
}

function parseImage(html) {
  const og = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) return og[1];
  return null;
}

async function scrapeAmazon(asin) {
  const url = `https://${MARKETPLACE}/dp/${asin}?tag=${PARTNER_TAG}`;

  const res = await axios.get(url, {
    timeout: 20000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
    }
  });

  const html = res.data;
  return {
    price: parsePrice(html),
    title: parseTitle(html),
    image: parseImage(html),
    affiliateUrl: url
  };
}

// -------- FUNÇÃO PÚBLICA --------
export async function getAmazonPrice(asin) {
  if (!PARTNER_TAG) return null;

  try {
    const data = await scrapeAmazon(asin);
    if (!data.price) return null;

    return {
      title: data.title || `Produto ${asin}`,
      price: data.price,
      image: data.image || null,
      affiliateUrl: data.affiliateUrl
    };
  } catch (err) {
    console.error(`❌ Erro scraping ASIN ${asin}:`, err?.message || err);
    return null;
  }
}
