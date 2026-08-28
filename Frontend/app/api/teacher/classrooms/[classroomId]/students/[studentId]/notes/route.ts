import { query } from '@one-more-chapter/backend';
import { assertActiveStudentMembership, assertClassroomOwner, currentTeacher, errorResponse } from '../../../../../utils';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ classroomId: string; studentId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId, studentId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    await assertActiveStudentMembership(classroomId, studentId);
    const body = String((await request.json()).body ?? '').trim();
    if (!body || body.length > 2000) throw new Error('Notes must be between 1 and 2,000 characters.');
    const note = (await query('INSERT INTO teacher_student_notes(teacher_id,classroom_id,student_id,body) VALUES($1,$2,$3,$4) RETURNING id,student_id AS "studentId",body,created_at AS "createdAt",updated_at AS "updatedAt"', [teacherId, classroomId, studentId, body]))[0];
    return Response.json(note, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
