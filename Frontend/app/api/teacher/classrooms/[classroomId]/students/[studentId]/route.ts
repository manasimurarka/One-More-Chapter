import { bcrypt, query } from '@one-more-chapter/backend';
import { assertClassroomOwner, currentTeacher, errorResponse, validStudent } from '../../../../utils';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ classroomId: string; studentId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId, studentId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    const body = await request.json();
    const { cleanName, cleanPin } = validStudent(body.name, body.pin);
    const membership = (await query<{ id: string }>('SELECT id FROM classroom_memberships WHERE classroom_id=$1 AND student_id=$2 AND active', [classroomId, studentId]))[0];
    if (!membership) throw new Error('Student is not active in this classroom.');
    const pins = await query<{ student_id: string; pin_hash: string }>('SELECT s.id AS student_id,s.pin_hash FROM students s JOIN classroom_memberships m ON m.student_id=s.id WHERE m.classroom_id=$1 AND m.active AND s.id<>$2', [classroomId, studentId]);
    if (await Promise.all(pins.map((item) => bcrypt.compare(cleanPin, item.pin_hash))).then((matches) => matches.some(Boolean))) throw new Error('That PIN is already used in this classroom.');
    await query('UPDATE students SET display_name=$1,pin_hash=$2 WHERE id=$3', [cleanName, await bcrypt.hash(cleanPin, 12), studentId]);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ classroomId: string; studentId: string }> }) {
  try {
    const teacherId = await currentTeacher();
    const { classroomId, studentId } = await params;
    await assertClassroomOwner(classroomId, teacherId);
    const memberships = await query('UPDATE classroom_memberships SET active=false WHERE classroom_id=$1 AND student_id=$2 AND active=true RETURNING id', [classroomId, studentId]);
    if (!memberships[0]) throw new Error('Student is not active in this classroom.');
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
