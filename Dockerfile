# # Build step. Here we only compile things and discard everything apart from the dist folder
# FROM node:24-bullseye AS builder
# WORKDIR /app

# RUN apt-get update && \
#     apt-get install -y --no-install-recommends build-essential python3 git && \
#     rm -rf /var/lib/apt/lists/*

# COPY package.json package-lock.json ./

# RUN npm i

# COPY . .
# RUN npm run build

# Prod step. Here we actually run the server
FROM alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg nodejs npm

COPY . .

RUN npm i
RUN npm run build

EXPOSE 3000

# Get rid of npm because we don't need it
RUN apk del npm

CMD ["node", "dist/index.js"]