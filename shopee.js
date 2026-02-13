import axios from 'axios';
import crypto from 'crypto';

export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = process.env.SHOPEE_APP_ID;
    const appKey = process.env.SHOPEE_APP_KEY;
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Assinatura limpa conforme documentação
    const baseStr = appId + timestamp + appKey;
    const signature = crypto.createHash('sha256').update(baseStr).digest('hex');

    const payload = {
      query: `query { productOfferV2(itemId: ${itemId}, shopId: ${shopId}) { nodes { productName priceMin productLink } } }`
    };

    const { data } = await axios.post("https://open-api.affiliate.shopee.com.br/graphql", payload, {
      headers: {
        'Authorization': `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
        'Content-Type': 'application/json'
      }
    });

    const node = data?.data?.productOfferV2?.nodes?.[0];
    if (node) {
      return {
        id: itemId.toString(),
        title: node.productName,
        price: parseFloat(node.priceMin),
        url: node.productLink,
        platform: 'shopee'
      };
    }
    return null;
  } catch (error) {
    console.error(`❌ Erro Shopee (${itemId}):`, error.message);
    return null;
  }
}
