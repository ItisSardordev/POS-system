
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  const result = await client.query(`
    SELECT
      conrelid::regclass::text AS table_name,
      conname AS constraint_name,
      contype AS constraint_type,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY table_name, constraint_type, constraint_name;
  `);

  for (const row of result.rows) {
    console.log(
      `\n${row.table_name} | ${row.constraint_name} | ${row.constraint_type}`
    );
    console.log(`  ${row.definition}`);
  }

  await client.end();
}

main().catch(console.error);

