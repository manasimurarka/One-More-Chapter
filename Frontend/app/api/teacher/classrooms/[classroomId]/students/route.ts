import { bcrypt, query } from '@one-more-chapter/backend';
import { assertClassroomOwner, currentTeacher, errorResponse, validStudent } from '../../../utils';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ classroomId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    const body = await request.json();
    const { cleanName, cleanPin } = validStudent(body.name, body.pin);
    const pins = await query<{ pin_hash: string }>('SELECT s.pin_hash FROM students s JOIN classroom_memberships m ON m.student_id=s.id WHERE m.classroom_id=$1 AND m.active', [classroomId]);
    if (await Promise.all(pins.map((item) => bcrypt.compare(cleanPin, item.pin_hash))).then((matches) => matches.some(Boolean))) throw new Error('That PIN is already used in this classroom.');
    const student = (await query<{ id: string; display_name: string }>('INSERT INTO students(display_name,pin_hash) VALUES($1,$2) RETURNING id,display_name', [cleanName, await bcrypt.hash(cleanPin, 12)]))[0];
    await query('INSERT INTO classroom_memberships(classroom_id,student_id) VALUES($1,$2)', [classroomId, student.id]);
    return Response.json({ id: student.id, name: student.display_name }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
