import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  try {
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const planId = String(body.planId ?? '');
    const trialDays = Math.min(30, Math.max(0, Number(body.trialDays ?? 14)));
    if (name.length < 2 || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || !planId) return NextResponse.json({ error: 'Проверьте название магазина, email и тариф' }, { status: 400 });
    if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: 'Этот email уже зарегистрирован' }, { status: 409 });
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.enabled) return NextResponse.json({ error: 'Выбранный тариф недоступен' }, { status: 400 });
    const temporaryPassword = randomBytes(9).toString('base64url') + 'aA1!';
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const end = new Date(); end.setDate(end.getDate() + trialDays);
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { email, name, passwordHash } });
      const store = await tx.store.create({ data: { name, ownerId: user.id } });
      await tx.storeMembership.create({ data: { userId: user.id, storeId: store.id, role: 'OWNER' } });
      const subscription = await tx.subscription.create({ data: { storeId: store.id, planId: plan.id, status: trialDays > 0 ? 'TRIAL' : 'ACTIVE', startedAt: new Date(), trialEndsAt: trialDays > 0 ? end : null, currentPeriodEnd: trialDays > 0 ? end : new Date(Date.now() + 30 * 86400000) } });
      return { storeId: store.id, subscriptionId: subscription.id };
    });
    return NextResponse.json({ ...result, ownerEmail: email, temporaryPassword, message: 'Сохраните временный пароль сейчас. Он больше не будет показан.' }, { status: 201 });
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Не удалось создать магазин. Проверьте подключение и миграции базы данных.' }, { status: 503 }); }
}
