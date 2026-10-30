import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
export const runtime = 'nodejs';
export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  try {
    const defaults = [
      { code: 'STARTER', name: 'Starter', priceMonthly: 99000, maxUsers: 2, maxDevices: 2, maxProducts: 1000 },
      { code: 'BUSINESS', name: 'Business', priceMonthly: 199000, maxUsers: 5, maxDevices: 5, maxProducts: 10000 },
      { code: 'PRO', name: 'Pro', priceMonthly: 349000, maxUsers: 20, maxDevices: 15, maxProducts: 100000 },
    ];
    for (const p of defaults) await prisma.plan.upsert({ where: { code: p.code }, update: {}, create: p });
    const [stores, plans, storeCount, activeCount] = await Promise.all([
      prisma.store.findMany({ orderBy: { createdAt: 'desc' }, include: { owner: { select: { email: true, name: true } }, subscription: { include: { plan: true } }, _count: { select: { products: true, memberships: true } } } }),
      prisma.plan.findMany({ where: { enabled: true }, orderBy: { priceMonthly: 'asc' } }),
      prisma.store.count(),
      prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
    ]);
    return NextResponse.json({ stores: stores.map(s => ({ id: s.id, name: s.name, ownerEmail: s.owner.email, createdAt: s.createdAt, productCount: s._count.products, userCount: s._count.memberships, subscription: s.subscription ? { id: s.subscription.id, status: s.subscription.status, planId: s.subscription.planId, planName: s.subscription.plan.name, priceMonthly: Number(s.subscription.plan.priceMonthly), currentPeriodEnd: s.subscription.currentPeriodEnd, trialEndsAt: s.subscription.trialEndsAt } : null })), plans, metrics: { storeCount, activeCount } });
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Не удалось подключить базу. Проверь DATABASE_URL и миграции.' }, { status: 503 }); }
}
