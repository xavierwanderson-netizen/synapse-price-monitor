import axios from "axios";
import crypto from "crypto";

export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = String(process.env.SHOPEE_APP_ID).trim();
    const appKey = String(process.env.SHOPEE_APP_KEY).trim();
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Concatenação limpa para SHA256
    const baseStr = appId + timestamp + appKey;
    const signature = crypto.createHash("sha256").update(baseStr).digest("hex");

    const query = `query{productOfferV2(itemId:${itemId},shopId:${shopId}){nodes{productName,priceMin,productLink,imageUrl}}}`;

    const { data } = await axios.post("https://open-api.affiliate.shopee.com.br/graphql", 
      { query }, 
      {
        headers: {
          "Authorization": `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    if (data.errors) throw new Error(data.errors[0].message);

    const node = data?.data?.productOfferV2?.nodes?.[0];
    if (!node) return null;

    return {
      id: `shopee_${itemId}`,
      title: node.productName,
      price: parseFloat(node.priceMin),
      url: node.productLink,
      image: node.imageUrl,
      platform: "shopee"
    };
  } catch (error) {
    console.error(`❌ Erro Shopee (${itemId}):`, error.message);
    return null;
  }
}
