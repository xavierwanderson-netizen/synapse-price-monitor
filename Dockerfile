FROM node:20-alpine

# Instalar Git e outras dependências necessárias para Baileys
RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .
RUN chmod +x run.sh

ENTRYPOINT ["/bin/sh", "run.sh"]
