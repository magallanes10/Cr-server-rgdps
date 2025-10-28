oubt node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install -g typescript

COPY . .

FROM node:18-alpine

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY --from=builder /app/outb ./outb
COPY . .

RUN chmod -R 755 /app

CMD ["node", "ooutbain.js"]
