FROM node:18-alpine

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN chmod -R 755 /app

CMD ["npm", "run", "dev"]
