FROM node:7.3.0-alpine

RUN apk --update --no-cache add git

VOLUME "/app"
WORKDIR "/app"

ENTRYPOINT ["npm"]
CMD ["start"]
