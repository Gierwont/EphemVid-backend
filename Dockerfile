FROM node:24.4 
WORKDIR .

COPY ./* .
RUN npm ci --omit=dev