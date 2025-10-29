FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

EXPOSE 8021

CMD ["node", "--loader", "ts-node/esm", "src/main.ts"]
