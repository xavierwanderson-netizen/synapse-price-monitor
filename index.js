FROM node:20-alpine

# Dependências necessárias para libs nativas (ex: Baileys)
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copia apenas dependências primeiro (melhor cache)
COPY package*.json ./

# Instala apenas produção
RUN npm install --only=production

# Copia restante do projeto
COPY . .

# Comando de inicialização direto (sem shell)
CMD ["node", "index.js"]
