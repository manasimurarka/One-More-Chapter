import { db, query } from '../src/db';
import { GoogleBooksProvider } from '../src/books/providers';
import { bookEmbeddingText, classifyBookTags, createEmbeddings, embeddingModel, textHash, vectorLiteral } from '../src/recommendations';

type PreparedBook = {
  title: string; authors: string[]; description: string; coverUrl?: string; isbns: string[]; pageCount?: number; categories: string[];
  providerId: string; sourceUrl?: string; minAge: number; maxAge: number; maturityRating: string; ageRatingSource: string; ageRatingUrl: string; tags: string[]; embedding: number[];
};
type Counters = { skipped: number; duplicates: number; failed: number };
const provider = new GoogleBooksProvider();
const minimumCatalogSize = 100;
const targetCatalogSize = 500;
const dryRun = process.argv.includes('--dry-run');
const discoveryQueries = ['juvenile fiction', 'juvenile nonfiction', 'children adventure', 'children mystery', 'children fantasy', 'children humor', 'children animals', 'children school', 'children friendship', 'children science'];
const discoveryRequests = discoveryQueries.flatMap(query => [0, 40, 80, 120].map(startIndex => ({ query, startIndex })));

function normalise(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }
async function retry<T>(work: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await work(); } catch (error) { last = error; if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 1500 * attempt)); }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${String((last as Error)?.message || last)}`);
}
async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) results.push(...await Promise.all(items.slice(index, index + size).map(work)));
  return results;
}
async function prepareCatalog(counters: Counters) {
  const byIdentity = new Set<string>();
  const pages = await inBatches(discoveryRequests, 1, async request => {
    try {
      return await retry(() => provider.search(request.query, { childSafe: true, startIndex: request.startIndex }), `Google Books discovery for ${request.query} @ ${request.startIndex}`);
    } catch (error) { counters.failed++; console.warn(`Discovery query failed (${request.query} @ ${request.startIndex}): ${String((error as Error).message || error)}`); return []; }
  });
  const metadata = pages.flat().flatMap(book => {
    // The discovery request itself uses Google Books' maxAllowedMaturityRating
    // = not-mature filter. Some otherwise complete volume records omit the
    // response field, so only an explicit MATURE value is rejected here.
    const eligible = book.providerId && book.title && book.authors.length && book.description && book.categories.length && book.printType === 'BOOK' && (!book.language || book.language === 'en') && book.maturityRating !== 'MATURE';
    if (!eligible) { counters.skipped++; return []; }
    const identity = book.providerId || book.isbns[0] || `${normalise(book.title)}:${normalise(book.authors[0] || '')}`;
    if (byIdentity.has(identity)) { counters.duplicates++; return []; }
    byIdentity.add(identity);
    return [{ ...book, description: book.description!, minAge: 8, maxAge: 15, maturityRating: book.maturityRating || 'NOT_MATURE_FILTERED', ageRatingSource: 'Google Books maturity filter', ageRatingUrl: book.sourceUrl || `https://books.google.com/books?id=${book.providerId}` }];
  }).slice(0, targetCatalogSize);
  const taggable = metadata;
  const tagged = await inBatches(taggable, 4, async book => {
    try { return { ...book, tags: await classifyBookTags(book) }; }
    catch (error) { counters.failed++; console.warn(`Skipping ${book.title}: ${String((error as Error).message || error)}`); return null; }
  });
  const books = tagged.filter((book): book is NonNullable<typeof book> => Boolean(book));
  const embeddings = await inBatches(books.map(book => bookEmbeddingText(book)), 50, createEmbeddings);
  return books.map((book, index) => ({ ...book, embedding: embeddings[index] }));
}
async function replaceCatalog(books: PreparedBook[], counters: Counters, runId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM reading_checkins');
    await client.query('DELETE FROM student_books');
    await client.query('DELETE FROM recommendation_items');
    await client.query('DELETE FROM recommendation_batches');
    await client.query('DELETE FROM book_sources');
    await client.query('DELETE FROM books');
    for (const book of books) {
      const embeddingText = bookEmbeddingText(book);
      const inserted = await client.query<{ id: string }>(`INSERT INTO books(title,authors,description,cover_url,isbns,page_count,categories,tags,min_age,max_age,maturity_rating,age_rating_source,age_rating_url,recommendable,embedding,embedding_model,embedding_hash,metadata_updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14::vector,$15,$16,now()) RETURNING id`, [book.title, book.authors, book.description, book.coverUrl || null, book.isbns, book.pageCount || null, book.categories, JSON.stringify(book.tags), book.minAge, book.maxAge, book.maturityRating, book.ageRatingSource, book.ageRatingUrl, vectorLiteral(book.embedding), embeddingModel(), textHash(embeddingText)]);
      const bookId = inserted.rows[0].id;
      await client.query('INSERT INTO book_sources(book_id,provider,provider_id,source_url) VALUES($1,$2,$3,$4)', [bookId, 'GOOGLE_BOOKS', book.providerId, book.sourceUrl || null]);
    }
    await client.query(`UPDATE catalog_import_runs SET status='SUCCEEDED',completed_at=now(),imported_count=$1,skipped_count=$2,duplicate_count=$3,failed_count=$4,details=$5 WHERE id=$6`, [books.length, counters.skipped, counters.duplicates, counters.failed, JSON.stringify({ model: embeddingModel(), dryRun: false }), runId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
async function main() {
  const run = (await query<{ id: string }>('INSERT INTO catalog_import_runs(status,candidate_count) VALUES($1,$2) RETURNING id', ['RUNNING', discoveryRequests.length * 40]))[0];
  const counters: Counters = { skipped: 0, duplicates: 0, failed: 0 };
  try {
    const books = await prepareCatalog(counters);
    if (books.length < minimumCatalogSize) throw new Error(`Only ${books.length} titles qualified; at least ${minimumCatalogSize} are required. The current catalog was not changed.`);
    if (dryRun) {
      await query(`UPDATE catalog_import_runs SET status='SUCCEEDED',completed_at=now(),imported_count=$1,skipped_count=$2,duplicate_count=$3,failed_count=$4,details=$5 WHERE id=$6`, [books.length, counters.skipped, counters.duplicates, counters.failed, JSON.stringify({ model: embeddingModel(), dryRun: true }), run.id]);
      console.log(JSON.stringify({ dryRun: true, qualified: books.length, ...counters })); return;
    }
    await replaceCatalog(books, counters, run.id);
    console.log(JSON.stringify({ imported: books.length, ...counters }));
  } catch (error) {
    await query(`UPDATE catalog_import_runs SET status='FAILED',completed_at=now(),skipped_count=$1,duplicate_count=$2,failed_count=$3,details=$4 WHERE id=$5`, [counters.skipped, counters.duplicates, counters.failed, JSON.stringify({ error: String((error as Error).message || error), model: embeddingModel() }), run.id]);
    throw error;
  }
}
main().finally(() => db.end());
