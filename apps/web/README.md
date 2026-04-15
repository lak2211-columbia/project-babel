# AI Governance Observatory Web App

Analyst-facing Next.js application for browsing governance documents, comparing jurisdictions, and inspecting divergence across policy structure and risk framing.

## Current product surface

The deployed implementation now includes:

- Overview dashboard at `/`
- Database-backed observatory snapshot
- Jurisdiction scan for US, EU, Korea, Japan, and China
- Pairwise divergence table
- Documents explorer at `/documents`
- Document detail pages at `/documents/[documentId]`
- Jurisdiction analysis pages at `/jurisdictions/[slug]`

## Working against production

Pull the current Vercel production env and build against it:

```bash
make vercel-pull-prod
make build-prod
```

Replay the saved corpus into Neon:

```bash
make migrate-prod
make sync-prod-db
make persist-prod
```

Deploy the app:

```bash
make deploy-prod
```

## Local development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## File map

- `src/app/page.tsx` overview dashboard
- `src/lib/db.ts` Neon/Vercel runtime contract for deployed reads
- `src/app/layout.tsx` app metadata and shell
- `src/app/globals.css` global theme tokens

## Notes

- The deployed app should read from Neon, not the seed snapshot.
- Database read failures are now treated as hard failures in deployed Vercel runtimes so production cannot silently drift back to fallback data.
- The design is optimized for comparative analysis rather than a marketing landing page.

## Deployment

- The app is now linked to the Vercel project `babel-observatory`.
- Current production URL: `https://project-babel.com`
- Default Vercel production deployment URL: `https://babel-observatory-ngut9m7b0-heeyong-chungs-projects.vercel.app`
