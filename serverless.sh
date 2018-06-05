#!/bin/sh

exec docker-compose -f docker-compose.serverless.yml "$@"
