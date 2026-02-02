import axios from "axios";

const AMAZON_BASE_URL = "https://www.amazon.com.br";
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  Connection: "keep-alive",
  "Cache-Control": "no-cache",
};

function parsePriceFromHtml(html) {
  const priceMatches = [
    /priceToPay[^>]*>\s*<span[^>]*class="a-offscreen">R\$\s*([\d.,]+)/i,
    /a-offscreen">R\$\s*([\d.,]+)/i,
    /priceblock_ourprice[^>]*>\s*R\$\s*([\d.,]+)/i,
    /priceblock_dealprice[^>]*>\s*R\$\s*([\d.,]+)/i,
  ];

  for (const regex of priceMatches) {
    const match = html.match(regex);
    if (match?.[1]) {
      const normalized = match[1].replace(/\./g, "").replace(",", ".");
      const value = Number.parseFloat(normalized);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function parseMetaContent(html, property) {
  const regex = new RegExp(
    `<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(regex);
  return match?.[1] || null;
}

function buildProductUrl(asin) {
  const partnerTag = process.env.AMAZON_PARTNER_TAG;
  const tagParam = partnerTag ? `?tag=${partnerTag}` : "";
  return `${AMAZON_BASE_URL}/dp/${asin}${tagParam}`;
}

function buildProxyUrl(url) {
  return `https://r.jina.ai/https://${url.replace("https://", "")}`;
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    headers: DEFAULT_HEADERS,
    timeout: 15000,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return response.data;
}

export async function fetchAmazonData(asin, fallbackTitle) {
  const url = buildProductUrl(asin);

  try {
    const html = await fetchHtml(url);
    const price = parsePriceFromHtml(html);
    const title = parseMetaContent(html, "og:title") || fallbackTitle || asin;
    const imageUrl = parseMetaContent(html, "og:image");

    return {
      asin,
      url,
      title,
      imageUrl,
      price,
    };
  } catch (error) {
    const status = error?.response?.status;

    if (status === 403 || status === 503) {
      try {
        const proxyUrl = buildProxyUrl(url);
        console.log(`⚠️ Acesso bloqueado (${status}). Usando fallback: ${proxyUrl}`);
        const html = await fetchHtml(proxyUrl);
        const price = parsePriceFromHtml(html);
        const title = parseMetaContent(html, "og:title") || fallbackTitle || asin;
        const imageUrl = parseMetaContent(html, "og:image");

        return {
          asin,
          url,
          title,
          imageUrl,
          price,
        };
      } catch (proxyError) {
        console.error(
          `Erro ao buscar dados do ASIN ${asin} via fallback:`,
          proxyError.message
        );
      }
    }

    console.error(`Erro ao buscar dados do ASIN ${asin}:`, error.message);
    return {
      asin,
      url,
      title: fallbackTitle || asin,
      imageUrl: null,
      price: null,
    };
  }
}
