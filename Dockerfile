FROM node:18-alpine

WORKDIR /app

RUN npm install -g ts-node

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY . .

CMD ["ts-node", "src/main.ts"]
