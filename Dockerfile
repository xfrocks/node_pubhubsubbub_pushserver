FROM node:12.14.1-alpine3.11

COPY *.json /app/
WORKDIR /app
RUN npm ci --only=production

COPY . /app

ENTRYPOINT [ "npm" ]
CMD [ "start" ]
