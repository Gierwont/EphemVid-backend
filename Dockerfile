FROM node:24.4 
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY . .
RUN npm i 
RUN npm run build 

EXPOSE 3000

CMD ["npm","start"]
