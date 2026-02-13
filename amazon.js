import axios from "axios";
import * as cheerio from "cheerio";

export function buildAffiliateLink(asin) {
  // Ajustado para AMAZON_PARTNER_TAG conforme seu Railway
  const tag = process.env.AMAZON_PARTNER_TAG || "";
  return tag
    ? `https://www.amazon.com.br/dp/${asin}?tag=${tag}`
    : `https://www.amazon.com.br/dp/${asin}`;
}

export async function fetchAmazonProduct(asin) {
  const url = buildAffiliateLink(asin);

  try {
    const { data } = await axios.get(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);

    const whole = $(".a-price-whole").first().text().replace(/[^\d]/g, "");
    const fraction = $(".a-price-fraction").first().text().replace(/[^\d]/g, "") || "00";

    if (!whole) return null;

    const price = parseFloat(`${whole}.${fraction}`);
    const title = $("#productTitle").text().trim();
    let image = $("#landingImage").attr("src") || $("#imgTagWrapperId img").attr("src") || null;

    return {
      id: `amazon_${asin}`,
      title: title || "Produto Amazon",
      price,
      url,
      image,
      platform: "amazon"
    };
  } catch (error) {
    console.error(`⚠️ Erro Amazon (${asin}):`, error.message);
    return null;
  }
}
