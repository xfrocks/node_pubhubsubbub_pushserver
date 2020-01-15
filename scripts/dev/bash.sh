#!/bin/sh

set -e

docker-compose build

exec docker-compose run --rm -p 18080:18080 -v "$PWD:/app" app run bash
