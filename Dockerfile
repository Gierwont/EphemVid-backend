FROM alpine 

WORKDIR /app
COPY . .

RUN apk add --no-cache ffmpeg nodejs npm 

RUN npm i
RUN npm run build 

# Get rid of npm because we don't need it
RUN apk del npm

CMD ["node", "dist/index.js"]
