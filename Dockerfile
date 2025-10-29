FROM node:18-alpine

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "--loader", "ts-node/esm", "src/main.ts"]
