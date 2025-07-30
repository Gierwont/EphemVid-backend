FROM node:24.4 
WORKDIR /app

COPY . .
RUN npm i 
RUN npm run build 

RUN useradd app
USER app

EXPOSE 3000

CMD ["npm","start"]
