import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import AdminDashboard from './ui';
export const dynamic = 'force-dynamic';
export default async function PlatformAdminPage(){const s=await getSession();if(!s)redirect('/login');if(s.role!=='PLATFORM_ADMIN')redirect('/');return <AdminDashboard email={s.email}/>;}
