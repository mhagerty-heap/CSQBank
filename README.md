# CSQBank — Contentsquare Demo Online Banking Site

This is a demo online banking site built to showcase [Contentsquare](https://contentsquare.com) analytics features including Session Replay, Zoning Analysis, Journey Analysis, and Form Analytics. It's a server-rendered Express + EJS app covering everyday banking (checking, savings, transfers, bill pay, person-to-person payments) plus a multi-step loan application and underwriting flow.  

---

## Quick Deploy to Vercel

This repo isn't pushed to a Git remote yet, so the fastest path today is the Vercel CLI — no GitHub setup required:

```
npm install -g vercel
vercel
```

Follow the prompts (link or create a project, accept the defaults — `vercel.json` is already set up). When it asks about environment variables, you can add `CSQ_TAG_ID` then or later in the dashboard.

> **Once this repo is pushed to GitHub**, you can swap in a one-click **Deploy with Vercel** button so anyone can clone straight to a new deployment:
> ```
> [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<your-org>/<your-repo>&env=CSQ_TAG_ID&envDescription=Your%20Contentsquare%20Tag%20ID)
> ```
> Replace `<your-org>/<your-repo>` with the real path once it exists.

The seeded SQLite database (`bank.db`) is bundled with the repo, so a deployment is ready to use immediately — no seed step needed on Vercel itself. On Vercel's read-only filesystem, `config/database.js` automatically copies `bank.db` into `/tmp` on cold start and writes there instead.

---

## Environment Variables

| Variable | Required? | Description |
|----------|-----------|--------------|
| `CSQ_TAG_ID` | Optional | Your Contentsquare tag ID — e.g. if your tag script is `12345645.js`, enter `12345645`. Without it, the site runs fine but the CSQ tag never loads (no tracking). |

Set this in Vercel under **Project Settings → Environment Variables**, or in a local `.env` file when running locally (copy `.env.example` to `.env`).

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

2. **Seed the database**

   Loads the shared demo banking sandbox — checking/savings accounts, ~50 transactions each, bill pay payees, and friend pay contacts:
   ```
   npm run seed
   ```

3. **Start the app**
   ```
   npm run dev   # nodemon — auto-restarts on file changes (recommended for local dev)
   ```
   or
   ```
   npm start     # plain node, no auto-restart
   ```

4. Open your browser and go to **http://localhost:3000**. The admin panel is at **http://localhost:3000/admin**.

### Logging in

Login is deliberately frictionless — there's no real authentication:

- Enter **any email address** on the Log In or Open an Account form. A new email auto-provisions a persona on the spot; an existing one logs back into it.
- The password field is present for visual realism only — it's read and discarded, never checked or stored.
- This means you can demo Contentsquare's `identify()` call live with any email typed on the spot, without needing to remember or share credentials.

**Admin access** isn't reachable through the UI — every account is provisioned as `role = 'customer'`. To promote one for testing the admin dashboard and loan underwriting queue, flip it directly in the database:
```
sqlite3 bank.db "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

---

## Project structure

```
heapBank2/
├── config/          # SQLite schema + connection (database.js)
├── lib/             # Domain logic: banking ops, loan state machine, demo data reset
├── middleware/      # Session auth (loadUser/requireLogin/requireAdmin) + view locals
├── public/          # Static assets (CSS, logo)
├── routes/          # Express route handlers (marketing, auth, banking, loans, admin/)
├── scripts/
│   └── seed.js      # Seeds the shared demo banking sandbox
├── views/           # EJS templates
├── server.js        # Express app entry point
├── bank.db          # SQLite database (bundled, pre-seeded)
└── vercel.json      # Vercel deployment config
```

---

## Demo data model

- **Shared banking sandbox** — checking/savings accounts, transactions, bill pay payees, and friend pay contacts are global, not per-user (every persona sees the same activity). This mirrors a shared demo environment rather than real per-customer data, so any number of people can log in with different emails during a live demo and see a consistent story.
- **Loan applications are the one per-identity, persisted entity** — each user's loan applications belong to them and survive a data reset.

### Resetting demo data

Two different resets exist, for two different situations:

| Action | Effect |
|--------|--------|
| `GET /demo/reset` | Clears just the current session (logs you out) — handy for typing a fresh email at `/login` without clearing cookies manually. |
| `POST /demo/reset-data` (any logged-in user), or the **Reset Demo Data** button in `/admin` | Re-seeds the shared banking sandbox — accounts, transactions, payees, contacts — back to a clean state. Loan applications are untouched. |
| `npm run seed` | Same shared-sandbox reset, run from the command line (e.g. before redeploying). |

## Loan / underwriting flow

Applying for a loan (`/loans`) walks through a multi-step form, then moves through a status state machine that an admin advances manually from the admin loan queue (`/admin/loans`) — there's no real underwriting model, just a demo-friendly randomized outcome:

```
draft → submitted → under_review ⇄ docs_requested → docs_submitted → under_review → approved | denied
```

Each transition is logged to `loan_application_events` and can fire a Contentsquare custom event via `_uxa` on the applicant's next page load (see `lib/trackEvent.js` and `middleware/locals.js`) — useful for demoing event tracking on state changes that happen out-of-band from the user's own actions.
