# Vercel Launch Runbook

This runbook captures the fastest path from the current local repo to a public hosted deployment.

## Current state

- Vercel team: `heeyong-chungs-projects`
- Vercel project: `babel-observatory`
- Project ID: `prj_a5gCz3KW6rXMws8ziLN2biLiqvRP`
- Linked app directory: `apps/web`
- Production URL: `https://project-babel.com`
- Deployment inspector: `https://vercel.com/heeyong-chungs-projects/babel-observatory/HPA53E9hCFAyKePP2HYhonEceYBg`

The current production deployment is live on a custom domain and is reading from the hosted Neon Postgres instance.

## What is already done

1. Built the Next.js app in production mode locally.
2. Created the Vercel project.
3. Linked `apps/web` to the Vercel project.
4. Added `apps/web/vercel.json` to force the local Vercel builder to use the `nextjs` framework instead of `@vercel/static-build`.
5. Deployed the app to production and verified the public host returns `HTTP 200`.
6. Provisioned the Neon marketplace integration for the team.
7. Granted the Neon installation access to the `babel-observatory` project.
8. Pulled the production environment locally after the Neon connection was attached.
9. Ran the SQL migrations against Neon.
10. Replayed saved document analyses into Neon.
11. Verified the app API returns `Live database snapshot`.

## What is not done yet

Remaining work is optional hardening rather than launch-critical setup:

- add `www.project-babel.com` and redirect it to the apex if you want the conventional companion hostname
- add backups / budget alerts / routine refresh automation for the pipeline

## Current database path

The Vercel project now has the Neon-provided environment variables, including:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `PGHOST`
- `PGUSER`
- `PGDATABASE`
- `PGPASSWORD`

## Database cutover commands

After `DATABASE_URL` exists and points at the production Postgres instance:

### 1. Run migrations

```bash
cd /Users/heeyongchung/babel
DATABASE_URL='postgresql://...' make migrate
```

### 2. Replay saved analyses into Postgres

```bash
cd /Users/heeyongchung/babel/services/pipeline
. .venv/bin/activate
DATABASE_URL='postgresql://...' PYTHONPATH=src python -m observatory.cli persist-analysis-artifacts
```

### 3. Redeploy the app

```bash
cd /Users/heeyongchung/babel/apps/web
npx vercel deploy --prod --yes --scope heeyong-chungs-projects
```

## Recommended domain options

### Best balance of name quality and price

- `babelsignal.com` - $11.25/year
- `babelwatch.com` - $11.25/year
- `babelpolicy.com` - $11.25/year
- `projectbabelhq.com` - $11.25/year
- `babelpolicylab.com` - $11.25/year
- `babelpolicyhq.com` - $11.25/year
- `babelmonitor.com` - $11.25/year
- `babeltracker.com` - $11.25/year

### If you want closer to the current brand

- `project-babel.com` - $11.25/year
- `babelobservatory.com` - $11.25/year
- `projectbabel.app` - $14.99/year
- `projectbabel.co` - $17.99/year

## My recommendation

If you want a cleaner public-facing URL today, buy one of these:

1. `babelsignal.com`
2. `babelwatch.com`
3. `babelpolicy.com`
4. `projectbabelhq.com`

They are short, readable, and cheap. They also avoid the nonprofit or institutional feel of `.org`.

## Domain attach commands

After buying the domain in Vercel or adding it to the project:

```bash
cd /Users/heeyongchung/babel/apps/web
npx vercel domains add <your-domain> --scope heeyong-chungs-projects
```

If the domain is bought elsewhere, follow the DNS instructions from:

```bash
npx vercel domains inspect <your-domain> --scope heeyong-chungs-projects
```

## Current live state

1. Domain: `project-babel.com`
2. Web hosting: Vercel
3. Database: Neon Postgres through the Vercel integration
4. Migrations: applied
5. Data load: document and jurisdiction analysis rows present
6. App API: returns `Live database snapshot`
