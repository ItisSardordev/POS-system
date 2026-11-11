import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ storeId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params;
  const registers = await prisma.register.findMany({
    where: { storeId },
    orderBy: { createdAt: 'asc' },
    include: {
      assignments: {
        include: {
          membership: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      _count: {
        select: {
          sales: true,
        },
      },
    },
  });
  return NextResponse.json({ registers });
}

export async function POST(req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params;
  const body = await req.json();
  const name = String(body.name ?? '').trim().slice(0, 80);
  const code = String(body.code ?? '').trim().toUpperCase().slice(0, 24);
  if (name.length < 2 || code.length < 1) return NextResponse.json({ error: 'Укажите название и код кассы' }, { status: 400 });
  const store = await prisma.store.findUnique({ where: { id: storeId }, include: { subscription: { include: { plan: true } } } });
  if (!store) return NextResponse.json({ error: 'Магазин не найден' }, { status: 404 });
  const maxRegisters = store.subscription?.plan.maxDevices ?? 1;
  const count = await prisma.register.count({ where: { storeId, active: true } });
  if (count >= maxRegisters) return NextResponse.json({ error: `Лимит касс по тарифу: ${maxRegisters}` }, { status: 409 });
  try {
    const register = await prisma.register.create({ data: { storeId, name, code } });
    return NextResponse.json({ register }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Код кассы уже используется в этом магазине' }, { status: 409 });
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params; const body = await req.json();
  const id = String(body.id ?? '');
  const register = await prisma.register.findFirst({ where: { id, storeId } });
  if (!register) return NextResponse.json({ error: 'Касса не найдена' }, { status: 404 });
  const updated = await prisma.register.update({ where: { id }, data: { ...(typeof body.name === 'string' ? { name: body.name.trim().slice(0, 80) } : {}), ...(typeof body.active === 'boolean' ? { active: body.active } : {}) } });
  return NextResponse.json({ register: updated });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Недостаточно прав' }, { status: 401 });
  const { storeId } = await params; const id = new URL(req.url).searchParams.get('id') ?? '';
  const register = await prisma.register.findFirst({ where: { id, storeId }, include: { _count: { select: { sales: true, shifts: true } } } });
  if (!register) return NextResponse.json({ error: 'Касса не найдена' }, { status: 404 });
  if (register._count.sales || register._count.shifts) {
    await prisma.register.update({ where: { id }, data: { active: false, name: `${register.name} (архив)` } });
    return NextResponse.json({ archived: true });
  }
  await prisma.register.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
