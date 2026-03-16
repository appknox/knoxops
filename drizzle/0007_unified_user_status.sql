-- Step 1: Create user_status enum only if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE "user_status" AS ENUM ('pending', 'active', 'expired', 'deleted');
  END IF;
END $$;
--> statement-breakpoint

-- Step 2: Add status column if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "status" "user_status";
  END IF;
END $$;
--> statement-breakpoint

-- Step 3: Migrate data from old columns (only for rows that don't have status yet)
UPDATE "users" SET "status" = CASE
  WHEN "is_active" = false         THEN 'deleted'::user_status
  WHEN "invite_status" = 'pending' THEN 'pending'::user_status
  WHEN "invite_status" = 'expired' THEN 'expired'::user_status
  ELSE                                  'active'::user_status
END
WHERE "status" IS NULL;
--> statement-breakpoint

-- Step 4: Make status NOT NULL and set default
ALTER TABLE "users" ALTER COLUMN "status" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint

-- Step 5: Drop old columns if they still exist
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE "users" DROP COLUMN "is_active";
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'invite_status'
  ) THEN
    ALTER TABLE "users" DROP COLUMN "invite_status";
  END IF;
END $$;
--> statement-breakpoint

-- Step 6: Drop old invite_status enum if it still exists
DROP TYPE IF EXISTS "invite_status";
--> statement-breakpoint

-- Step 7: Drop user_invites table and enum if they still exist
DROP TABLE IF EXISTS "user_invites";
--> statement-breakpoint
DROP TYPE IF EXISTS "user_invite_status";
