import { db, emitEvent, Feeling, query, ReadingStatus, sessionFromToken } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

async function context() {
  const session = await sessionFromToken((await cookies()).get('omc_session')?.value);
  if (!session?.studentId) throw new Error('Unauthorized');
  const membership = (await query<{ classroom_id: string; teacher_id: string }>('SELECT c.id AS classroom_id, c.teacher_id FROM classroom_memberships m JOIN classrooms c ON c.id = m.classroom_id AND c.archived_at IS NULL WHERE m.student_id = $1 AND m.active LIMIT 1', [session.studentId]))[0];
  if (!membership) throw new Error('No active classroom membership');
  return { session, membership };
}

export async function POST(request: Request) {
  try {
    const { session, membership } = await context();
    const body = await request.json();
    if (body.action === 'select') {
      if (typeof body.bookId !== 'string') throw new Error('A book is required');
      const client = await db.connect();
      let state;
      let switchedBookId: string | null = null;
      try {
        await client.query('BEGIN');
        const switched = await client.query<{ book_id: string }>('UPDATE student_books SET status = $1, switched_at = now() WHERE student_id = $2 AND status = $3 RETURNING book_id', [ReadingStatus.SWITCHED, session.studentId, ReadingStatus.ACTIVE]);
        switchedBookId = switched.rows[0]?.book_id ?? null;
        state = (await client.query('INSERT INTO student_books(student_id, book_id) VALUES($1, $2) RETURNING *', [session.studentId, body.bookId])).rows[0];
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      if (switchedBookId) await emitEvent({ eventName: 'book_switched', studentId: session.studentId, classroomId: membership.classroom_id, teacherId: membership.teacher_id, bookId: switchedBookId, properties: { replacementBookId: body.bookId } });
      await emitEvent({ eventName: 'recommendation_selected', studentId: session.studentId, classroomId: membership.classroom_id, teacherId: membership.teacher_id, bookId: body.bookId });
      return Response.json(state);
    }
    const feeling = body.feeling as Feeling;
    const page = Number(body.page);
    if (!Object.values(Feeling).includes(feeling) || !Number.isInteger(page) || page < 0) throw new Error('A valid page and feeling are required');
    const client = await db.connect();
    let active: { id: string; book_id: string; current_page: number; is_recent_checkin: boolean } | undefined;
    try {
      await client.query('BEGIN');
      active = (await client.query<{ id: string; book_id: string; current_page: number; is_recent_checkin: boolean }>(`SELECT id, book_id, current_page, last_checkin_at > now() - interval '1 minute' AS is_recent_checkin FROM student_books WHERE student_id = $1 AND status = $2 ORDER BY selected_at DESC LIMIT 1 FOR UPDATE`, [session.studentId, ReadingStatus.ACTIVE])).rows[0];
      if (!active) throw new Error('No active book found');
      if (!active.is_recent_checkin && page < active.current_page) throw new Error(`Your last check-in was page ${active.current_page}. After one minute, check-ins cannot go backward, so please enter that page or a higher page.`);
      await client.query('UPDATE student_books SET current_page = $1, feeling = $2, last_checkin_at = now() WHERE id = $3', [page, feeling, active.id]);
      await client.query('INSERT INTO reading_checkins(student_book_id, page_number, feeling) VALUES($1, $2, $3)', [active.id, page, feeling]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    await emitEvent({ eventName: 'reading_checkin', studentId: session.studentId, classroomId: membership.classroom_id, teacherId: membership.teacher_id, bookId: active!.book_id, pageNumber: page, feeling, frictionType: feeling === Feeling.GETTING_HARD ? 'book_becoming_too_hard' : undefined });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not update reading.' }, { status: 401 }); }
}
