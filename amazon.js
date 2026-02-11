import axios from 'axios';

// --- CONFIGURAÇÃO API OFICIAL ---
async function getAccessToken() {
  const auth = Buffer.from(`${process.env.AMAZON_CREDENTIAL_ID}:${process.env.AMAZON_CREDENTIAL_SECRET}`).toString('base64');
  try {
    const response = await axios.post('https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token', 
      'grant_type=client_credentials&scope=creatorsapi/default',
      { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
  } catch (e) {
    return null; // Falha silenciosa para ativar o Scraping abaixo
  }
}

// --- MOTOR DE SCRAPING (FALLBACK) ---
async function fetchByScraping(asin) {
  try {
    const url = `https://www.amazon.com.br/dp/${asin}`;
    const { data } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 10000
    });

    // Seletor de Título
    const titleMatch = data.match(/id="productTitle".*?>(.*?)<\/span>/s);
    const title = titleMatch ? titleMatch[1].trim() : "Produto Amazon";

    // Seletor de Preço (Layout BR atualizado)
    const priceRegex = /"priceAmount":(\d+\.\d+)/; 
    const priceMatch = data.match(priceRegex);
    
    let price = null;
    if (priceMatch) {
      price = parseFloat(priceMatch[1]);
    } else {
      // Backup: Tenta encontrar no campo priceToPay
      const altPriceMatch = data.match(/class="a-price-whole">([\d.,]+)/);
      if (altPriceMatch) price = parseFloat(altPriceMatch[1].replace('.', '').replace(',', '.'));
    }

    return { asin, title, price };
  } catch (error) {
    console.error(`❌ Falha total no Scraping (${asin}):`, error.message);
    return null;
  }
}

// --- FUNÇÃO PRINCIPAL (ORQUESTRAÇÃO) ---
export async function fetchAmazonProduct(asin) {
  const token = await getAccessToken();
  
  if (token) {
    try {
      const response = await axios.post('https://creatorsapi.amazon/catalog/v1/getItems', {
        itemIds: [asin],
        itemIdType: 'ASIN',
        marketplace: 'www.amazon.com.br',
        partnerTag: process.env.AMAZON_PARTNER_TAG,
        resources: ['itemInfo.title', 'offersV2.listings.price']
      }, {
        headers: { 
          'Authorization': `Bearer ${token}, Version 2.1`,
          'x-marketplace': 'www.amazon.com.br'
        }
      });

      const item = response.data?.itemResults?.items?.[0];
      const apiPrice = item?.offersV2?.listings?.[0]?.price?.money?.amount;

      if (apiPrice) {
        console.log(`✅ [API] ${asin}: R$ ${apiPrice}`);
        return { asin, title: item.itemInfo.title.displayValue, price: Number(apiPrice) };
      }
    } catch (err) {
      // Captura especificamente o erro de elegibilidade
      if (err.response?.data?.reason === "AssociateNotEligible") {
        console.log(`⚠️ Conta inelegível (API). Mudando para Scraping para o ASIN ${asin}...`);
      }
    }
  }

  // Se a API falhou, não retornou preço ou a conta é inelegível, tenta Scraping
  const scraped = await fetchByScraping(asin);
  if (scraped?.price) {
    console.log(`🔍 [SCRAPE] ${asin}: R$ ${scraped.price}`);
  }
  return scraped;
}

export function buildAffiliateLink(asin) {
  return `https://www.amazon.com.br/dp/${asin}?tag=${process.env.AMAZON_PARTNER_TAG}`;
}
