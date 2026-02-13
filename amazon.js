import axios from 'axios';
import * as cheerio from 'cheerio';

export async function fetchAmazonProduct(asin) {
  const url = `https://www.amazon.com.br/dp/${asin}?tag=${process.env.AMAZON_TAG}`;
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const priceWhole = $('.a-price-whole').first().text().replace(/[^\d]/g, '');
    const priceFraction = $('.a-price-fraction').first().text().replace(/[^\d]/g, '') || '00';
    const title = $('#productTitle').text().trim();

    if (priceWhole) {
      return { 
        id: asin, title, price: parseFloat(`${priceWhole}.${priceFraction}`), 
        url, platform: 'amazon' 
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro Amazon (${asin}):`, error.message);
    return null;
  }
}
