import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
export const runtime = 'nodejs';
export async function GET() {
  const s = await getSession();
  if (!s || s.role !== 'STORE_USER' || !s.storeId) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const membership = await prisma.storeMembership.findFirst({
    where:{ userId:s.sub, storeId:s.storeId },
    include:{ registerAssignments:{include:{register:true}} }
  });
  if (!membership) return NextResponse.json({error:'Store membership not found'}, {status:403});
  const assigned = membership.registerAssignments.map(a=>a.register).filter(r=>r.active);
  const registers = membership.role === 'OWNER' || membership.role === 'MANAGER'
    ? await prisma.register.findMany({where:{storeId:s.storeId,active:true},orderBy:{createdAt:'asc'}})
    : assigned;
  const shifts = await prisma.cashShift.findMany({where:{storeId:s.storeId,cashierId:s.sub,closedAt:null},include:{register:true},orderBy:{openedAt:'desc'},take:1});
  return NextResponse.json({storeId:s.storeId,cashierId:s.sub,role:membership.role,registers,activeShift:shifts[0]??null});
}
