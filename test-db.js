require("dotenv").config();

const { Client } = require("pg");

async function test() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT current_database(), current_user, NOW()"
    );

    console.log("DATABASE CONNECTED SUCCESSFULLY");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("DATABASE CONNECTION FAILED");
    console.error("Code:", error.code);
    console.error("Message:", error.message);
  } finally {
    await client.end().catch(() => {});
  }
}

test();