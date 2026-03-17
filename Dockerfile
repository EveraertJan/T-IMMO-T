FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium chromium-sandbox python3 make g++ \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/
COPY public/ ./public/
COPY config.json ./
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "src/index.js"]
