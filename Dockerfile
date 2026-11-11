# Una sola imagen para todos los servicios; cada uno define su comando en docker-compose.yml
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY services ./services
USER node
