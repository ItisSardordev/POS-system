import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createSession } from '@/lib/session';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!email || !password || email.length > 254 || password.length > 200) return NextResponse.json({ error: 'Введите email и пароль' }, { status: 400 });
    const adminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
    if (adminEmail && adminPassword && email === adminEmail && password === adminPassword) {
      await createSession({ sub: 'platform-admin', role: 'PLATFORM_ADMIN', email });
      return NextResponse.json({ ok: true, role: 'PLATFORM_ADMIN', redirect: '/platform-admin' });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          take: 1,
          include: {
            store: {
              include: {
                subscription: true,
              },
            },
          },
        },
      },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return NextResponse.json({ error: 'Неверный email или пароль' }, { status: 401 });
    if (user.platformRole === 'PLATFORM_ADMIN') return NextResponse.json({ error: 'Для платформенного администратора используйте настроенные учётные данные' }, { status: 403 });
    const membership = user.memberships[0];
    if (!membership) return NextResponse.json({ error: 'Пользователь не привязан к магазину' }, { status: 403 });
    const sub = membership.store.subscription;
    if (!sub || ['SUSPENDED', 'CANCELLED', 'PAST_DUE'].includes(sub.status) || (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) || (sub.status === 'TRIAL' && sub.trialEndsAt && sub.trialEndsAt < new Date())) return NextResponse.json({ error: 'Подписка магазина неактивна. Обратитесь к владельцу магазина.' }, { status: 403 });
    await createSession({ sub: user.id, role: 'STORE_USER', storeId: membership.storeId, email: user.email });
    return NextResponse.json({ ok: true, role: 'STORE_USER', redirect: '/' });
  } catch (e) {
    console.error('Login failed', e);
    return NextResponse.json({ error: 'Сервис входа не настроен или временно недоступен' }, { status: 500 });
  }
}
