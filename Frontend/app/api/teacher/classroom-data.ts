import { query } from '@one-more-chapter/backend';

export type ConcernType = 'NO_BOOK' | 'MAY_NEED_HELP' | 'CHECKIN_OVERDUE';
export type Concern = { type: ConcernType; label: string; evidenceAt: string; acknowledged: boolean };
export type StudentSummary = {
  id: string; name: string; reading: { currentPage: number; feeling: string | null; lastCheckinAt: string | null; selectedAt: string; book: { title: string } } | null;
  abandonedBooks: { title: string; currentPage: number; switchedAt: string | null }[];
  analytics: { eventCount: number; lastEventAt: string | null; helpRequests: number; gettingHardCheckins: number };
  concerns: Concern[];
};
export type ClassroomSummary = { id: string; name: string; code: string; students: StudentSummary[] };

type DashboardRow = {
  classroom_id: string; classroom_name: string; classroom_code: string; student_id: string | null; student_name: string | null; student_created_at: string | null;
  reading_id: string | null; current_page: number | null; feeling: string | null; book_title: string | null; last_checkin_at: string | null; selected_at: string | null; recent_feelings: string[] | null;
};
type Acknowledgement = { classroom_id: string; student_id: string; concern_type: ConcernType; evidence_at: string };
type AbandonedBookRow = { classroom_id: string; student_id: string; title: string; current_page: number; switched_at: string | null };
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;
const concernLabels: Record<ConcernType, string> = { NO_BOOK: 'No book chosen', MAY_NEED_HELP: 'May need help', CHECKIN_OVERDUE: 'Check-in overdue' };

function isAcknowledged(action: Acknowledgement | undefined, evidenceAt: string) {
  return !!action && new Date(action.evidence_at).getTime() >= new Date(evidenceAt).getTime();
}

export async function loadTeacherClassrooms(teacherId: string, analyticsByStudent: Map<string, StudentSummary['analytics']>) {
  const [rows, actions, abandonedRows] = await Promise.all([
    query<DashboardRow>(`SELECT c.id AS classroom_id, c.name AS classroom_name, c.code AS classroom_code, s.id AS student_id, s.display_name AS student_name, s.created_at AS student_created_at, sb.id AS reading_id, sb.current_page, sb.feeling, sb.last_checkin_at, sb.selected_at, b.title AS book_title, ARRAY(SELECT rc.feeling FROM reading_checkins rc WHERE rc.student_book_id = sb.id ORDER BY rc.created_at DESC LIMIT 3) AS recent_feelings FROM classrooms c LEFT JOIN classroom_memberships m ON m.classroom_id = c.id AND m.active LEFT JOIN students s ON s.id = m.student_id LEFT JOIN LATERAL (SELECT * FROM student_books WHERE student_id = s.id AND status = 'ACTIVE' ORDER BY selected_at DESC LIMIT 1) sb ON true LEFT JOIN books b ON b.id = sb.book_id WHERE c.teacher_id = $1 AND c.archived_at IS NULL ORDER BY c.created_at, s.display_name`, [teacherId]),
    query<Acknowledgement>('SELECT classroom_id, student_id, concern_type, evidence_at FROM teacher_student_concern_actions WHERE teacher_id=$1', [teacherId]),
    query<AbandonedBookRow>(`SELECT m.classroom_id, sb.student_id, b.title, sb.current_page, sb.switched_at FROM student_books sb JOIN classroom_memberships m ON m.student_id = sb.student_id AND m.active JOIN classrooms c ON c.id = m.classroom_id AND c.archived_at IS NULL JOIN books b ON b.id = sb.book_id WHERE c.teacher_id = $1 AND sb.status = 'SWITCHED' ORDER BY sb.switched_at DESC NULLS LAST, sb.selected_at DESC`, [teacherId]),
  ]);
  const actionsByKey = new Map(actions.map((action) => [`${action.classroom_id}:${action.student_id}:${action.concern_type}`, action]));
  const classrooms = new Map<string, ClassroomSummary>();
  for (const row of rows) {
    if (!classrooms.has(row.classroom_id)) classrooms.set(row.classroom_id, { id: row.classroom_id, name: row.classroom_name, code: row.classroom_code, students: [] });
    if (!row.student_id || !row.student_name || !row.student_created_at) continue;
    const reading = row.reading_id && row.book_title && row.selected_at ? { currentPage: row.current_page ?? 0, feeling: row.feeling, lastCheckinAt: row.last_checkin_at, selectedAt: row.selected_at, book: { title: row.book_title } } : null;
    const rawConcerns: Array<{ type: ConcernType; evidenceAt: string }> = [];
    if (!reading) rawConcerns.push({ type: 'NO_BOOK', evidenceAt: row.student_created_at });
    else {
      const lastActivity = reading.lastCheckinAt ?? reading.selectedAt;
      if (new Date(lastActivity).getTime() <= Date.now() - DAYS_7) rawConcerns.push({ type: 'CHECKIN_OVERDUE', evidenceAt: lastActivity });
      if (reading.feeling === 'GETTING_HARD' || (row.recent_feelings?.length === 3 && row.recent_feelings.every((feeling) => feeling === 'UNSURE'))) rawConcerns.push({ type: 'MAY_NEED_HELP', evidenceAt: reading.lastCheckinAt ?? reading.selectedAt });
    }
    classrooms.get(row.classroom_id)?.students.push({ id: row.student_id, name: row.student_name, reading, abandonedBooks: [], analytics: analyticsByStudent.get(row.student_id) ?? { eventCount: 0, lastEventAt: null, helpRequests: 0, gettingHardCheckins: 0 }, concerns: rawConcerns.map((concern) => ({ ...concern, label: concernLabels[concern.type], acknowledged: isAcknowledged(actionsByKey.get(`${row.classroom_id}:${row.student_id}:${concern.type}`), concern.evidenceAt) })) });
  }
  const studentsByKey = new Map([...classrooms.values()].flatMap((classroom) => classroom.students.map((student) => [`${classroom.id}:${student.id}`, student])));
  for (const book of abandonedRows) studentsByKey.get(`${book.classroom_id}:${book.student_id}`)?.abandonedBooks.push({ title: book.title, currentPage: book.current_page, switchedAt: book.switched_at });
  return [...classrooms.values()];
}
