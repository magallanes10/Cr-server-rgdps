FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install
RUN yarn add typescript
RUN npm install ts-node

COPY . .

RUN mkdir -p out
RUN chmod -R 755 /app
RUN npm run build

CMD ["npm", "run", "dev"]
