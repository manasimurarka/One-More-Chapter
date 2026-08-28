import { emitEvent, helpWithPassage, query, sessionFromToken } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await sessionFromToken((await cookies()).get('omc_session')?.value);
    if (!session?.studentId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { passage } = await request.json();
    if (typeof passage !== 'string' || passage.trim().length < 10 || passage.length > 600) return Response.json({ error: 'Use 10-600 characters.' }, { status: 400 });
    const state = (await query<{ book_id: string; title: string }>('SELECT sb.book_id, b.title FROM student_books sb JOIN books b ON b.id = sb.book_id WHERE sb.student_id = $1 AND sb.status = $2 ORDER BY sb.selected_at DESC LIMIT 1', [session.studentId, 'ACTIVE']))[0];
    const membership = (await query<{ classroom_id: string; teacher_id: string }>('SELECT c.id AS classroom_id, c.teacher_id FROM classroom_memberships m JOIN classrooms c ON c.id = m.classroom_id AND c.archived_at IS NULL WHERE m.student_id = $1 AND m.active LIMIT 1', [session.studentId]))[0];
    if (!state || !membership) return Response.json({ error: 'No active book or classroom found.' }, { status: 400 });
    const help = await helpWithPassage(passage, state.title, session.studentId);
    await emitEvent({ eventName: 'help_requested', studentId: session.studentId, classroomId: membership.classroom_id, teacherId: membership.teacher_id, bookId: state.book_id, properties: { passage_length: passage.length } });
    return Response.json(help);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not get help.' }, { status: 500 }); }
}
