
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    await client.query("BEGIN");

    console.log("1. Adding Sale columns...");

    await client.query(`
      ALTER TABLE "Sale"
        ADD COLUMN IF NOT EXISTS "registerId" TEXT,
        ADD COLUMN IF NOT EXISTS "cashierId" TEXT;
    `);

    console.log("2. Creating Register...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Register" (
        "id" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "code" TEXT NOT NULL,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Register_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "Register_storeId_fkey"
          FOREIGN KEY ("storeId")
          REFERENCES "Store"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    console.log("3. Creating CashierAssignment...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "CashierAssignment" (
        "id" TEXT NOT NULL,
        "membershipId" TEXT NOT NULL,
        "registerId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CashierAssignment_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "CashierAssignment_membershipId_fkey"
          FOREIGN KEY ("membershipId")
          REFERENCES "StoreMembership"("id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CashierAssignment_registerId_fkey"
          FOREIGN KEY ("registerId")
          REFERENCES "Register"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    console.log("4. Creating CashShift...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "CashShift" (
        "id" TEXT NOT NULL,
        "storeId" TEXT NOT NULL,
        "registerId" TEXT NOT NULL,
        "cashierId" TEXT NOT NULL,
        "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "closedAt" TIMESTAMP(3),
        "openingCash" DECIMAL(14,2) NOT NULL DEFAULT 0,
        "closingCash" DECIMAL(14,2),
        CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "CashShift_storeId_fkey"
          FOREIGN KEY ("storeId")
          REFERENCES "Store"("id")
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "CashShift_registerId_fkey"
          FOREIGN KEY ("registerId")
          REFERENCES "Register"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "CashShift_cashierId_fkey"
          FOREIGN KEY ("cashierId")
          REFERENCES "User"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `);

    console.log("5. Adding Sale foreign keys...");

    await client.query(`
      ALTER TABLE "Sale"
        ADD CONSTRAINT "Sale_registerId_fkey"
          FOREIGN KEY ("registerId")
          REFERENCES "Register"("id")
          ON DELETE SET NULL ON UPDATE CASCADE,
        ADD CONSTRAINT "Sale_cashierId_fkey"
          FOREIGN KEY ("cashierId")
          REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
    `);

    console.log("6. Creating indexes...");

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Register_storeId_code_key"
        ON "Register"("storeId", "code");

      CREATE INDEX IF NOT EXISTS "Register_storeId_active_idx"
        ON "Register"("storeId", "active");

      CREATE UNIQUE INDEX IF NOT EXISTS "CashierAssignment_membershipId_registerId_key"
        ON "CashierAssignment"("membershipId", "registerId");

      CREATE INDEX IF NOT EXISTS "CashierAssignment_registerId_idx"
        ON "CashierAssignment"("registerId");

      CREATE INDEX IF NOT EXISTS "CashShift_storeId_openedAt_idx"
        ON "CashShift"("storeId", "openedAt");

      CREATE INDEX IF NOT EXISTS "CashShift_registerId_closedAt_idx"
        ON "CashShift"("registerId", "closedAt");

      CREATE UNIQUE INDEX IF NOT EXISTS "CashShift_one_open_per_register"
        ON "CashShift"("registerId")
        WHERE "closedAt" IS NULL;
    `);

    await client.query("COMMIT");

    console.log("\nSUCCESS: Register migration completed.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("\nMIGRATION FAILED. Changes rolled back.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
