import axios from 'axios';
import crypto from 'crypto';

const appId = process.env.SHOPEE_APP_ID;
const appKey = process.env.SHOPEE_APP_KEY;
const endpoint = "https://open-api.affiliate.shopee.com.br/graphql";

export async function fetchShopeeProduct(itemId, shopId) {
  const timestamp = Math.floor(Date.now() / 1000);
  // A assinatura deve ser appId + timestamp + appKey sem espaços
  const baseStr = `${appId}${timestamp}${appKey}`;
  const signature = crypto.createHash('sha256').update(baseStr).digest('hex');

  const graphqlBody = {
    query: `query {
      productOfferV2(itemId: ${itemId}, shopId: ${shopId}) {
        nodes {
          productName
          priceMin
          productLink
        }
      }
    }`
  };

  try {
    const response = await axios.post(endpoint, graphqlBody, {
      headers: {
        'Authorization': `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.errors) {
      console.error(`❌ Erro Shopee (${itemId}):`, response.data.errors[0].message);
      return null;
    }

    const product = response.data?.data?.productOfferV2?.nodes?.[0];
    if (product) {
      return {
        id: itemId,
        title: product.productName,
        price: parseFloat(product.priceMin),
        url: product.productLink,
        platform: 'shopee'
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro Conexão Shopee (${itemId}):`, error.message);
    return null;
  }
}
