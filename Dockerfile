FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install && \
    yarn add typescript && \
    npm install ts-node

COPY . .

RUN mkdir -p /app/out && \
    chmod -R 755 /app && \
    npm run build

CMD ["npm", "run", "dev"]
