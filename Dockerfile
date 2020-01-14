FROM node:10.18.1-alpine3.11

COPY *.json /app/
WORKDIR /app
RUN npm ci --only=production

COPY . /app

ENTRYPOINT [ "npm" ]
CMD [ "start" ]
