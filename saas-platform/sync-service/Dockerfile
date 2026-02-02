FROM node:22-alpine

WORKDIR /app

COPY sync-service/package.json ./
RUN npm install

COPY sync-service/src ./src
COPY src/lib/db ./src/lib/db

CMD ["npm", "start"]
