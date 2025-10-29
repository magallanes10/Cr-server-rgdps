FROM node:18-alpine

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

CMD ["npx", "ts-node", "src/main.ts"]
