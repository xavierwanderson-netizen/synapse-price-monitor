# Configuração Railway para Price Monitor (Worker Contínuo)

## ⚠️ AÇÃO NECESSÁRIA NO PAINEL RAILWAY

Este projeto é um **worker contínuo** (não HTTP server). O Railway precisa ser configurado corretamente.

### 1️⃣ Remover Configuração Bun

```
❌ REMOVER:
- Runtime: Bun
- Porta: 3000
- Public Networking
```

### 2️⃣ Usar Dockerfile

```
✅ CONFIGURAR:
- Builder: Dockerfile (detectado automaticamente)
- Start Command: node index.js
- Runtime: Node.js 20
```

### 3️⃣ Passos no Painel Railway

1. Acesse: https://railway.com/project/98bc805a-f681-4d86-b412-08945db30c8a
2. Clique no serviço "synapse-price-monitor"
3. Vá para "Settings" → "Build"
4. **Builder**: selecione "Dockerfile"
5. **Dockerfile Path**: `./Dockerfile`
6. Vá para "Settings" → "Deploy"
7. **Start Command**: `node index.js`
8. **Restart Policy**: Always
9. Vá para "Settings" → "Networking"
10. **Remove Public Networking** (desmarque/deletes port 3000)
11. Clique "Deploy"

### 4️⃣ Verificar Logs

```bash
railway logs --follow --lines 50
```

Espera ver:
```
🚀 Monitor Synapse Iniciado
🔄 Iniciando ciclo de monitoramento...
```

## 📝 Arquivos Criados

- `railway.json` - Configuração JSON (alternativo)
- `railway.toml` - Configuração TOML (alternativo)
- `Dockerfile` - ✅ Já existente e correto

## 🔧 Variáveis de Ambiente Necessárias

No Railway, adicione:

```
AMAZON_CREDENTIAL_ID=seu_id
AMAZON_CREDENTIAL_SECRET=seu_secret
AMAZON_MARKETPLACE=www.amazon.com.br
AMAZON_PARTNER_TAG=seu_tag
TELEGRAM_BOT_TOKEN=seu_token
TELEGRAM_CHAT_ID=seu_chat_id
ML_CLIENT_ID=seu_client_id
ML_CLIENT_SECRET=seu_secret
ML_INITIAL_CODE=seu_code
ML_REDIRECT_URI=seu_redirect_uri
SHOPEE_APP_ID=seu_app_id
SHOPEE_APP_KEY=seu_app_key
WA_GROUP_ID=seu_group_id (opcional)
```

## ✅ Resultado Esperado

- ✅ Container roda como worker (sem HTTP)
- ✅ Sem porta exposta
- ✅ Sem Bun
- ✅ Logs mostram ciclos de monitoramento
- ✅ Reinicia automaticamente em caso de crash
