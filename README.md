# CSQBank — Contentsquare Demo Online Banking Site

This is a demo online banking site built to showcase [Contentsquare](https://contentsquare.com) analytics features including Session Replay, Zoning Analysis, Journey Analysis, and Form Analytics. It's a server-rendered Express + EJS app covering everyday banking (checking, savings, transfers, bill pay, person-to-person payments) plus a multi-step loan application and underwriting flow.  

---

## Quick Deploy to Vercel

This repo isn't pushed to a Git remote yet, so the fastest path today is the Vercel CLI — no GitHub setup required:

```
npm install -g vercel
vercel
```

Follow the prompts (link or create a project, accept the defaults — `vercel.json` is already set up). When it asks about environment variables, add `DATABASE_URL` (see below) — the app won't start without it.

> **Once this repo is pushed to GitHub**, you can swap in a one-click **Deploy with Vercel** button so anyone can clone straight to a new deployment:
> ```
> [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<your-org>/<your-repo>&env=DATABASE_URL,CSQ_TAG_ID&envDescription=Postgres%20connection%20string%20and%20Contentsquare%20Tag%20ID)
> ```
> Replace `<your-org>/<your-repo>` with the real path once it exists.

The database is Postgres (e.g. [Neon](https://neon.tech)) rather than a bundled file, so every serverless instance shares the same data — create a project with your provider, grab its connection string, and set it as `DATABASE_URL`. The schema is created automatically on first request (see `ensureSchema()` in `config/database.js`); run `npm run seed` once (locally, pointed at that same `DATABASE_URL`) to load the shared demo banking sandbox.

---

## Environment Variables

| Variable | Required? | Description |
|----------|-----------|--------------|
| `DATABASE_URL` | **Required** | Postgres connection string (Neon, Vercel Postgres, or any Postgres host). The schema auto-creates on first request; run `npm run seed` once to populate demo data. |
| `CSQ_TAG_ID` | Optional | Your Contentsquare tag ID — e.g. if your tag script is `12345645.js`, enter `12345645`. Without it, the site runs fine but the CSQ tag never loads (no tracking). |

Set these in Vercel under **Project Settings → Environment Variables**, or in a local `.env` file when running locally (copy `.env.example` to `.env`).

---

## Run Locally

### What you'll need

- [Node.js](https://nodejs.org) version 18 or higher
- A terminal application (Terminal on Mac, Command Prompt or PowerShell on Windows)

### Steps

1. **Install dependencies**
   ```
   npm install
   ```

2. **Set up your database**

   Create a Postgres database (e.g. a free [Neon](https://neon.tech) project), copy `.env.example` to `.env`, and set `DATABASE_URL` to its connection string.

3. **Seed the database**

   Creates the schema (if it doesn't exist yet) and loads the shared demo banking sandbox — checking/savings accounts, ~50 transactions each, bill pay payees, and friend pay contacts:
   ```
   npm run seed
   ```

4. **Start the app**
   ```
   npm run dev   # nodemon — auto-restarts on file changes (recommended for local dev)
   ```
   or
   ```
   npm start     # plain node, no auto-restart
   ```

5. Open your browser and go to **http://localhost:3000**. The admin panel is at **http://localhost:3000/admin**.

### Logging in

Login is deliberately frictionless — there's no real authentication:

- Enter **any email address** on the Log In or Open an Account form. A new email auto-provisions a persona on the spot; an existing one logs back into it.
- The password field is present for visual realism only — it's read and discarded, never checked or stored.
- This means you can demo Contentsquare's `identify()` call live with any email typed on the spot, without needing to remember or share credentials.

**Admin access** isn't reachable through the UI — every account is provisioned as `role = 'customer'`. To promote one for testing the admin dashboard and loan underwriting queue, flip it directly in the database, e.g. via `psql "$DATABASE_URL"`:
```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```
Because this is a real shared Postgres database (not a per-instance file), the promotion is immediately visible everywhere — including on Vercel, across every serverless instance.

---

## Project structure

```
heapBank2/
├── config/          # Postgres pool + schema (database.js)
├── lib/             # Domain logic: banking ops, loan state machine, demo data reset
├── middleware/      # Session auth (loadUser/requireLogin/requireAdmin) + view locals
├── public/          # Static assets (CSS, logo)
├── routes/          # Express route handlers (marketing, auth, banking, loans, admin/)
├── scripts/
│   └── seed.js      # Creates the schema (if needed) and seeds the shared demo banking sandbox
├── views/           # EJS templates
├── server.js        # Express app entry point
└── vercel.json      # Vercel deployment config
```

---

## Demo data model

- **Per-session banking overlay** — checking/savings balances, transactions, bill pay payees, and friend pay contacts are a shared, read-only seeded baseline (see `npm run seed`) plus whatever *this session itself* has added on top, tracked in the session cookie (`lib/banking.js`). Every session — a live demo login or an automated script — starts from the identical baseline; nothing one session adds is ever visible to any other session, so concurrent demos never interfere with each other.
- **Loan applications are the one per-identity, persisted entity** — each user's loan applications live in Postgres, belong to them, and survive both kinds of reset below.

### Resetting demo data

Three different resets exist, for three different situations:

| Action | Effect |
|--------|--------|
| `GET /demo/reset` | Clears just the current session (logs you out) — handy for typing a fresh email at `/login` without clearing cookies manually. |
| `POST /demo/reset-data` (the **Reset Demo Banking Data** link in the footer, any logged-in user) | Clears *your own session's* banking overlay back to the shared starting point. Doesn't touch the shared baseline or anyone else's session. |
| `POST /admin/reset-demo-data` (the **Reset Demo Data** button in `/admin`), or `npm run seed` | Re-seeds the shared, read-only banking baseline itself (accounts, transactions, payees, contacts) — e.g. to refresh its dates. Every session's own overlay keeps layering on top of the refreshed baseline. |

Loan applications are untouched by all three.

## Loan / underwriting flow

Applying for a loan (`/loans`) walks through a multi-step form, then moves through a status state machine that an admin advances manually from the admin loan queue (`/admin/loans`) — there's no real underwriting model, just a demo-friendly randomized outcome:

```
draft → submitted → under_review ⇄ docs_requested → docs_submitted → under_review → approved | denied
```

Each transition is logged to `loan_application_events` and can fire a Contentsquare custom event via `_uxa` on the applicant's next page load (see `lib/trackEvent.js` and `middleware/locals.js`) — useful for demoing event tracking on state changes that happen out-of-band from the user's own actions.
