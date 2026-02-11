import axios from 'axios';

let cachedToken = null;

// Passo 1: Obter Token OAuth 2.0
async function getAccessToken() {
  if (cachedToken) return cachedToken;

  const auth = Buffer.from(`${process.env.AMAZON_CREDENTIAL_ID}:${process.env.AMAZON_CREDENTIAL_SECRET}`).toString('base64');
  
  try {
    const response = await axios.post('https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token', 
      'grant_type=client_credentials&scope=creatorsapi/default',
      { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    cachedToken = response.data.access_token;
    setTimeout(() => { cachedToken = null; }, 3500 * 1000); // Reset após 1h
    return cachedToken;
  } catch (error) {
    console.error("❌ Erro ao obter Token Amazon:", error.response?.data || error.message);
    throw error;
  }
}

// Passo 2: Buscar Produto
export async function fetchAmazonProduct(asin) {
  try {
    const token = await getAccessToken();
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
    if (item) {
      return {
        asin,
        title: item.itemInfo?.title?.displayValue,
        price: item.offersV2?.listings?.[0]?.price?.money?.amount
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro API (${asin}):`, error.response?.data?.message || error.message);
    return null;
  }
}

export function buildAffiliateLink(asin) {
  return `https://www.amazon.com.br/dp/${asin}?tag=${process.env.AMAZON_PARTNER_TAG}`;
}
