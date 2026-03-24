FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .
RUN chmod +x run.sh

ENTRYPOINT ["/bin/sh", "run.sh"]
