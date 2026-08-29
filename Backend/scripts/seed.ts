import { createHash } from 'node:crypto';
import { bcrypt, clickhouse, closeClickhouse, db } from '../src/index';

type BookSeed = { title: string; authors: string[]; pages: number; tags: string[]; description: string };
type StudentSeed = { name: string; pin: string; age: number; level: string };
type ClassroomSeed = { name: string; code: string; students: StudentSeed[] };
type TeacherSeed = { username: string; displayName: string; classrooms: ClassroomSeed[] };

const password = 'chapter123';
const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const seedClassroomCodes = ['COMET', 'OAKREAD', 'PINEREAD'];

const books: BookSeed[] = [
  { title: 'The Wild Robot', authors: ['Peter Brown'], pages: 288, tags: ['adventure', 'animal', 'meaningful', 'mystery'], description: 'A robot wakes on a wild island and learns how to belong.' },
  { title: 'Amari and the Night Brothers', authors: ['B. B. Alston'], pages: 416, tags: ['magical', 'mystery', 'fast', 'hero'], description: 'Amari enters a hidden magical world to find her missing brother.' },
  { title: 'The One and Only Ivan', authors: ['Katherine Applegate'], pages: 336, tags: ['animal', 'meaningful', 'characters'], description: 'A silverback gorilla discovers the courage to change his life.' },
  { title: 'The Last Kids on Earth', authors: ['Max Brallier'], pages: 240, tags: ['survival', 'funny', 'friend group', 'fast'], description: 'Friends turn an ordinary town into a monster-fighting adventure.' },
  { title: 'The Mysterious Benedict Society', authors: ['Trenton Lee Stewart'], pages: 496, tags: ['mystery', 'friend group', 'clever'], description: 'Four gifted children solve mysteries for a secret mission.' },
  { title: 'Ways to Make Sunshine', authors: ['Renée Watson'], pages: 208, tags: ['real world', 'funny', 'characters'], description: 'Ryan Hart finds bright moments while her family navigates change.' },
  { title: 'Front Desk', authors: ['Kelly Yang'], pages: 320, tags: ['real world', 'brave hero', 'meaningful'], description: 'Mia helps run a motel while her family builds a new life.' },
  { title: 'The Girl Who Drank the Moon', authors: ['Kelly Barnhill'], pages: 400, tags: ['magical', 'meaningful', 'mystery'], description: 'A girl raised by a witch discovers the magic inside her.' },
  { title: 'New Kid', authors: ['Jerry Craft'], pages: 256, tags: ['real world', 'funny', 'characters'], description: 'Jordan starts a new school and learns how to be himself.' },
  { title: 'The Lightning Thief', authors: ['Rick Riordan'], pages: 416, tags: ['magical', 'fast', 'brave hero'], description: 'Percy discovers he is a demigod and begins a dangerous quest.' },
  { title: 'Aru Shah and the End of Time', authors: ['Roshani Chokshi'], pages: 368, tags: ['magical', 'funny', 'brave hero'], description: 'Aru accidentally frees an ancient demon and must put things right.' },
  { title: 'The Great Treehouse War', authors: ['Lisa Graff'], pages: 224, tags: ['funny', 'friend group', 'real world'], description: 'A group of children band together to save their neighborhood.' },
];

const bennettStudents = ['Aaliyah Brooks', 'Mateo Cruz', 'Sofia Nguyen'];
const patelOakStudents = ['Amelia Stone', 'Diego Ramos', 'Harper Lee'];
const patelPineStudents = ['Emma Ford', 'Jasper White', 'Chloe Diaz'];
const owensStudents = ['Liam Carter', 'Olivia Green', 'Mason Brooks'];

function makeStudents(names: string[], pinStart: number): StudentSeed[] {
  return names.map((name, index) => ({ name, pin: String(pinStart + index).padStart(4, '0'), age: 8 + (index % 3), level: ['Developing', 'On level', 'Advanced'][index % 3] }));
}

const teachers: TeacherSeed[] = [
  { username: 'ms.bennett', displayName: 'Ms. Bennett', classrooms: [{ name: 'Room 204', code: 'COMET', students: makeStudents(bennettStudents, 4101) }] },
  { username: 'mr.patel', displayName: 'Mr. Patel', classrooms: [{ name: 'Oak Room', code: 'OAKREAD', students: makeStudents(patelOakStudents, 5101) }, { name: 'Pine Room', code: 'PINEREAD', students: makeStudents(patelPineStudents, 6101) }] },
  { username: 'dr.owens', displayName: 'Dr. Owens', classrooms: [{ name: 'Reading Nook', code: 'OWLREAD', students: makeStudents(owensStudents, 7101) }] },
];

async function ensureBook(client: any, book: BookSeed) {
  const existing = (await client.query('SELECT id FROM books WHERE title=$1 ORDER BY created_at LIMIT 1', [book.title])).rows[0];
  if (existing) {
    await client.query("UPDATE books SET description=COALESCE(description,$1), page_count=COALESCE(page_count,$2), categories=CASE WHEN cardinality(categories)=0 THEN $3 ELSE categories END, tags=CASE WHEN tags = '{}'::jsonb THEN $4::jsonb ELSE tags END WHERE id=$5", [book.description, book.pages, ["Children's fiction"], JSON.stringify(book.tags), existing.id]);
    return existing.id as string;
  }
  return (await client.query('INSERT INTO books(title,authors,description,page_count,categories,tags) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id', [book.title, book.authors, book.description, book.pages, ["Children's fiction"], JSON.stringify(book.tags)])).rows[0].id as string;
}

async function ensureStudentBook(client: any, studentId: string, bookId: string, status: string, currentPage: number, feeling: string | null, selectedAt: Date, lastCheckinAt: Date | null, switchedAt: Date | null) {
  const existing = (await client.query('SELECT id FROM student_books WHERE student_id=$1 AND book_id=$2 AND status=$3 ORDER BY selected_at LIMIT 1', [studentId, bookId, status])).rows[0];
  if (existing) return existing.id as string;
  return (await client.query('INSERT INTO student_books(student_id,book_id,status,current_page,feeling,selected_at,last_checkin_at,switched_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [studentId, bookId, status, currentPage, feeling, selectedAt, lastCheckinAt, switchedAt])).rows[0].id as string;
}

async function ensureCheckin(client: any, studentBookId: string, pageNumber: number, feeling: string, createdAt: Date) {
  const found = (await client.query('SELECT id FROM reading_checkins WHERE student_book_id=$1 AND page_number=$2 AND feeling=$3 LIMIT 1', [studentBookId, pageNumber, feeling])).rows[0];
  if (!found) await client.query('INSERT INTO reading_checkins(student_book_id,page_number,feeling,created_at) VALUES($1,$2,$3,$4)', [studentBookId, pageNumber, feeling, createdAt]);
}

async function ensureActionWithNotes(client: any, teacherId: string, classroomId: string, studentId: string, concernType: string, evidenceAt: Date, notes: string[]) {
  await client.query('INSERT INTO teacher_student_concern_actions(teacher_id,classroom_id,student_id,concern_type,evidence_at,acknowledged_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(teacher_id,classroom_id,student_id,concern_type) DO UPDATE SET evidence_at=EXCLUDED.evidence_at, acknowledged_at=EXCLUDED.acknowledged_at', [teacherId, classroomId, studentId, concernType, evidenceAt, daysAgo(1)]);
  for (const body of notes) {
    const found = (await client.query('SELECT id FROM teacher_student_notes WHERE teacher_id=$1 AND classroom_id=$2 AND student_id=$3 AND body=$4 LIMIT 1', [teacherId, classroomId, studentId, body])).rows[0];
    if (!found) await client.query('INSERT INTO teacher_student_notes(teacher_id,classroom_id,student_id,body,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)', [teacherId, classroomId, studentId, body, daysAgo(1)]);
  }
}

async function seedReadingHistory(client: any, teacherId: string, classroomId: string, studentId: string, index: number, bookIds: string[]) {
  const createdAt = daysAgo(24 + index);
  if ([0, 7, 14].includes(index)) {
    const notes = index === 0
      ? ['Student was absent sick this week; check in when they return.', 'Offer a low-pressure book browse on Monday.']
      : ['Student has not chosen a book yet.', 'Family shared that they are on holiday; revisit choices next week.'];
    await ensureActionWithNotes(client, teacherId, classroomId, studentId, 'NO_BOOK', createdAt, notes);
    return;
  }

  const activeSelected = daysAgo(index === 10 ? 13 : 5 + (index % 4));
  const needsHelp = index === 4;
  const overdue = index === 10;
  const feeling = needsHelp ? 'GETTING_HARD' : ['LOVING_IT', 'ENJOYING', 'UNSURE'][index % 3];
  const lastCheckin = overdue ? daysAgo(9) : daysAgo(1 + (index % 3));
  const activeBook = await ensureStudentBook(client, studentId, bookIds[index % bookIds.length], 'ACTIVE', 24 + index * 7, feeling, activeSelected, lastCheckin, null);

  if (needsHelp) {
    await ensureCheckin(client, activeBook, 38, 'UNSURE', daysAgo(5));
    await ensureCheckin(client, activeBook, 46, 'UNSURE', daysAgo(3));
    await ensureCheckin(client, activeBook, 52, 'GETTING_HARD', lastCheckin);
    await ensureActionWithNotes(client, teacherId, classroomId, studentId, 'MAY_NEED_HELP', lastCheckin, ['Student asked for help with unfamiliar vocabulary.', 'Plan a five-minute conference to practice context clues and choose two words together.']);
  } else {
    await ensureCheckin(client, activeBook, Math.max(1, 12 + index * 4), feeling, lastCheckin);
  }

  if (overdue) await ensureActionWithNotes(client, teacherId, classroomId, studentId, 'CHECKIN_OVERDUE', lastCheckin, ['Student was away visiting family during the last reading check-in.', 'Welcome them back and ask whether the current book still feels like a good fit.']);
  if ([1, 5, 9, 13, 17].includes(index)) {
    await ensureStudentBook(client, studentId, bookIds[(index + 1) % bookIds.length], 'FINISHED', 180 + index, 'LOVING_IT', daysAgo(42 + index), daysAgo(18 + index), null);
    await ensureStudentBook(client, studentId, bookIds[(index + 2) % bookIds.length], 'FINISHED', 210 + index, 'ENJOYING', daysAgo(64 + index), daysAgo(36 + index), null);
  }
  if ([3, 12, 18].includes(index)) await ensureStudentBook(client, studentId, bookIds[(index + 3) % bookIds.length], 'SWITCHED', 32 + index, 'UNSURE', daysAgo(19 + index), daysAgo(15 + index), daysAgo(14 + index));
}

async function removeDuplicateSeedReadingHistory(client: any) {
  const duplicates = `
    SELECT id FROM (
      SELECT sb.id, row_number() OVER (PARTITION BY sb.student_id, b.title, sb.status ORDER BY sb.selected_at, sb.id) AS row_number
      FROM student_books sb
      JOIN classroom_memberships m ON m.student_id=sb.student_id AND m.active
      JOIN classrooms c ON c.id=m.classroom_id
      JOIN books b ON b.id=sb.book_id
      WHERE c.code = ANY($1::text[])
    ) ranked
    WHERE row_number > 1
  `;
  await client.query(`DELETE FROM reading_checkins WHERE student_book_id IN (${duplicates})`, [seedClassroomCodes]);
  await client.query(`DELETE FROM student_books WHERE id IN (${duplicates})`, [seedClassroomCodes]);
}

function seededEventId(readingCheckinId: string) {
  const hex = createHash('sha1').update(`one-more-chapter:demo-reading-checkin:${readingCheckinId}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

async function seedAnalyticsEvents() {
  const checkins = (await db.query<{
    id: string; occurred_at: Date; feeling: string; page_number: number; book_id: string; student_id: string; classroom_id: string; teacher_id: string;
  }>(`
    SELECT rc.id, rc.created_at AS occurred_at, rc.feeling, rc.page_number, sb.book_id, sb.student_id, c.id AS classroom_id, c.teacher_id
    FROM reading_checkins rc
    JOIN student_books sb ON sb.id = rc.student_book_id
    JOIN classroom_memberships cm ON cm.student_id = sb.student_id AND cm.active
    JOIN classrooms c ON c.id = cm.classroom_id AND c.archived_at IS NULL
    WHERE c.code = ANY($1::text[])
  `, [seedClassroomCodes])).rows;

  const events = checkins.map((checkin) => ({
    event_id: seededEventId(checkin.id), occurred_at: checkin.occurred_at.toISOString(), event_name: 'reading_checkin',
    student_id: checkin.student_id, classroom_id: checkin.classroom_id, teacher_id: checkin.teacher_id, book_id: checkin.book_id,
    recommendation_batch_id: null, page_number: checkin.page_number, feeling: checkin.feeling, friction_type: checkin.feeling === 'GETTING_HARD' ? 'book_becoming_too_hard' : null,
    properties: { source: 'demo_seed', reading_checkin_id: checkin.id },
  }));
  if (!events.length) return 0;

  const analytics = clickhouse();
  try {
    const existing = await analytics.query({
      query: 'SELECT event_id FROM reading_events WHERE event_id IN ({eventIds:Array(UUID)})',
      query_params: { eventIds: events.map((event) => event.event_id) },
      format: 'JSONEachRow',
    });
    const existingIds = new Set((await existing.json<{ event_id: string }>()).map((event) => event.event_id));
    const missing = events.filter((event) => !existingIds.has(event.event_id));
    if (missing.length) await analytics.insert({ table: 'reading_events', format: 'JSONEachRow', values: missing });
    return missing.length;
  } finally {
    await closeClickhouse();
  }
}

async function main() {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 12);
    const bookIds: string[] = [];
    for (const book of books) bookIds.push(await ensureBook(client, book));
    for (const teacherSeed of teachers) {
      const teacher = (await client.query('INSERT INTO teachers(username,display_name,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO UPDATE SET display_name=EXCLUDED.display_name, password_hash=EXCLUDED.password_hash RETURNING id', [teacherSeed.username, teacherSeed.displayName, passwordHash])).rows[0];
      for (const classroomSeed of teacherSeed.classrooms) {
        const classroom = (await client.query('INSERT INTO classrooms(teacher_id,name,code) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET teacher_id=EXCLUDED.teacher_id, name=EXCLUDED.name, archived_at=NULL RETURNING id', [teacher.id, classroomSeed.name, classroomSeed.code])).rows[0];
        for (const [index, studentSeed] of classroomSeed.students.entries()) {
          const studentCreatedAt = daysAgo(24 + index);
          const existingStudent = (await client.query('SELECT id FROM students WHERE display_name=$1 ORDER BY created_at LIMIT 1', [studentSeed.name])).rows[0];
          const student = existingStudent ?? (await client.query('INSERT INTO students(display_name,pin_hash,age,reading_level,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id', [studentSeed.name, await bcrypt.hash(studentSeed.pin, 12), studentSeed.age, studentSeed.level, studentCreatedAt])).rows[0];
          await client.query('UPDATE students SET pin_hash=$1, age=$2, reading_level=$3 WHERE id=$4', [await bcrypt.hash(studentSeed.pin, 12), studentSeed.age, studentSeed.level, student.id]);
          await client.query('INSERT INTO classroom_memberships(classroom_id,student_id,active) VALUES($1,$2,true) ON CONFLICT(classroom_id,student_id) DO UPDATE SET active=true', [classroom.id, student.id]);
          await seedReadingHistory(client, teacher.id, classroom.id, student.id, index, bookIds);
        }
      }
    }
    await removeDuplicateSeedReadingHistory(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const analyticsEventsInserted = await seedAnalyticsEvents();
  console.log(`ClickHouse analytics events inserted: ${analyticsEventsInserted}`);
  console.log(`\nDemo seed completed.\n\nTeacher logins (password: ${password})\n- Ms. Bennett: ms.bennett\n- Mr. Patel: mr.patel\n- Dr. Owens: dr.owens\n\nStudent logins\n- Ms. Bennett / Room 204: COMET / 4101 (Aaliyah Brooks), COMET / 4102 (Mateo Cruz), COMET / 4103 (Sofia Nguyen)\n- Mr. Patel / Oak Room: OAKREAD / 5101 (Amelia Stone), OAKREAD / 5102 (Diego Ramos), OAKREAD / 5103 (Harper Lee)\n- Mr. Patel / Pine Room: PINEREAD / 6101 (Emma Ford), PINEREAD / 6102 (Jasper White), PINEREAD / 6103 (Chloe Diaz)\n- Dr. Owens / Reading Nook: OWLREAD / 7101 (Liam Carter), OWLREAD / 7102 (Olivia Green), OWLREAD / 7103 (Mason Brooks)\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
