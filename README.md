# PlaceGuard

“Don’t just trust the placement process. Verify it.” PlaceGuard is a React/Supabase placement-governance product with role-aware workflows and an append-only, tamper-evident audit trail.

## Architecture

- **Web:** React, Vite, React Router, responsive CSS.
- **Identity:** Supabase Auth with trusted `profiles` lookup; frontend roles are never accepted.
- **Database:** PostgreSQL migrations in `supabase/migrations`; UUID constraints, workflow RPCs, indexes, and Row Level Security.
- **Integrity:** server/database-created SHA-256 hash chain (`audit_commits`) and `verify_audit_chain()`.
- **AI:** `supabase/functions/audit-summary` is server-only. It receives aggregate verified facts and has a deterministic fallback when `OPENAI_API_KEY` is absent.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment. Create a Supabase project, then apply migrations in chronological order and seed locally with `supabase/seed.sql`. The seed contains fictional accounts with the documented demo password and must not be used in production.

Deploy the edge function with the Supabase CLI and configure `OPENAI_API_KEY` only as an edge-function secret. `SUPABASE_SERVICE_ROLE_KEY` is supplied to edge functions by Supabase and must never be added to `.env` or Vercel.

## Commands

```bash
npm run lint
npm test
npm run build
```

## Security model

RLS scopes students to their records, companies to their drives, and staff to appropriate governance data. Final state changes are executed through security-definer functions that confirm `auth.uid()`, role, deadline, state, and separation of duties. Audit commits cannot be updated or deleted; a hash mismatch is reported by `verify_audit_chain()` as an integrity failure. This is an append-only and tamper-evident audit trail, not a blockchain.

## Deployment

Deploy `dist/` to Vercel with the two public `VITE_` variables. Configure the same Supabase URL’s auth redirect URLs for the Vercel domain. Apply migrations before deploying the frontend. No private secret is needed by Vercel for the current frontend.
