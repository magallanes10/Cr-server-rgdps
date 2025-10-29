FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

EXPOSE 8021

CMD ["npx", "ts-node", "--transpile-only", "src/main.ts"]
