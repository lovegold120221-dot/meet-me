FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY webhook-server.js ./

EXPOSE 3000

USER node

CMD ["node", "webhook-server.js"]
