FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY webhook-server.js ./

EXPOSE 3000

USER node

CMD ["node", "webhook-server.js"]
