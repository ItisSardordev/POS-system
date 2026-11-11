require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Connecting to Neon through Prisma + pg adapter...");

  const result = await prisma.$queryRaw`
  SELECT
    current_database()::text AS database,
    current_user::text AS username,
    NOW()::text AS server_time
  `;

  console.log("SUCCESS:", result);
}

main()
  .catch((error) => {
    console.error("FAILED:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });