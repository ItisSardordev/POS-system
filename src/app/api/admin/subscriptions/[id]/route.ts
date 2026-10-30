import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
export const runtime = 'nodejs';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  try {
    const { id } = await context.params;
    const body = await request.json();
    const allowed = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];
    if (!allowed.includes(body.status)) return NextResponse.json({ error: 'Недопустимый статус' }, { status: 400 });
    const data: { status: 'TRIAL'|'ACTIVE'|'PAST_DUE'|'SUSPENDED'|'CANCELLED'; planId?: string; currentPeriodEnd?: Date | null; trialEndsAt?: Date | null } = { status: body.status };
    if (body.planId) { const p = await prisma.plan.findUnique({ where: { id: String(body.planId) } }); if (!p || !p.enabled) return NextResponse.json({ error: 'Тариф не найден' }, { status: 400 }); data.planId = p.id; }
    if (body.extendDays !== undefined) { const days = Number(body.extendDays); if (!Number.isInteger(days) || days < 1 || days > 3650) return NextResponse.json({ error: 'Продление должно быть от 1 до 3650 дней' }, { status: 400 }); const sub = await prisma.subscription.findUnique({ where: { id } }); if (!sub) return NextResponse.json({ error: 'Подписка не найдена' }, { status: 404 }); const base = sub.currentPeriodEnd && sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date(); const end = new Date(base); end.setDate(end.getDate() + days); data.currentPeriodEnd = end; data.status = 'ACTIVE'; data.trialEndsAt = null; }
    const updated = await prisma.subscription.update({ where: { id }, data });
    return NextResponse.json({ ok: true, status: updated.status, currentPeriodEnd: updated.currentPeriodEnd });
  } catch (e) { console.error(e); return NextResponse.json({ error: 'Не удалось обновить подписку' }, { status: 503 }); }
}
