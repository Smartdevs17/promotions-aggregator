#!/bin/sh
set -eu

pnpm db:migrate
exec pnpm --filter @promotions/api start
