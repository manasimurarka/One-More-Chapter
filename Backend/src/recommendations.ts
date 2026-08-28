import { createHash } from 'node:crypto';
import OpenAI from 'openai';

export const storyDimensions = ['genre', 'world', 'hero', 'tone', 'hook', 'avoid'] as const;
export const storyQuestionnaireVersion = 2;
export const storyChoiceOptions = [
  { title: 'The Locker Secret', primaryTag: 'mystery', tags: ['mystery', 'suspense', 'clues', 'curiosity', 'school setting', 'secret discovery'] },
  { title: 'The Map in the Backpack', primaryTag: 'adventure', tags: ['adventure', 'exploration', 'action', 'friendship', 'discovery', 'outdoors', 'treasure hunt'] },
  { title: 'The Dragon in Class', primaryTag: 'humor', tags: ['humor', 'fantasy', 'magic', 'chaos', 'lighthearted', 'school setting', 'friendship'] },
] as const;
export const storyTagVocabulary = [
  'adventure', 'mystery', 'school humor', 'survival', 'magical', 'real world', 'space/future', 'creepy mystery',
  'brave hero', 'friend group', 'animal friend', 'different point of view', 'funny', 'fast', 'mysterious', 'meaningful',
  'cliffhangers', 'characters', 'world-building', 'laughs', 'hard words', 'slow start', 'too many characters', 'no connection',
  'suspense', 'clues', 'curiosity', 'school setting', 'secret discovery', 'exploration', 'action', 'friendship', 'discovery',
  'outdoors', 'treasure hunt', 'humor', 'fantasy', 'magic', 'chaos', 'lighthearted',
] as const;

export type StoryDna = Record<(typeof storyDimensions)[number], string> & {
  questionnaireVersion?: number;
  storyChoice?: string;
  storyTags?: string[];
};

export function isValidStoryAnswers(answers: unknown): answers is string[] {
  return Array.isArray(answers)
    && answers.length === storyDimensions.length
    && /^[0-2]$/.test(String(answers[0]))
    && answers.slice(1).every(answer => /^[0-3]$/.test(String(answer)));
}

export function isCurrentStoryProfile(dna: unknown): dna is StoryDna {
  return typeof dna === 'object' && dna !== null && (dna as StoryDna).questionnaireVersion === storyQuestionnaireVersion;
}

export function embeddingModel() { return process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'; }
export function taggingModel() { return process.env.OPENAI_TAGGING_MODEL || 'gpt-5-mini'; }
export function textHash(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function vectorLiteral(vector: number[]) { return `[${vector.join(',')}]`; }

function configuredOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.includes('REPLACE')) throw new Error('OPENAI_API_KEY is required for catalog embeddings and tags.');
  return new OpenAI({ apiKey });
}

export function bookEmbeddingText(book: { title: string; authors: string[]; description?: string | null; categories?: string[]; tags?: string[] }) {
  return [
    `Title: ${book.title}`,
    `Author: ${book.authors.join(', ')}`,
    `Description: ${book.description || ''}`,
    `Categories: ${(book.categories || []).join(', ')}`,
    `Story attributes: ${(book.tags || []).join(', ')}`,
    'Audience: children in grades 3 to 5, ages 8 to 11.',
  ].join('\n');
}

export function studentPreferenceText(dna: StoryDna, favorite?: string | null) {
  const storyTags = dna.storyTags?.join(', ') || dna.genre;
  return [
    'Recommend a physical book for a child in grades 3 to 5.',
    dna.storyChoice ? `They most want to jump into ${dna.storyChoice}: ${storyTags}.` : `They want a ${dna.genre} story in a ${dna.world} setting.`,
    `They want a ${dna.genre} story in a ${dna.world} setting.`,
    `They like a ${dna.hero} lead, a ${dna.tone} tone, and ${dna.hook}.`,
    favorite ? `They also enjoy: ${favorite}.` : '',
    dna.avoid ? `They would rather avoid: ${dna.avoid}.` : '',
  ].filter(Boolean).join(' ');
}

export async function createEmbeddings(texts: string[]) {
  if (!texts.length) return [] as number[][];
  const client = configuredOpenAI();
  const response = await client.embeddings.create({ model: embeddingModel(), input: texts, encoding_format: 'float' });
  const vectors = response.data.sort((a, b) => a.index - b.index).map(item => item.embedding);
  if (vectors.some(vector => vector.length !== 1536)) throw new Error(`Expected 1536-dimensional embeddings from ${embeddingModel()}.`);
  return vectors;
}

export async function classifyBookTags(input: { title: string; authors: string[]; description: string; categories: string[] }) {
  const client = configuredOpenAI();
  const response = await client.responses.create({
    model: taggingModel(),
    store: false,
    instructions: `Classify the supplied children's-book metadata. Return JSON only: {"tags":[...]}. Tags must be zero or more exact values from this list: ${storyTagVocabulary.join(', ')}. Only select tags clearly supported by title, synopsis, or categories. Do not infer reading level, safety, or facts not supplied.`,
    input: `Title: ${input.title}\nAuthor: ${input.authors.join(', ')}\nCategories: ${input.categories.join(', ')}\nDescription: ${input.description}`,
    max_output_tokens: 180,
  });
  try {
    const raw = response.output_text.trim();
    const json = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(json) as { tags?: unknown };
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === 'string' && (storyTagVocabulary as readonly string[]).includes(tag)) : [];
    return [...new Set(tags)];
  } catch {
    // A tag is a transparent ranking boost, not suitability evidence. Keep a
    // verified title usable when a provider returns malformed structured text;
    // its description embedding still drives semantic matching.
    return [];
  }
}

export function normalizedTagScore(tags: unknown, dna: StoryDna) {
  const available = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const desired = [...new Set([...(dna.storyTags || []), dna.genre, dna.world, dna.hero, dna.tone, dna.hook].filter(Boolean).map(value => value.toLowerCase()))];
  if (!desired.length) return 0;
  return available.reduce((score, tag) => score + (desired.includes(tag.toLowerCase()) ? 1 : 0), 0) / desired.length;
}

export function recommendationReason(tags: unknown, dna: StoryDna) {
  const available = Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const desired = [...new Set([...(dna.storyTags || []), dna.genre, dna.world, dna.hero, dna.tone, dna.hook].filter(Boolean))];
  const matched = desired.filter(value => available.some(tag => tag.toLowerCase() === value.toLowerCase()));
  if (matched.length >= 2) return `This looks like a ${matched[0]} story with ${matched[1]}—two things you said you enjoy.`;
  if (matched.length === 1) return `This story has ${matched[0]}, one of the things you said you enjoy.`;
  return `This story's description sounds like a strong match for your Story DNA.`;
}
