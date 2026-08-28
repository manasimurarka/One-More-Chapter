import { analyticsForTeacher, db, query } from '@one-more-chapter/backend';
import { assertClassroomOwner, currentTeacher, errorResponse, validClassroom } from '../../utils';
import { loadTeacherClassrooms } from '../../classroom-data';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ classroomId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    const analytics = await analyticsForTeacher(teacherId).catch(() => []);
    const analyticsByStudent = new Map(analytics.map((item) => [item.studentId, { eventCount: Number(item.eventCount), lastEventAt: item.lastEventAt, helpRequests: Number(item.helpRequests), gettingHardCheckins: Number(item.gettingHardCheckins) }]));
    const classroom = (await loadTeacherClassrooms(teacherId, analyticsByStudent)).find((item) => item.id === classroomId);
    if (!classroom) throw new Error('Classroom not found');
    const notes = await query('SELECT id, student_id AS "studentId", body, created_at AS "createdAt", updated_at AS "updatedAt" FROM teacher_student_notes WHERE teacher_id=$1 AND classroom_id=$2 ORDER BY created_at DESC', [teacherId, classroomId]);
    return Response.json({ ...classroom, notes });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ classroomId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    const body = await request.json();
    const { cleanName, cleanCode } = validClassroom(body.name, body.code);
    const classroom = (await query('UPDATE classrooms SET name=$1,code=$2 WHERE id=$3 RETURNING id,name,code', [cleanName, cleanCode, classroomId]))[0];
    return Response.json(classroom);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ classroomId: string }> }) {
  const client = await db.connect();
  try {
    const teacherId = await currentTeacher();
    const { classroomId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    await client.query('BEGIN');
    await client.query('UPDATE classrooms SET archived_at=now() WHERE id=$1', [classroomId]);
    await client.query('UPDATE classroom_memberships SET active=false WHERE classroom_id=$1', [classroomId]);
    await client.query('COMMIT');
    return Response.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    return errorResponse(error);
  } finally { client.release(); }
}
