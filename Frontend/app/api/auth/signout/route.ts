import { revokeSession } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST() {
  const store = await cookies();
  await revokeSession(store.get('omc_session')?.value);
  store.set('omc_session', '', { httpOnly: true, path: '/', maxAge: 0 });
  return Response.json({ ok: true });
}
