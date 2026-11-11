
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  const result = await client.query(`
    SELECT
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);

  for (const row of result.rows) {
    console.log(`\n${row.tablename} | ${row.indexname}`);
    console.log(`  ${row.indexdef}`);
  }

  await client.end();
}

main().catch(console.error);
