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


## Управление кассами и кассирами (добавлено)

В панели платформенного администратора `/platform-admin` у каждого магазина есть блок «Кассы и кассиры».

- Создание касс с названием и уникальным кодом в пределах магазина.
- Отключение/повторное включение кассы. Кассы с историей продаж/смен архивируются, а не удаляются физически.
- Создание кассиров с email и автоматически сгенерированным временным паролем.
- Назначение кассира на одну или несколько активных касс.
- Удаление членства кассира в магазине без удаления исторических продаж.
- Ограничение количества касс тарифом (`Plan.maxDevices`) и пользователей (`Plan.maxUsers`).

### Обновление существующей базы

После загрузки изменений в GitHub сначала проверь резервную копию Neon, затем выполни локально с production `DATABASE_URL`:

```bash
npx prisma generate
npx prisma db push
npm run build
```

После успешной локальной проверки сделай commit/push и дождись нового Production Deploy в Vercel.

### Важное ограничение текущего этапа

Управление кассами и кассирами доступно платформенному администратору. Новые модели фиксируют назначения и будущие кассовые смены, но текущий POS checkout ещё не передаёт `registerId`/`cashierId` в запись продажи, а экран выбора кассы и открытие/закрытие смены пока не подключены. Не используй кассовую аналитику по отдельным кассам до реализации этих частей.


## Интерфейс языки

Интерфейс получил переключатель O‘zbekcha / English. Основной язык по умолчанию — узбекский.
- POS: переключатель языка в верхней панели; выбор сохраняется в браузере.
- Login и Platform Admin: переключатель языка на соответствующих страницах.
- Язык интерфейса не меняет данные товаров, имена, комментарии и записи базы.
- Перевод покрывает основные элементы кассы, каталога, склада, расходов, отчётов и админки. Некоторые динамические сообщения и системные ошибки могут пока отображаться на русском; их следует переводить при дальнейшей локализации.


## Кассы, кассиры и кассовые смены

В этой версии подключены:
- автоматическое создание основной кассы `POS-01` при создании магазина;
- выбор доступной кассы после входа пользователя;
- открытие и закрытие кассовой смены с начальным и фактическим остатком наличных;
- запрет проведения продажи без открытой смены (для пользователей с серверной учётной записью);
- сохранение `registerId`, `cashierId` и `shiftId` в локальной записи продажи;
- колонки кассы и кассира в локальной истории продаж;
- серверная проверка принадлежности кассы магазину и назначения кассира;
- уникальный индекс PostgreSQL, запрещающий две открытые смены одной кассы.

### Обновление базы Neon

Сделай резервную копию базы. Затем в терминале проекта:

```bash
npm install
npx prisma generate
npx prisma db push
```

Затем выполни SQL из `prisma/migrations/202611060001_cash_register_shifts/migration.sql` в SQL Editor Neon. Он создаёт частичный уникальный индекс для одной открытой смены на кассу.

После этого:

```bash
npm run typecheck
npm run build
```

Публикуй в Vercel только если обе проверки завершились успешно.

### Важное ограничение синхронизации

Текущий POS продолжает хранить каталог, чеки и остатки в IndexedDB (Dexie) на устройстве. `registerId`, `cashierId` и `shiftId` сохраняются в локальном чеке, а смены открываются/закрываются на сервере. Полная отправка продаж в PostgreSQL и сводные отчёты между разными устройствами/кассами требуют отдельного этапа cloud-sync и не должны считаться реализованными этой сборкой.
