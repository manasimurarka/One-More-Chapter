import { query, sessionFromToken } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';

export async function currentTeacher() {
  const session = await sessionFromToken((await cookies()).get('omc_session')?.value);
  if (!session?.teacherId) throw new Error('Unauthorized');
  return session.teacherId as string;
}

export async function assertClassroomOwner(classroomId: string, teacherId: string) {
  const classroom = (await query<{ id: string }>('SELECT id FROM classrooms WHERE id=$1 AND teacher_id=$2 AND archived_at IS NULL', [classroomId, teacherId]))[0];
  if (!classroom) throw new Error('Classroom not found');
}

export async function assertActiveStudentMembership(classroomId: string, studentId: string) {
  const membership = (await query<{ id: string }>('SELECT id FROM classroom_memberships WHERE classroom_id=$1 AND student_id=$2 AND active', [classroomId, studentId]))[0];
  if (!membership) throw new Error('Student is not active in this classroom.');
}

export function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Could not save classroom changes.';
  return Response.json({ error: message }, { status: message === 'Unauthorized' ? 401 : message === 'Classroom not found' ? 404 : 400 });
}

export function validClassroom(name: unknown, code: unknown) {
  const cleanName = String(name ?? '').trim().slice(0, 80);
  const cleanCode = String(code ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!cleanName || !/^[A-Z0-9]{4,16}$/.test(cleanCode)) throw new Error('Use a classroom name and a 4–16 character code made of letters and numbers.');
  return { cleanName, cleanCode };
}

export function validStudent(name: unknown, pin: unknown) {
  const cleanName = String(name ?? '').trim().slice(0, 80);
  const cleanPin = String(pin ?? '').trim();
  if (!cleanName) throw new Error('A student name is required.');
  if (!/^\d{4}$/.test(cleanPin)) throw new Error('Student PINs must be exactly four digits.');
  return { cleanName, cleanPin };
}
