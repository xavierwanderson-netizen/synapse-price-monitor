import axios from 'axios';
import crypto from 'crypto';

// Puxa as credenciais que você colocou no Railway
const appId = process.env.SHOPEE_APP_ID;
const appKey = process.env.SHOPEE_APP_KEY;
const endpoint = "https://open-api.affiliate.shopee.com.br/graphql";

// Função interna que gera a "assinatura" de segurança que a Shopee exige
function getShopeeAuth() {
  const timestamp = Math.floor(Date.now() / 1000);
  const baseStr = appId + timestamp + appKey;
  const signature = crypto.createHash('sha256').update(baseStr).digest('hex');
  return {
    'Authorization': `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
    'Content-Type': 'application/json'
  };
}

// Função que o robô usa para buscar o preço oficial
export async function fetchShopeeProduct(itemId, shopId) {
  const query = `
    query($itemId: Int64, $shopId: Int64) {
      productOfferV2(itemId: $itemId, shopId: $shopId) {
        nodes {
          productName
          priceMin
          priceDiscountRate
          productLink
        }
      }
    }`;

  try {
    const response = await axios.post(endpoint, 
      { query, variables: { itemId: parseInt(itemId), shopId: parseInt(shopId) } },
      { headers: getShopeeAuth() }
    );

    const product = response.data?.data?.productOfferV2?.nodes?.[0];
    
    if (product) {
      return {
        id: itemId,
        title: product.productName,
        price: parseFloat(product.priceMin), // Pega o menor preço disponível
        discount: product.priceDiscountRate,
        url: product.productLink,
        platform: 'shopee'
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro Shopee API (${itemId}):`, error.message);
    return null;
  }
}
