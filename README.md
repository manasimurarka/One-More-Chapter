# One More Chapter

One More Chapter is a reading companion for students in grades 3–5 and the teachers who support them. Its goal is simple: help children find books they want to keep reading, record how reading is going, and give teachers useful signals when a student may need encouragement.

## What it does

**For students**

- Answers a few story-preference questions to get personalized book suggestions.
- Chooses a book and checks in with their current page and how reading feels.
- Can ask for a helpful clue when a passage is confusing.

**For teachers**

- Creates and manages classrooms and student access.
- Sees reading progress and recent check-ins.
- Uses a live dashboard to spot students who may need support. These signals guide conversation; they are not a measure of reading ability.

## Tech stack

| Technology | Why it is used |
| --- | --- |
| Next.js, React, and TypeScript | Builds the student and teacher web experience, plus its server-side API routes, with safer and easier-to-maintain code. |
| PostgreSQL | Stores the application’s core data: users, classrooms, books, reading progress, and check-ins. |
| ClickHouse Cloud | Stores high-volume reading events and powers the live teacher analytics. |
| OpenAI | Matches book suggestions to a student’s preferences and provides age-appropriate reading-help prompts. |
| Vercel | Hosts the Next.js application in an environment designed for this project’s server-side routes. |

## Project structure

```text
Frontend/  Next.js web app and API routes
Backend/   Shared database, analytics, and recommendation code
```

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to an environment file and add your database, ClickHouse, OpenAI, and session-secret values. Keep real credentials out of Git.

3. Set up the data services:

   ```sh
   npm run db:setup
   npm run analytics:setup
   ```

4. Start the app:

   ```sh
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

Optional checks:

```sh
npm run db:health
npm run analytics:health
```

## Helpful commands

```sh
npm run build            # Create a production build
npm run db:seed          # Add demo data
npm run catalog:import   # Import books into the catalog
```

## Environment variables

The full list, including examples, is in [`.env.example`](.env.example). The essentials are `DATABASE_URL`, ClickHouse credentials, `OPENAI_API_KEY`, `SESSION_SECRET`, and `PIN_LOOKUP_SECRET`.
