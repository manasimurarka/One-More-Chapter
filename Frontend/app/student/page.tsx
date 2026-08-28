'use client';

import Image, { type StaticImageData } from 'next/image';
import { useEffect, useState } from 'react';
import optionA from '../../assets/Q1/OptionA.png';
import optionB from '../../assets/Q1/OptionB.png';
import optionC from '../../assets/Q1/OptionC.png';
import { BrandLogo } from '../brand-logo';

type Reading = { title: string; currentPage: number; pageCount: number | null; feeling: string | null; lastCheckinAt: string | null };
type Abandoned = { title: string; currentPage: number; switchedAt: string | null };
type Me = { student: { name: string }; classroom: { name: string }; profile: { summary: string } | null; reading: Reading | null; abandonedBooks: Abandoned[] };
type Book = { id: string; reason: string; book: { id: string; title: string; authors: string[] } };
type Mode = 'loading' | 'login' | 'story-dna' | 'books' | 'read';

const storyQuestions = [
  { prompt: 'Which story would you most like to jump into?', choices: [{ label: 'The Locker Secret', image: optionA }, { label: 'The Map in the Backpack', image: optionB }, { label: 'The Dragon in Class', image: optionC }] },
  { prompt: 'Where should your next story take place?', choices: [{ label: 'A magical world' }, { label: 'The real world' }, { label: 'Space or the future' }, { label: 'A creepy mystery' }] },
  { prompt: 'Who would you like to follow?', choices: [{ label: 'A brave hero' }, { label: 'A friend group' }, { label: 'An animal friend' }, { label: 'Someone with a different point of view' }] },
  { prompt: 'What kind of feeling do you want?', choices: [{ label: 'Funny' }, { label: 'Fast' }, { label: 'Mysterious' }, { label: 'Meaningful' }] },
  { prompt: 'What keeps you turning pages?', choices: [{ label: 'Cliffhangers' }, { label: 'Great characters' }, { label: 'A new world to explore' }, { label: 'Lots of laughs' }] },
  { prompt: 'What can make a book harder to enjoy?', choices: [{ label: 'Hard words' }, { label: 'A slow start' }, { label: 'Too many characters' }, { label: 'Not connecting with the story' }] },
] as const;

const feelings = [['LOVING_IT', '😍 Loving it'], ['ENJOYING', '😊 Still enjoying it'], ['UNSURE', '🤔 Not sure yet'], ['GETTING_HARD', '🧩 Getting hard']];

async function api(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Something went wrong.');
  return data;
}

function History({ books }: { books: Abandoned[] }) {
  return books.length ? <section className="card" style={{ marginTop: 16 }}><p className="eyebrow">Books you’ve set aside</p>{books.map(book => <p className="muted" key={`${book.title}-${book.switchedAt ?? 'unknown'}`}><strong>{book.title}</strong> · last page {book.currentPage} · switched {book.switchedAt ? new Date(book.switchedAt).toLocaleDateString() : 'date unavailable'}</p>)}</section> : null;
}

function StoryChoice({ label, image, selected, onSelect }: { label: string; image?: StaticImageData; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`story-choice${selected ? ' selected' : ''}`} aria-label={label} aria-pressed={selected} onClick={onSelect}>
    {image && <Image src={image} alt="" sizes="(max-width: 650px) 100vw, 33vw" />}
    {!image && <span>{label}</span>}
  </button>;
}

export default function Student() {
  const [mode, setMode] = useState<Mode>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [code, setCode] = useState('CHAPTER');
  const [pin, setPin] = useState('2468');
  const [answers, setAnswers] = useState<string[]>([]);
  const [favorite, setFavorite] = useState('');
  const [page, setPage] = useState('');
  const [feeling, setFeeling] = useState('LOVING_IT');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [savingStory, setSavingStory] = useState(false);
  const [passage, setPassage] = useState('');
  const [help, setHelp] = useState<{ explanation: string; question: string; strategy: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const storyComplete = storyQuestions.every((_, index) => answers[index] !== undefined);
  const oneMinuteHasPassed = me?.reading?.lastCheckinAt && now - new Date(me.reading.lastCheckinAt).getTime() >= 60_000;
  const lowerPageBlocked = Boolean(oneMinuteHasPassed && page !== '' && Number.isInteger(Number(page)) && Number(page) < (me?.reading?.currentPage ?? 0));

  const recommendations = async () => {
    const data = await api('/api/student/recommendations');
    setBooks(data.items);
  };

  const refresh = async (withBooks = false) => {
    try {
      const current = await api('/api/student/me') as Me;
      setMe(current);
      if (!current.profile) {
        setMode('story-dna');
        return;
      }
      if (withBooks) await recommendations();
      setMode(current.reading ? 'read' : 'books');
    } catch {
      setMe(null);
      setMode('login');
    }
  };

  useEffect(() => { void refresh(true); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const setAnswer = (questionIndex: number, answerIndex: number) => {
    setAnswers(current => {
      const next = [...current];
      next[questionIndex] = String(answerIndex);
      return next;
    });
    setError('');
  };

  const login = async () => {
    try {
      setError('');
      await api('/api/auth/student', 'POST', { code, pin });
      await refresh(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not sign in.'); }
  };

  const saveStoryDna = async () => {
    if (!storyComplete) {
      setError('Choose one answer for each question before finding your books.');
      return;
    }
    try {
      setSavingStory(true);
      setError('');
      await api('/api/student/story', 'POST', { answers, favorite });
      await refresh(true);
      setMessage('Your Story DNA is ready! Here are some books picked for you.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save your Story DNA.'); } finally { setSavingStory(false); }
  };

  const select = async (item: Book) => {
    try {
      await api('/api/student/reading', 'POST', { action: 'select', bookId: item.book.id });
      await refresh();
      setMessage(`Great choice — ${item.book.title} is your current book.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not choose that book.'); }
  };

  const checkin = async () => {
    try {
      await api('/api/student/reading', 'POST', { page, feeling });
      setPage('');
      await refresh();
      setMessage('Check-in saved. Your teacher can now celebrate your progress!');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save check-in.'); }
  };

  const getHelp = async () => {
    try {
      setError('');
      setHelp(await api('/api/student/help', 'POST', { passage }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not get a clue.'); }
  };

  const switchBook = async () => {
    if (!confirm('Choose a different book? Your current book will be set aside only after you pick the next one.')) return;
    try {
      await recommendations();
      setMode('books');
      setMessage('Pick the story you want to read next.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load book choices.'); }
  };

  const signout = async () => {
    await api('/api/auth/signout', 'POST');
    setMe(null);
    setAnswers([]);
    setFavorite('');
    setMessage('');
    setError('');
    setMode('login');
  };

  if (mode === 'loading') return <main className="student-page"><div className="shell loading">Opening your reading nook…</div></main>;

  return <main className="student-page"><div className="shell">
    <header className="topbar"><BrandLogo subtitle="Student reading nook" />{me && <div className="top-actions"><span className="chip">{me.classroom.name}</span><button className="btn ghost" onClick={signout}>Sign out</button></div>}</header>
    {error && <p className="notice" role="alert">{error}</p>}
    {message && <p className="chip good">✓ {message}</p>}
    {me && <section className="card" style={{ marginTop: 18 }}><div className="identity"><div className="avatar">{me.student.name[0]}</div><div><p className="eyebrow">Your reading space</p><h1 style={{ margin: '4px 0' }}>Hi, {me.student.name}!</h1><p className="muted" style={{ margin: 0 }}>You’re reading with {me.classroom.name}.</p></div></div></section>}
    {mode === 'login' && <section className="card" style={{ maxWidth: 540, margin: '44px auto' }}><p className="eyebrow">Welcome back, reader</p><h1>Let’s find your next chapter.</h1><label>Classroom code<input value={code} onChange={event => setCode(event.target.value)} autoComplete="username" /></label><label>Your secret PIN<input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event => setPin(event.target.value)} autoComplete="current-password" /></label><button className="btn" onClick={login}>Start reading →</button></section>}
    {me && mode === 'story-dna' && <section className="card story-dna-card" style={{ maxWidth: 940, margin: '24px auto' }}><p className="eyebrow">Your Story DNA</p><h1>Tell us what kinds of stories you enjoy.</h1><p className="muted">Answer these quick questions so we can find books that feel like a great match for you.</p>{storyQuestions.map((question, questionIndex) => <fieldset className="story-question" key={question.prompt}><legend>{questionIndex + 1}. {question.prompt}</legend><div className={questionIndex === 0 ? 'story-choice-grid' : 'grid'}>{question.choices.map((choice, answerIndex) => <StoryChoice key={choice.label} label={choice.label} image={'image' in choice ? choice.image : undefined} selected={answers[questionIndex] === String(answerIndex)} onSelect={() => setAnswer(questionIndex, answerIndex)} />)}</div></fieldset>)}<label>Is there a book you already love? <span className="muted">(optional)</span><input value={favorite} onChange={event => setFavorite(event.target.value)} maxLength={120} placeholder="Tell us its title" /></label>{!storyComplete && <p className="muted">Choose one answer for each question to unlock your book matches.</p>}<button className="btn" disabled={savingStory || !storyComplete} onClick={saveStoryDna}>{savingStory ? 'Finding your books…' : 'Find my books →'}</button></section>}
    {me && mode === 'books' && <><section className="card" style={{ marginTop: 18 }}><p className="eyebrow">Your Story DNA</p><h2>{me.profile?.summary}</h2>{me.reading && <button className="btn alt" onClick={() => setMode('read')}>Keep reading →</button>}</section><h2 className="section-title">Three stories picked for you</h2><div className="grid">{books.map(item => <article className="card book-card" key={item.id}><div className="book-cover">📖</div><h2>{item.book.title}</h2><p className="muted">{item.book.authors.join(', ')}</p><p>{item.reason}</p><button className="btn" onClick={() => select(item)}>I’ll read this!</button></article>)}</div><History books={me.abandonedBooks} /></>}
    {me && mode === 'read' && me.reading && <><section className="card reading-card" style={{ marginTop: 18 }}><p className="eyebrow">Currently reading</p><h2>{me.reading.title}</h2>{me.reading.pageCount ? <><div className="progress"><span style={{ width: `${Math.min(100, Math.round(me.reading.currentPage / me.reading.pageCount * 100))}%` }} /></div><p>Page {me.reading.currentPage} of {me.reading.pageCount}</p></> : <p>Last saved page: {me.reading.currentPage || 'not yet checked in'}</p>}<button className="btn ghost" onClick={switchBook}>Choose a different book</button></section><section className="card" style={{ marginTop: 16 }}><h2>Where did you stop today?</h2><label>Page number<input type="number" min="0" value={page} onChange={event => setPage(event.target.value)} placeholder="For example, 42" /></label>{lowerPageBlocked && <p className="notice" role="alert">Your last check-in was page {me.reading.currentPage}. More than one minute has passed, so enter that page or a higher page.</p>}<h3>How is this book feeling?</h3><div className="grid feeling-grid">{feelings.map(([value, label]) => <button key={value} className={`choice ${feeling === value ? 'selected' : ''}`} onClick={() => setFeeling(value)}>{label}</button>)}</div><p><button className="btn" disabled={!page || lowerPageBlocked} onClick={checkin}>Save my check-in</button></p></section><section className="card" style={{ marginTop: 16 }}><p className="eyebrow">Need a clue?</p><h2>Let’s get unstuck together.</h2><p className="muted">Share a short confusing part. We’ll give you a clue to help you keep reading — never the answer.</p><label>A short passage<textarea value={passage} onChange={event => setPassage(event.target.value)} minLength={10} maxLength={600} placeholder="Type 1–3 confusing sentences here" /></label><button className="btn alt" disabled={passage.trim().length < 10} onClick={getHelp}>Give me a clue</button>{help && <div className="card" style={{ marginTop: 16, background: '#fff7df' }}><p><strong>A clue:</strong> {help.explanation}</p><p><strong>Think about:</strong> {help.question}</p><p><strong>Try this:</strong> {help.strategy}</p></div>}</section><History books={me.abandonedBooks} /></>}
  </div></main>;
}
