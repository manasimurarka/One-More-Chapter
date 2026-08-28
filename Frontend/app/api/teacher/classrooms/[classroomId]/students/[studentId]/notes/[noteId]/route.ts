import { query } from '@one-more-chapter/backend';
import { assertActiveStudentMembership, assertClassroomOwner, currentTeacher, errorResponse } from '../../../../../../utils';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ classroomId: string; studentId: string; noteId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId, studentId, noteId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    await assertActiveStudentMembership(classroomId, studentId);
    const body = String((await request.json()).body ?? '').trim();
    if (!body || body.length > 2000) throw new Error('Notes must be between 1 and 2,000 characters.');
    const note = (await query('UPDATE teacher_student_notes SET body=$1,updated_at=now() WHERE id=$2 AND teacher_id=$3 AND classroom_id=$4 AND student_id=$5 RETURNING id,student_id AS "studentId",body,created_at AS "createdAt",updated_at AS "updatedAt"', [body, noteId, teacherId, classroomId, studentId]))[0];
    if (!note) throw new Error('Note not found.');
    return Response.json(note);
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ classroomId: string; studentId: string; noteId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId, studentId, noteId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    await assertActiveStudentMembership(classroomId, studentId);
    const deleted = await query('DELETE FROM teacher_student_notes WHERE id=$1 AND teacher_id=$2 AND classroom_id=$3 AND student_id=$4 RETURNING id', [noteId, teacherId, classroomId, studentId]);
    if (!deleted[0]) throw new Error('Note not found.');
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
