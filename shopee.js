import axios from 'axios';
import crypto from 'crypto';

const appId = process.env.SHOPEE_APP_ID;
const appKey = process.env.SHOPEE_APP_KEY;
const endpoint = "https://open-api.affiliate.shopee.com.br/graphql";

function getShopeeAuth() {
  const timestamp = Math.floor(Date.now() / 1000);
  // A ordem correta de concatenação para a assinatura
  const baseStr = appKey + timestamp + appId; 
  const signature = crypto.createHash('sha256').update(baseStr).digest('hex');
  
  return {
    'Authorization': `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
    'Content-Type': 'application/json'
  };
}

export async function fetchShopeeProduct(itemId, shopId) {
  // Query formatada para evitar erros de sintaxe GraphQL
  const graphqlQuery = {
    query: `query {
      productOfferV2(itemId: ${itemId}, shopId: ${shopId}) {
        nodes {
          productName
          priceMin
          priceDiscountRate
          productLink
        }
      }
    }`
  };

  try {
    const response = await axios.post(endpoint, graphqlQuery, { 
      headers: getShopeeAuth() 
    });

    // Se a API retornar erro dentro do status 200
    if (response.data.errors) {
      console.error(`❌ Erro interno Shopee (${itemId}):`, response.data.errors[0].message);
      return null;
    }

    const product = response.data?.data?.productOfferV2?.nodes?.[0];
    if (product) {
      return {
        id: itemId,
        title: product.productName,
        price: parseFloat(product.priceMin),
        discount: product.priceDiscountRate,
        url: product.productLink,
        platform: 'shopee'
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro de conexão Shopee (${itemId}):`, error.message);
    return null;
  }
}
