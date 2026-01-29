# synapse-price-monitor

Backend simples em Node.js (ESM) para monitorar preços da Amazon e notificar via webhook do WhatsApp.

## ✅ Requisitos
- Node.js 18+
- Dependências: `axios` e `node-cron`
- Compatível com Railway (start script pronto)

## 📦 Instalação
```bash
npm install
```

## ▶️ Execução local
```bash
npm start
```

## ⚙️ Variáveis de ambiente
Defina estas variáveis no Railway ou no seu `.env` local:

- `AMAZON_ACCESS_KEY`
- `AMAZON_SECRET_KEY`
- `AMAZON_PARTNER_TAG`
- `AMAZON_REGION`
- `CHECK_INTERVAL_MINUTES` (ex: `30`)
- `WHATSAPP_WEBHOOK_URL`

## 🧠 Como funciona
1. Lê os produtos de `products.json` (ASIN + título).
2. Consulta o preço (simulado no momento, até integrar a assinatura da PAAPI).
3. Compara com o último preço salvo em memória.
4. Se o preço cair, envia uma notificação para o WhatsApp.
5. Executa automaticamente a cada X minutos.

## 🧩 Estrutura dos arquivos
- `index.js`: orquestrador com cron
- `amazon.js`: consulta de preço (placeholder)
- `notifier.js`: envio para WhatsApp
- `store.js`: armazenamento simples em memória
- `products.json`: lista de ASINs

## 🚂 Railway (resumo)
1. Conecte o repositório
2. Configure as variáveis de ambiente
3. Deploy automático com `npm start`
