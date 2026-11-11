
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  const result = await client.query(`
    SELECT
      table_name,
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  let currentTable = "";

  for (const row of result.rows) {
    if (currentTable !== row.table_name) {
      currentTable = row.table_name;
      console.log("\\nTABLE:", currentTable);
    }

    console.log(
      `  ${row.column_name} | ${row.data_type} | nullable=${row.is_nullable} | default=${row.column_default}`
    );
  }

  await client.end();
}

main().catch(console.error);
