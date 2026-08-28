import { isCurrentStoryProfile, query, sessionFromToken } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function GET() {
  const session = await sessionFromToken((await cookies()).get('omc_session')?.value);
  if (!session?.studentId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [student, profile, reading, abandonedBooks] = await Promise.all([
    query<{ name: string; classroomId: string; classroomName: string }>(`SELECT s.display_name AS name, c.id AS "classroomId", c.name AS "classroomName" FROM students s JOIN classroom_memberships m ON m.student_id=s.id AND m.active JOIN classrooms c ON c.id=m.classroom_id AND c.archived_at IS NULL WHERE s.id=$1 LIMIT 1`, [session.studentId]),
    query<{ answers: unknown; dna: unknown; summary: string }>('SELECT answers,dna,summary FROM student_story_profiles WHERE student_id=$1', [session.studentId]),
    query<{ id: string; currentPage: number; feeling: string | null; lastCheckinAt: string | null; title: string; pageCount: number | null }>(`SELECT sb.id,sb.current_page AS "currentPage",sb.feeling,sb.last_checkin_at AS "lastCheckinAt",b.title,b.page_count AS "pageCount" FROM student_books sb JOIN books b ON b.id=sb.book_id WHERE sb.student_id=$1 AND sb.status='ACTIVE' ORDER BY sb.selected_at DESC LIMIT 1`, [session.studentId]),
    query<{ title: string; currentPage: number; switchedAt: string | null }>(`SELECT b.title, sb.current_page AS "currentPage", sb.switched_at AS "switchedAt" FROM student_books sb JOIN books b ON b.id=sb.book_id WHERE sb.student_id=$1 AND sb.status='SWITCHED' ORDER BY sb.switched_at DESC NULLS LAST, sb.selected_at DESC`, [session.studentId]),
  ]);
  if (!student[0]) return Response.json({ error: 'This classroom access is no longer active.' }, { status: 403 });
  const currentProfile = profile[0] && isCurrentStoryProfile(profile[0].dna) ? profile[0] : null;
  return Response.json({ student: { id: session.studentId, name: student[0].name }, classroom: { id: student[0].classroomId, name: student[0].classroomName }, profile: currentProfile, reading: reading[0] ?? null, abandonedBooks });
}
