FROM node:18-alpine

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN yarn add typescript

COPY . .

RUN chmod -R 755 /app

CMD ["node", "src/main.ts"]
