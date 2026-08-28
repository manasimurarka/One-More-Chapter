import { db, query } from '../src/db';
import { bookEmbeddingText, classifyBookTags, createEmbeddings, embeddingModel, textHash, vectorLiteral } from '../src/recommendations';

type Book = { id: string; title: string; authors: string[]; description: string; categories: string[] };

async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += size) results.push(...await Promise.all(items.slice(index, index + size).map(work)));
  return results;
}

async function createEmbeddingsInBatches(texts: string[], size = 50) {
  const embeddings: number[][] = [];
  for (let index = 0; index < texts.length; index += size) embeddings.push(...await createEmbeddings(texts.slice(index, index + size)));
  return embeddings;
}

async function main() {
  const books = await query<Book>(`SELECT id,title,authors,description,categories FROM books WHERE recommendable=true AND description IS NOT NULL`);
  const prepared = (await inBatches(books, 4, async book => {
    try { return { ...book, tags: await classifyBookTags(book) }; }
    catch (error) { console.warn(`Skipped ${book.title}: ${String((error as Error).message || error)}`); return null; }
  })).filter((book): book is NonNullable<typeof book> => Boolean(book));
  const embeddings = await createEmbeddingsInBatches(prepared.map(book => bookEmbeddingText(book)));
  for (let index = 0; index < prepared.length; index += 10) {
    await Promise.all(prepared.slice(index, index + 10).map((book, offset) => query(
      `UPDATE books SET tags=$1::jsonb,embedding=$2::vector,embedding_model=$3,embedding_hash=$4,metadata_updated_at=now() WHERE id=$5`,
      [JSON.stringify(book.tags), vectorLiteral(embeddings[index + offset]), embeddingModel(), textHash(bookEmbeddingText(book)), book.id],
    )));
  }
  console.log(JSON.stringify({ retagged: prepared.length, skipped: books.length - prepared.length }));
}

main().finally(() => db.end());
