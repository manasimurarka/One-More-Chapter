import { query } from '@one-more-chapter/backend';
import { currentTeacher, errorResponse, validClassroom } from '../utils';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const teacherId = await currentTeacher();
    const body = await request.json();
    const { cleanName: name, cleanCode: code } = validClassroom(body.name, body.code);
    const classroom = (await query('INSERT INTO classrooms(teacher_id,name,code) VALUES($1,$2,$3) RETURNING id,name,code', [teacherId, name, code]))[0];
    return Response.json(classroom, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
