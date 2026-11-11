# StorePOS cloud-sync audit

## Confirmed current behavior
- `src/components/POS.tsx` reads and writes products, sales, stock moves and expenses through Dexie.
- `src/lib/db.ts` defines a browser-local IndexedDB database named `StorePOS`.
- The Prisma schema already has tenant-scoped Store, Product, Sale, SaleItem, StockMove, Expense and SyncEvent models.
- The client-side POS does not call a tenant-scoped API for these entities. This is why devices do not share data.

## Required implementation
1. Authenticate every POS request using the signed server session.
2. Resolve `storeId` only from the verified session, never from request JSON.
3. Add server APIs for product CRUD, stock receipts/write-offs, sales checkout and expenses.
4. Make checkout one Prisma transaction: validate stock, create sale/items, decrement stock, write stock movement.
5. Add stable client operation IDs and unique constraints for idempotent offline replay.
6. Keep IndexedDB as an offline cache and outbox, not as the source of truth.
7. On reconnect, replay outbox operations; pull server changes and refresh local cache.
8. Enforce subscription status and store membership on every protected request.

## Security note
This archive intentionally excludes `.env`, `.next`, `node_modules`, `.git` and `.vercel`.
The uploaded archive contained a `.env` file. Rotate the Neon database password and session secret if the uploaded `.env` contained live credentials. Never commit `.env`; keep `.env.example` with placeholders only.
