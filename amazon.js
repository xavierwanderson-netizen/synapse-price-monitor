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
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Device-Memory": "8"
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);

    // Seletores de Preço
    const whole = $(".a-price-whole")
      .first()
      .text()
      .replace(/[^\d]/g, "");

    const fraction =
      $(".a-price-fraction")
        .first()
        .text()
        .replace(/[^\d]/g, "") || "00";

    if (!whole) {
      // Log discreto se não achar preço (pode ser block ou falta de estoque)
      return null;
    }

    const price = parseFloat(`${whole}.${fraction}`);

    // Título e Imagem
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
    if (error.response?.status === 404) {
      console.error(`🚫 Amazon: Produto ${asin} não encontrado.`);
    } else {
      console.error(`⚠️ Erro Amazon (${asin}):`, error.message);
    }
    return null;
  }
}
