# One-More-Chapter

A children's book rec system and progress tracker.

## Database setup

Set `DATABASE_URL`, the ClickHouse variables, and `POSTGRES_CA_CERT` in both local environment configuration and Vercel. `POSTGRES_CA_CERT` must contain only the current CA certificate from the ClickHouse Cloud PostgreSQL Connect screen; literal `\n` values are supported.

Provision databases explicitly during release setup:

```sh
npm run db:setup
npm run analytics:setup
```

Use `npm run db:health` and `npm run analytics:health` for read-only connection checks.
