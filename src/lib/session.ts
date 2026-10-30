import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export type Session = { sub: string; role: 'PLATFORM_ADMIN' | 'STORE_USER'; storeId?: string; email: string };
const cookieName = 'storepos_session';
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
  return new TextEncoder().encode(secret);
}
export async function createSession(payload: Session) {
  const token = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(key());
  const jar = await cookies();
  jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 12 });
}
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, key()); if (!payload.sub || !payload.role || !payload.email) return null; return payload as unknown as Session; }
  catch { return null; }
}
export async function destroySession() { (await cookies()).delete(cookieName); }
export async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'PLATFORM_ADMIN') return null;
  return session;
}
