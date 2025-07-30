FROM node:24.4 
WORKDIR /app

COPY . .
RUN npm i 
RUN npm run build 

RUN useradd app
USER app

ENV JWT_SECRET=
ENV port=
ENV front_url=

CMD ["npm","start"]