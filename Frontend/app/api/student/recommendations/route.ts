import { createEmbeddings, normalizedTagScore, query, recommendationReason, sessionFromToken, studentPreferenceText, vectorLiteral } from '@one-more-chapter/backend';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
type BookRow = { id:string; title:string; authors:string[]; description:string|null; cover_url:string|null; isbns:string[]; page_count:number|null; categories:string[]; tags:unknown; min_age:number; age_rating_source:string; age_rating_url:string; semantic_score:number };
const parseJson = (value: unknown) => typeof value === 'string' ? JSON.parse(value) : value;

export async function GET() {
  const session = await sessionFromToken((await cookies()).get('omc_session')?.value);
  if (!session?.studentId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = (await query<{ dna: unknown; favorite: string | null }>('SELECT dna,favorite FROM student_story_profiles WHERE student_id=$1', [session.studentId]))[0];
  if (!profile) return Response.json({ error: 'Complete Story DNA first.' }, { status: 400 });
  const dna = parseJson(profile.dna) as Record<string, string>;
  const [preferenceEmbedding] = await createEmbeddings([studentPreferenceText(dna as any, profile.favorite)]);
  const candidates = await query<BookRow>(`SELECT id,title,authors,description,cover_url,isbns,page_count,categories,tags,min_age,age_rating_source,age_rating_url,
    1 - (embedding <=> $1::vector) AS semantic_score FROM books
    WHERE recommendable=true AND embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 50`, [vectorLiteral(preferenceEmbedding)]);
  const semanticValues = candidates.map(book => Number(book.semantic_score));
  const semanticMin = Math.min(...semanticValues); const semanticMax = Math.max(...semanticValues);
  const ranked = candidates.map(book => {
    const tags = parseJson(book.tags);
    const semantic = semanticMax === semanticMin ? 1 : (Number(book.semantic_score) - semanticMin) / (semanticMax - semanticMin);
    const tag = normalizedTagScore(tags, dna as any);
    return { ...book, tags, score: semantic * .7 + tag * .3, reason: recommendationReason(tags, dna as any) };
  }).sort((left, right) => right.score - left.score).slice(0, 3);
  if (ranked.length < 3) return Response.json({ error: 'The verified catalog needs at least three embedded books.' }, { status: 503 });
  const batch = (await query<{ id:string; created_at:string }>('INSERT INTO recommendation_batches(student_id) VALUES($1) RETURNING *', [session.studentId]))[0];
  const items = await Promise.all(ranked.map(async (book, index) => (await query<{ id:string }>('INSERT INTO recommendation_items(batch_id,book_id,rank,score,reason) VALUES($1,$2,$3,$4,$5) RETURNING *', [batch.id, book.id, index + 1, book.score, book.reason]))[0]));
  return Response.json({ ...batch, items: items.map((item, index) => ({ ...item, reason: ranked[index].reason, book: ranked[index] })) });
}
