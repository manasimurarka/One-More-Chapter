import { analyticsForTeacher, sessionFromToken } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';
import { loadTeacherClassrooms } from '../classroom-data';

export const runtime = 'nodejs';

export async function GET() {
  const session = await sessionFromToken((await cookies()).get('omc_session')?.value);
  if (!session?.teacherId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const analytics = await analyticsForTeacher(session.teacherId).catch((error) => {
    console.error('teacher_analytics_failed', { teacherId: session.teacherId, error: error instanceof Error ? error.message : String(error) });
    return [];
  });
  const analyticsByStudent = new Map(analytics.map((item) => [item.studentId, { eventCount: Number(item.eventCount), lastEventAt: item.lastEventAt, helpRequests: Number(item.helpRequests), gettingHardCheckins: Number(item.gettingHardCheckins) }]));
  return Response.json({ teacher: session.teacher_name, classrooms: await loadTeacherClassrooms(session.teacherId, analyticsByStudent) });
}
