# StorePOS SaaS: GitHub + Vercel + PostgreSQL

## Security model
- Platform admin authenticates with `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` stored as Vercel secrets. No public admin registration exists.
- Sessions are signed HS256 JWTs in HttpOnly, Secure-in-production, SameSite=Strict cookies, expire after 12 hours.
- Store accounts are created by the platform admin; a random temporary password is shown once. The user is stored with a bcrypt hash.
- Each store has its own `storeId`, membership and subscription records. This is **logical tenant isolation in one PostgreSQL database**, not a separate physical database per store.
- Current POS still stores sales/products in browser IndexedDB. The admin database does not yet synchronize POS data across devices. Do not treat the full SaaS as production-ready until POS server APIs, per-request tenant checks, password reset, audit logs, rate limiting, backups and fiscalization are implemented.

## 1. Create a PostgreSQL database
Create a database on Neon, Supabase or another PostgreSQL host. Copy its connection string. For providers with pooled connections, use their direct connection string for schema changes if required by that provider.

## 2. Local environment and schema
```bash
cp .env.example .env
# edit .env with actual secrets and DATABASE_URL
npm install
npx prisma db push
npm run dev
```
Open `http://localhost:3000/login` and sign in using `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD`.

## 3. Deploy
1. Upload the *contents* of this folder to a GitHub repository.
2. Import the repository at https://vercel.com/new.
3. In Vercel → Project → Settings → Environment Variables, set `DATABASE_URL`, `SESSION_SECRET`, `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` for Production (and Preview only if you want a separate test environment).
4. Deploy. Build runs `prisma generate && next build`.
5. Apply schema once against the production database from a trusted local terminal with production `DATABASE_URL`: `npx prisma db push`. Do not expose the connection string in logs or commit it to GitHub.
6. Redeploy/restart after setting variables.

## 4. Add and manage stores
- Sign in at `/login` with platform admin credentials.
- Open `/platform-admin`.
- Choose store name, owner email, plan and trial days, then create it.
- Copy the temporary password shown once and give it to the store owner over a private channel.
- The owner signs in at `/login` using their email and temporary password. Current version does not yet provide a password-change/reset flow, so add that before real customer use.
- Update status, switch plan or extend subscription from the store list.

## 5. Plans and subscription rules
The admin overview creates three default plans on first successful load: Starter, Business and Pro. Prices are example UZS values; review them before selling. This is manual subscription management only: no payment gateway is connected. Setting a subscription to suspended/cancelled blocks a subsequent login, but existing sessions are not immediately revoked yet.

## Important limitations
- `prisma db push` creates/updates schema without migration history. For a production business, replace it with reviewed Prisma migrations and a backup/restore plan.
- A shared database uses `storeId` tenant partitioning. Every future data API must derive `storeId` from the verified session, never trust a `storeId` sent by the browser.
- POS screen still uses browser-local IndexedDB; accounts and subscription management are server-backed but inventory and sales are not yet connected to PostgreSQL.
- No fiscal receipt provider is connected. Printed receipts remain internal receipts only.
