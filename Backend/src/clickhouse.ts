import 'dotenv/config';
import { createClient } from '@clickhouse/client';
import { randomUUID } from 'node:crypto';

function requiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value || value.includes('REPLACE')) throw new Error(`${key} is not configured`);
  return value;
}

export type ReadingEventName = 'recommendation_shown' | 'recommendation_selected' | 'reading_checkin' | 'reading_feeling_selected' | 'help_requested' | 'book_switched' | 'book_finished';

export interface ReadingEventInput {
  eventName: ReadingEventName;
  studentId: string;
  classroomId: string;
  teacherId: string;
  bookId?: string | null;
  recommendationBatchId?: string | null;
  pageNumber?: number | null;
  feeling?: string | null;
  frictionType?: string | null;
  properties?: Record<string, unknown>;
}

let sharedClient: ReturnType<typeof createClient> | undefined;

export function clickhouse() {
  sharedClient ??= createClient({ url: requiredEnv('CLICKHOUSE_URL'), username: requiredEnv('CLICKHOUSE_USERNAME'), password: requiredEnv('CLICKHOUSE_PASSWORD'), database: requiredEnv('CLICKHOUSE_DATABASE'), application: 'one-more-chapter' });
  return sharedClient;
}

export async function closeClickhouse() {
  await sharedClient?.close();
  sharedClient = undefined;
}

export async function clickhouseHealthcheck() {
  return (await clickhouse().ping({ select: true })).success;
}

export async function emitEvent(input: ReadingEventInput) {
  try {
    const client = clickhouse();
    await client.insert({ table: 'reading_events', format: 'JSONEachRow', values: [{ event_id: randomUUID(), occurred_at: new Date().toISOString(), event_name: input.eventName, student_id: input.studentId, classroom_id: input.classroomId, teacher_id: input.teacherId, book_id: input.bookId ?? null, recommendation_batch_id: input.recommendationBatchId ?? null, page_number: input.pageNumber ?? null, feeling: input.feeling ?? null, friction_type: input.frictionType ?? null, properties: input.properties ?? {} }] });
  } catch (error) {
    console.error('analytics_event_failed', { eventName: input.eventName, studentId: input.studentId, error: error instanceof Error ? error.message : String(error) });
  }
}

export interface StudentAnalytics {
  studentId: string;
  eventCount: number;
  lastEventAt: string | null;
  helpRequests: number;
  gettingHardCheckins: number;
}

export const classroomAnalyticsRanges = ['7d', '14d', '30d', '3mo', 'all'] as const;
export type ClassroomAnalyticsRange = (typeof classroomAnalyticsRanges)[number];
export type AnalyticsBucket = { bucket: string; eventCount: number; checkinCount: number };
export type FeelingAnalytics = { feeling: string; count: number; percentage: number };
export type StudentSupportAnalytics = { studentId: string; lastEventAt: string | null; checkinCount: number; gettingHardCheckins: number; helpRequests: number };
export type ClassroomAnalytics = {
  range: ClassroomAnalyticsRange;
  generatedAt: string;
  metrics: { activeReaders: number; checkinCount: number; gettingHardCheckins: number; helpRequests: number; eventCount: number };
  trend: AnalyticsBucket[];
  feelings: FeelingAnalytics[];
  students: StudentSupportAnalytics[];
};

const rangeConfig: Record<ClassroomAnalyticsRange, { days?: number; bucket: 'day' | 'week' | 'month' }> = {
  '7d': { days: 7, bucket: 'day' },
  '14d': { days: 14, bucket: 'day' },
  '30d': { days: 30, bucket: 'day' },
  '3mo': { days: 90, bucket: 'week' },
  all: { bucket: 'month' },
};

export function validClassroomAnalyticsRange(value: string | null): ClassroomAnalyticsRange {
  return classroomAnalyticsRanges.includes(value as ClassroomAnalyticsRange) ? value as ClassroomAnalyticsRange : '7d';
}

export async function classroomAnalytics(classroomId: string, range: ClassroomAnalyticsRange): Promise<ClassroomAnalytics> {
  const config = rangeConfig[range];
  const from = config.days ? new Date(Date.now() - config.days * 24 * 60 * 60 * 1000).toISOString() : null;
  const where = `classroom_id = {classroomId:UUID}${from ? ' AND occurred_at >= {from:DateTime64(3)}' : ''}`;
  const params = from ? { classroomId, from } : { classroomId };
  const bucket = config.bucket === 'day' ? 'toStartOfDay(occurred_at)' : config.bucket === 'week' ? 'toStartOfWeek(occurred_at, 1)' : 'toStartOfMonth(occurred_at)';
  const client = clickhouse();
  const [summaryResult, trendResult, feelingResult, studentResult] = await Promise.all([
    client.query({ query: `SELECT uniqExact(student_id) AS activeReaders, countIf(event_name = 'reading_checkin') AS checkinCount, countIf(event_name = 'reading_checkin' AND feeling = 'GETTING_HARD') AS gettingHardCheckins, countIf(event_name = 'help_requested') AS helpRequests, count() AS eventCount FROM reading_events WHERE ${where}`, query_params: params, format: 'JSONEachRow' }),
    client.query({ query: `SELECT toString(${bucket}) AS bucket, count() AS eventCount, countIf(event_name = 'reading_checkin') AS checkinCount FROM reading_events WHERE ${where} GROUP BY bucket ORDER BY bucket`, query_params: params, format: 'JSONEachRow' }),
    client.query({ query: `SELECT feeling, count() AS count FROM reading_events WHERE ${where} AND event_name = 'reading_checkin' AND feeling IS NOT NULL GROUP BY feeling`, query_params: params, format: 'JSONEachRow' }),
    client.query({ query: `SELECT student_id AS studentId, max(occurred_at) AS lastEventAt, countIf(event_name = 'reading_checkin') AS checkinCount, countIf(event_name = 'reading_checkin' AND feeling = 'GETTING_HARD') AS gettingHardCheckins, countIf(event_name = 'help_requested') AS helpRequests FROM reading_events WHERE ${where} GROUP BY student_id ORDER BY gettingHardCheckins DESC, helpRequests DESC, lastEventAt DESC`, query_params: params, format: 'JSONEachRow' }),
  ]);
  const [summary] = await summaryResult.json<Record<string, string | number>>();
  const trendRows = await trendResult.json<Record<string, string | number>>();
  const feelingRows = await feelingResult.json<Record<string, string | number>>();
  const studentRows = await studentResult.json<Record<string, string | number | null>>();
  const checkinCount = Number(summary?.checkinCount ?? 0);
  const feelingCounts = new Map(feelingRows.map((row) => [String(row.feeling), Number(row.count)]));
  const feelingOrder = ['LOVING_IT', 'ENJOYING', 'UNSURE', 'GETTING_HARD'];
  return {
    range,
    generatedAt: new Date().toISOString(),
    metrics: { activeReaders: Number(summary?.activeReaders ?? 0), checkinCount, gettingHardCheckins: Number(summary?.gettingHardCheckins ?? 0), helpRequests: Number(summary?.helpRequests ?? 0), eventCount: Number(summary?.eventCount ?? 0) },
    trend: trendRows.map((row) => ({ bucket: String(row.bucket), eventCount: Number(row.eventCount), checkinCount: Number(row.checkinCount) })),
    feelings: feelingOrder.map((feeling) => { const count = feelingCounts.get(feeling) ?? 0; return { feeling, count, percentage: checkinCount ? Math.round((count / checkinCount) * 100) : 0 }; }),
    students: studentRows.map((row) => ({ studentId: String(row.studentId), lastEventAt: row.lastEventAt ? String(row.lastEventAt) : null, checkinCount: Number(row.checkinCount), gettingHardCheckins: Number(row.gettingHardCheckins), helpRequests: Number(row.helpRequests) })),
  };
}

export async function analyticsForTeacher(teacherId: string): Promise<StudentAnalytics[]> {
  const client = clickhouse();
  const result = await client.query({
    query: "SELECT student_id AS studentId, count() AS eventCount, max(occurred_at) AS lastEventAt, countIf(event_name = 'help_requested') AS helpRequests, countIf(event_name = 'reading_checkin' AND feeling = 'GETTING_HARD') AS gettingHardCheckins FROM reading_events WHERE teacher_id = {teacherId:UUID} GROUP BY student_id",
    query_params: { teacherId },
    format: 'JSONEachRow',
  });
  return await result.json<StudentAnalytics>();
}
