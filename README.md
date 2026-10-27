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

Loan applications are stored in Postgres (e.g. [Neon](https://neon.tech)) rather than a bundled file, so every serverless instance shares the same data — create a project with your provider, grab its connection string, and set it as `DATABASE_URL`. The loan tables are created automatically the first time anyone visits `/loans` (see `ensureSchema()` in `config/database.js`). Nothing else in the app touches the database, so a scale-to-zero host like Neon stays asleep unless someone is in the loan flow.

---

## Environment Variables

| Variable | Required? | Description |
|----------|-----------|--------------|
| `DATABASE_URL` | **Required** | Postgres connection string (Neon, Vercel Postgres, or any Postgres host). Only the loan flow uses it; the loan tables auto-create on the first `/loans` visit. The rest of the site works without it. |
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

3. **Start the app**
   ```
   npm run dev   # nodemon — auto-restarts on file changes (recommended for local dev)
   ```
   or
   ```
   npm start     # plain node, no auto-restart
   ```

4. Open your browser and go to **http://localhost:3000**.

### Logging in

Login is deliberately frictionless — there's no real authentication:

- Enter **any email address** on the Log In or Open an Account form. Your identity (email and name) lives only in the signed session cookie — there's no user table, so logging in never touches the database. Loan applications are matched to you by email, so logging in again with the same email picks up your loans.
- The password field is present for visual realism only — it's read and discarded, never checked or stored.
- This means you can demo Contentsquare's `identify()` call live with any email typed on the spot, without needing to remember or share credentials.

There is no admin area. Applicants move their own loans through underwriting with the **Advance Underwriting Status** button on their loan page.

---

## Project structure

```
heapBank2/
├── config/          # Postgres pool + schema (database.js)
├── lib/             # Domain logic: banking ops, bundled banking baseline, loan state machine
├── middleware/      # Session auth (loadUser/requireLogin) + view locals
├── public/          # Static assets (CSS, logo)
├── routes/          # Express route handlers (marketing, auth, banking, loans)
├── views/           # EJS templates
├── server.js        # Express app entry point
└── vercel.json      # Vercel deployment config
```

---

## Demo data model

- **Per-session banking overlay** — checking/savings balances, transactions, bill pay payees, and friend pay contacts are a shared, read-only baseline bundled in code (`lib/baseline.js`, generated deterministically with dates relative to today) plus whatever *this session itself* has added on top, tracked in the session cookie (`lib/banking.js`). Every session — a live demo login or an automated script — starts from the identical baseline; nothing one session adds is ever visible to any other session, so concurrent demos never interfere with each other.
- **Loan applications are the one persisted entity** — they live in Postgres (`loans` and `loan_events`), are matched to a user by email, and survive logging out and clearing cookies.

### Resetting demo data

| Action | Effect |
|--------|--------|
| `GET /demo/reset` | Clears just the current session (logs you out) — handy for typing a fresh email at `/login` without clearing cookies manually. |
| `POST /demo/reset-data` (the **Reset Demo Banking Data** link in the footer, any logged-in user) | Clears *your own session's* banking overlay back to the shared starting point. Doesn't touch anyone else's session. |

Loan applications are untouched by both.

## Loan / underwriting flow

Applying for a loan (`/loans`) walks through a multi-step form, then moves through a status state machine that the applicant advances with a demo control on their own loan page — there's no real underwriting model, just a demo-friendly randomized outcome:

```
draft → submitted → under_review ⇄ docs_requested → docs_submitted → under_review → approved | denied
```

Each transition is logged to `loan_events` and can fire a Contentsquare custom event via `_uxa` on the applicant's next page load (see `lib/trackEvent.js` and `middleware/locals.js`) — useful for demoing event tracking on state changes that happen out-of-band from the user's own actions.
