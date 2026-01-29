import axios from "axios";

export async function getAmazonPrice(asin) {
  // ⚠️ Placeholder simplificado
  // A Amazon PAAPI real exige assinatura HMAC (entra no próximo passo)

  console.log(`🔎 Consultando preço do ASIN ${asin}`);

  // Simulação de preço para validação do backend
  const simulatedPrice = Math.floor(Math.random() * 500) + 100;

  return simulatedPrice;
}

export async function checkAmazonPrice(asin) {
  return getAmazonPrice(asin);
}
