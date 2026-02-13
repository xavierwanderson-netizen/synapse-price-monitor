import axios from "axios";
import crypto from "crypto";

export async function fetchShopeeProduct(itemId, shopId) {
  try {
    const appId = process.env.SHOPEE_APP_ID;
    const appKey = process.env.SHOPEE_APP_KEY;

    if (!appId || !appKey) {
      console.error("Credenciais Shopee ausentes");
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const baseStr = appId + timestamp + appKey;
    const signature = crypto
      .createHash("sha256")
      .update(baseStr)
      .digest("hex");

    const payload = {
      query: `
        query {
          productOfferV2(itemId: ${itemId}, shopId: ${shopId}) {
            nodes {
              productName
              priceMin
              productLink
              imageUrl
            }
          }
        }
      `
    };

    const { data } = await axios.post(
      "https://open-api.affiliate.shopee.com.br/graphql",
      payload,
      {
        headers: {
          Authorization: `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
          "Content-Type": "application/json"
        },
        timeout: 12000
      }
    );

    const node = data?.data?.productOfferV2?.nodes?.[0];

    if (!node || !node.priceMin) return null;

    return {
      id: `shopee_${itemId}`,
      title: node.productName || "Produto Shopee",
      price: parseFloat(node.priceMin),
      url: node.productLink,
      image: node.imageUrl || null,
      platform: "shopee"
    };
  } catch (error) {
    console.error(
      `Erro Shopee (itemId=${itemId}, shopId=${shopId}):`,
      error.message
    );
    return null;
  }
}
