import { classroomAnalytics, query, validClassroomAnalyticsRange } from '@one-more-chapter/backend';
import { assertClassroomOwner, currentTeacher, errorResponse } from '../../../utils';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ classroomId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    const range = validClassroomAnalyticsRange(new URL(request.url).searchParams.get('range'));
    const [analytics, classroomRows, studentRows] = await Promise.all([
      classroomAnalytics(classroomId, range),
      query<{ name: string; code: string }>('SELECT name, code FROM classrooms WHERE id=$1', [classroomId]),
      query<{ id: string; name: string }>('SELECT s.id, s.display_name AS name FROM classroom_memberships m JOIN students s ON s.id=m.student_id WHERE m.classroom_id=$1 AND m.active ORDER BY s.display_name', [classroomId]),
    ]);
    const names = new Map(studentRows.map((student) => [student.id, student.name]));
    return Response.json({ classroom: { id: classroomId, name: classroomRows[0].name, code: classroomRows[0].code }, ...analytics, students: analytics.students.map((student) => ({ ...student, name: names.get(student.studentId) ?? 'Former student' })) });
  } catch (error) { return errorResponse(error); }
}
