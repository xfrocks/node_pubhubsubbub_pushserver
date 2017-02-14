FROM node:7.5.0-alpine

RUN apk --update --no-cache add git

VOLUME "/app"
WORKDIR "/app"

ENTRYPOINT ["npm"]
CMD ["run", "develop"]
