# StorePOS SaaS MVP

A Next.js POS prototype plus a server-backed platform admin area for creating store accounts and managing subscription status. Uses Prisma/PostgreSQL for account, store, plan and subscription records; the POS data itself remains browser-local IndexedDB in this MVP.

## Run locally
1. Copy `.env.example` to `.env` and set a PostgreSQL `DATABASE_URL`, a random `SESSION_SECRET` (32+ chars), `PLATFORM_ADMIN_EMAIL`, and a strong `PLATFORM_ADMIN_PASSWORD`.
2. `npm install`
3. `npx prisma db push`
4. `npm run dev`
5. Visit `/login`, then sign in with platform admin environment credentials.

See `DEPLOY.md` for Vercel setup and the store creation workflow.

## Admin features
- Protected platform admin route and admin-only APIs.
- Create a store, owner account, membership and trial/active subscription transactionally.
- Temporary random owner password is bcrypt-hashed in the database and shown only once.
- Change plan, subscription status, and extend a subscription manually.
- Default UZS plans are seeded on the first admin overview request.

## Production warning
This is not yet a complete commercial SaaS. Sales/products still live in browser IndexedDB and do not sync between devices. Add per-request tenant authorization for all store data APIs, password reset/change, rate limiting, audit logs, automated backups, payment gateway integration, fiscalization and tested migrations before real deployment/customer data.
