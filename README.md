# synapse-price-monitor

Backend simples em Node.js (ESM) para monitorar preços da Amazon Brasil e notificar via Telegram.

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

- `AMAZON_PARTNER_TAG`
- `CHECK_INTERVAL_MINUTES` (ex: `30`)
- `PRICE_DROP_PERCENT` (ex: `5`)
- `PRODUCT_DELAY_MS` (ex: `800`)
- `QUARANTINE_404_THRESHOLD` (ex: `3`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## 🧠 Como funciona
1. Lê os produtos de `products.json` (ASIN + título).
2. Faz scraping da página da Amazon Brasil para obter preço real.
3. Em caso de bloqueio (403/503), usa um fallback via `r.jina.ai` para buscar o HTML.
4. Persiste o último preço em `.data/store.json` para evitar perda em reinícios.
5. Conta falhas 404 consecutivas por ASIN e aplica quarentena automática.
6. Compara com o último preço salvo em memória.
7. Se a queda for maior ou igual ao percentual configurado, envia alerta no Telegram (com imagem se disponível).
8. Executa automaticamente a cada X minutos.

## 🧩 Estrutura dos arquivos
- `index.js`: orquestrador com cron
- `amazon.js`: scraping de preço e enriquecimento básico (título/imagem/link)
- `notifier.js`: envio para Telegram
- `store.js`: armazenamento simples em memória
- `products.json`: lista de ASINs
- `products.quarantine.json`: auditoria de ASINs removidos

## 🚂 Railway (resumo)
1. Conecte o repositório
2. Configure as variáveis de ambiente
3. Deploy automático com `npm start`
