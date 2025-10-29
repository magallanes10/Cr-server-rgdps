FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN npm install -g typescript
RUN npm install ts-node

COPY . .

RUN chmod -R 755 /app

RUN npm run build

CMD ["npm", "run", "dev"]
