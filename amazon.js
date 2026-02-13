import axios from "axios";
import * as cheerio from "cheerio";

export function buildAffiliateLink(asin) {
  const tag = process.env.AMAZON_TAG || "";
  return tag
    ? `https://www.amazon.com.br/dp/${asin}?tag=${tag}`
    : `https://www.amazon.com.br/dp/${asin}`;
}

export async function fetchAmazonProduct(asin) {
  const url = buildAffiliateLink(asin);

  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 12000
    });

    const $ = cheerio.load(data);

    // preço
    const whole = $(".a-price-whole")
      .first()
      .text()
      .replace(/[^\d]/g, "");

    const fraction =
      $(".a-price-fraction")
        .first()
        .text()
        .replace(/[^\d]/g, "") || "00";

    if (!whole) return null;

    const price = parseFloat(`${whole}.${fraction}`);

    // título
    const title = $("#productTitle").text().trim();

    // imagem principal
    let image = $("#landingImage").attr("src");

    // fallback caso o seletor mude
    if (!image) {
      image = $("#imgTagWrapperId img").attr("src") || null;
    }

    return {
      id: `amazon_${asin}`,
      title: title || "Produto Amazon",
      price,
      url,
      image,
      platform: "amazon"
    };
  } catch (error) {
    console.error(`Erro Amazon (${asin}):`, error.message);
    return null;
  }
}
