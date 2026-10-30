import { redirect } from 'next/navigation';
import POS from '@/components/POS';
import { getSession } from '@/lib/session';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'PLATFORM_ADMIN') redirect('/platform-admin');
  return <POS />;
}
