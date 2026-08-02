#!/usr/bin/env bash
set -e
export CHECKPOINT_DISABLE=1  # skip Prisma's telemetry/update-check network call

echo "=== 1/4: Typecheck ==="
npm run typecheck

echo "=== 2/4: Migrate (creates the timestamptz column migration; auto-seeds on success) ==="
npx prisma migrate dev --name add_timestamptz

echo "=== 3/4: Apply exclusion constraints + triggers ==="
npx prisma db execute --file prisma/sql/constraints.sql --schema prisma/schema.prisma

echo "=== 4/4: Full test suite (DB-gated tests should now run for real) ==="
npx vitest run

echo "=== ALL STEPS COMPLETE ==="
