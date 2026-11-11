import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params;
  const cashiers = await prisma.storeMembership.findMany({
    where: { storeId, role: 'CASHIER' },
    include: { user: { select: { id: true, email: true, name: true } }, registerAssignments: { include: { register: { select: { id: true, name: true, code: true, active: true } } } } },
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json({ cashiers });
}

export async function POST(req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params; const body = await req.json();
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim().slice(0, 100);
  const registerIds = Array.isArray(body.registerIds) ? body.registerIds.map(String) : [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2) return NextResponse.json({ error: 'Проверьте имя и email кассира' }, { status: 400 });
  const store = await prisma.store.findUnique({ where: { id: storeId }, include: { subscription: { include: { plan: true } } } });
  if (!store) return NextResponse.json({ error: 'Магазин не найден' }, { status: 404 });
  const plan = store.subscription?.plan;
  const memberCount = await prisma.storeMembership.count({ where: { storeId } });
  if (plan && memberCount >= plan.maxUsers) return NextResponse.json({ error: `Лимит пользователей по тарифу: ${plan.maxUsers}` }, { status: 409 });
  const registers = await prisma.register.findMany({ where: { id: { in: registerIds }, storeId, active: true }, select: { id: true } });
  if (registers.length !== registerIds.length) return NextResponse.json({ error: 'Одна или несколько касс не найдены' }, { status: 400 });
  const temporaryPassword = randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  try {
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { email, name, passwordHash } });
      const membership = await tx.storeMembership.create({ data: { userId: user.id, storeId, role: 'CASHIER' } });
      if (registers.length) await tx.cashierAssignment.createMany({ data: registers.map(r => ({ membershipId: membership.id, registerId: r.id })) });
      return { id: user.id, membershipId: membership.id, email: user.email, name: user.name };
    });
    return NextResponse.json({ cashier: result, temporaryPassword }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Этот email уже используется. Для нового магазина укажи другой email.' }, { status: 409 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params; const body = await req.json();
  const membershipId = String(body.membershipId ?? '');
  const membership = await prisma.storeMembership.findFirst({ where: { id: membershipId, storeId, role: 'CASHIER' } });
  if (!membership) return NextResponse.json({ error: 'Кассир не найден' }, { status: 404 });
  const ids = Array.isArray(body.registerIds) ? body.registerIds.map(String) : [];
  const valid = await prisma.register.findMany({ where: { id: { in: ids }, storeId, active: true }, select: { id: true } });
  if (valid.length !== ids.length) return NextResponse.json({ error: 'Некорректный список касс' }, { status: 400 });
  await prisma.$transaction([
    prisma.cashierAssignment.deleteMany({ where: { membershipId } }),
    ...(ids.length
      ? [
        prisma.cashierAssignment.createMany({
          data: ids.map((registerId: string) => ({
            membershipId,
            registerId,
          })),
        }),
      ]
      : [])
  ]);
  return NextResponse.json({ updated: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params; const membershipId = new URL(req.url).searchParams.get('membershipId') ?? '';
  const membership = await prisma.storeMembership.findFirst({ where: { id: membershipId, storeId, role: 'CASHIER' }, include: { user: true } });
  if (!membership) return NextResponse.json({ error: 'Кассир не найден' }, { status: 404 });
  await prisma.storeMembership.delete({ where: { id: membershipId } });

  return NextResponse.json({ removed: true, historyPreserved: true });
}
