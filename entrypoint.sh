#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  npx tsx node_modules/drizzle-kit/bin.cjs migrate
fi

echo "Starting server..."
exec npx tsx src/index.ts
