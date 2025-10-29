FROM node:18-alpine

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install && \
    yarn add typescript ts-node

COPY . .

RUN chmod -R 755 /app

CMD ["yarn", "dev"]
