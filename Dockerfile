FROM nvidia/cuda:12.2.0-base-ubuntu22.04

WORKDIR /app
COPY . .

RUN apt-get update && apt-get install -y \
    ffmpeg \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

RUN npm install
RUN npm run build

CMD ["node", "dist/index.js"]
