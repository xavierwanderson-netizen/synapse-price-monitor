import axios from 'axios';
import fs from 'fs';

// Novo caminho para forçar a atualização das permissões (v2)
const TOKEN_PATH = '/.data/ml_tokens_v2.json';

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;
const REDIRECT_URI = process.env.ML_REDIRECT_URI;
const AFFILIATE_ID = process.env.ML_AFFILIATE_ID;

export async function fetchMLProduct(mlId) {
  try {
    let tokens = { access_token: null, refresh_token: null };

    // 1. Tenta carregar tokens salvos no volume persistente do Railway
    if (fs.existsSync(TOKEN_PATH)) {
      tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    }

    // 2. Se não tem tokens salvos, realiza o login inicial com o código do navegador
    if (!tokens.access_token) {
      tokens = await getInitialToken();
    }

    // 3. Consulta os detalhes do produto usando o Token oficial
    try {
      const response = await axios.get(`https://api.mercadolibre.com/items/${mlId}`, {
        headers: { 
          'Authorization': `Bearer ${tokens.access_token}`,
          'accept': 'application/json'
        }
      });

      const item = response.data;
      if (item && item.price) {
        return {
          id: mlId,
          title: item.title,
          price: item.price,
          url: `${item.permalink}?matt_tool=${AFFILIATE_ID}`, // Link com rastreio de afiliado
          platform: 'mercadolivre'
        };
      }
    } catch (err) {
      // 4. Se o token expirou (Erro 401), tenta renovar usando o Refresh Token
      if (err.response?.status === 401 && tokens.refresh_token) {
        console.log(`🔄 Token expirado para ${mlId}. Tentando renovar...`);
        tokens = await refreshMLToken(tokens.refresh_token);
        return fetchMLProduct(mlId); // Tenta a consulta novamente com o novo token
      }
      throw err;
    }
    return null;
  } catch (error) {
    // Tratamento específico para Erro 403 (Permissões ou IP)
    if (error.response?.status === 403) {
      console.error(`❌ Erro ML (403 Forbidden): Verifique se o item ${mlId} é válido e se os escopos estão ativos.`);
    } else {
      console.error(`❌ Erro ML (${mlId}):`, error.response?.data?.message || error.message);
    }
    return null;
  }
}

// Troca o código manual "TG-..." pelo primeiro par de tokens
async function getInitialToken() {
  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: process.env.ML_INITIAL_CODE,
    redirect_uri: REDIRECT_URI
  });

  const res = await axios.post('https://api.mercadolibre.com/oauth/token', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(res.data));
  console.log("✅ Primeiro Token gerado e salvo no volume persistente!");
  return res.data;
}

// Gera um novo Access Token sem precisar de um novo código manual
async function refreshMLToken(oldRefreshToken) {
  const data = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: oldRefreshToken
  });

  const res = await axios.post('https://api.mercadolibre.com/oauth/token', data, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(res.data));
  console.log("🔄 Token do Mercado Livre renovado com sucesso!");
  return res.data;
}
