#!/bin/sh

set -e

docker-compose build

exec docker-compose run --rm -v "$PWD:/app" app run bash
