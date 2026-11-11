import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
export const runtime = 'nodejs';
export async function POST(req:Request) {
 const s=await getSession();
 if(!s||s.role!=='STORE_USER'||!s.storeId) return NextResponse.json({error:'Unauthorized'},{status:401});
 const body=await req.json(); const action=String(body.action??''); const registerId=String(body.registerId??'');
 const membership=await prisma.storeMembership.findFirst({where:{userId:s.sub,storeId:s.storeId},include:{registerAssignments:true}});
 if(!membership) return NextResponse.json({error:'Membership not found'},{status:403});
 if(action==='open') {
   const reg=await prisma.register.findFirst({where:{id:registerId,storeId:s.storeId,active:true}});
   const assigned=membership.role==='OWNER'||membership.role==='MANAGER'||membership.registerAssignments.some(a=>a.registerId===registerId);
   if(!reg||!assigned) return NextResponse.json({error:'Register unavailable or not assigned'},{status:403});
   const existing=await prisma.cashShift.findFirst({where:{registerId,closedAt:null}});
   if(existing) return NextResponse.json({error:'This register already has an open shift'},{status:409});
   const openingCash=Number(body.openingCash??0);
   if(!Number.isFinite(openingCash)||openingCash<0) return NextResponse.json({error:'Invalid opening cash'},{status:400});
   const shift=await prisma.cashShift.create({data:{storeId:s.storeId,registerId,cashierId:s.sub,openingCash}});
   return NextResponse.json({shift},{status:201});
 }
 if(action==='close') {
   const shiftId=String(body.shiftId??'');
   const shift=await prisma.cashShift.findFirst({where:{id:shiftId,storeId:s.storeId,cashierId:s.sub,closedAt:null}});
   if(!shift) return NextResponse.json({error:'Open shift not found'},{status:404});
   const closingCash=Number(body.closingCash);
   if(!Number.isFinite(closingCash)||closingCash<0) return NextResponse.json({error:'Invalid closing cash'},{status:400});
   const updated=await prisma.cashShift.update({where:{id:shift.id},data:{closingCash,closedAt:new Date()}});
   return NextResponse.json({shift:updated});
 }
 return NextResponse.json({error:'Unknown action'},{status:400});
}
