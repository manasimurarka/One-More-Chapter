import { db, query } from '@one-more-chapter/backend';
import { loadTeacherClassrooms, type ConcernType } from '../../../../../../classroom-data';
import { assertActiveStudentMembership, assertClassroomOwner, currentTeacher, errorResponse } from '../../../../../../utils';

export const runtime = 'nodejs';
const concernTypes = new Set<ConcernType>(['NO_BOOK', 'MAY_NEED_HELP', 'CHECKIN_OVERDUE']);

export async function POST(request: Request, { params }: { params: Promise<{ classroomId: string; studentId: string; concernType: string }> }) {
  const client = await db.connect();
  try {
    const teacherId = await currentTeacher();
    const { classroomId, studentId, concernType } = await params;
    if (!concernTypes.has(concernType as ConcernType)) throw new Error('Unknown concern.');
    await assertClassroomOwner(classroomId, teacherId);
    await assertActiveStudentMembership(classroomId, studentId);
    const classroom = (await loadTeacherClassrooms(teacherId, new Map())).find((item) => item.id === classroomId);
    const concern = classroom?.students.find((student) => student.id === studentId)?.concerns.find((item) => item.type === concernType);
    if (!concern) throw new Error('This concern is no longer active.');
    const body = await request.json();
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 2000) throw new Error('Notes must be 2,000 characters or fewer.');
    await client.query('BEGIN');
    await client.query('INSERT INTO teacher_student_concern_actions(teacher_id,classroom_id,student_id,concern_type,evidence_at,acknowledged_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(teacher_id,classroom_id,student_id,concern_type) DO UPDATE SET evidence_at=EXCLUDED.evidence_at,acknowledged_at=now()', [teacherId, classroomId, studentId, concernType, concern.evidenceAt]);
    if (note) await client.query('INSERT INTO teacher_student_notes(teacher_id,classroom_id,student_id,body) VALUES($1,$2,$3,$4)', [teacherId, classroomId, studentId, note]);
    await client.query('COMMIT');
    return Response.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return errorResponse(error);
  } finally { client.release(); }
}
