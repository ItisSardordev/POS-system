-- Prevent two simultaneous open shifts on the same register.
CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_one_open_per_register"
ON "CashShift" ("registerId")
WHERE "closedAt" IS NULL;
