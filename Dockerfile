FROM nvidia/cuda:12.2.0-base-ubuntu22.04

# Instalacja Node.js 20 (najnowsza LTS)
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]
