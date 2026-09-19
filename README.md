# Reyly Daily Meeting Summary

Live viewer + auto-import of Reyly team standup summaries. Deployed on Vercel, source in this GitHub repo.

## 🌐 Live Site

**https://reyly-daily-summary.vercel.app**

Loads all meeting summaries automatically. Dashboard, task tracker, full-text search.

## ✨ Features

- **📊 Dashboard** — aggregate stats: total meetings, decisions, people activity, monthly chart, milestones
- **📋 Task Tracker** — every action item, filterable by owner/status/search. Mark done → saved in browser
- **📅 Sidebar** — month tabs + day cards with milestone badges (launch 🎉, dual session 2x, empty 🟡)
- **🔍 Full-text search** across all meetings
- **🔄 Refresh button** — pulls new meetings from Google Drive, commits to GitHub, Vercel redeploys
- **🌙 Nightly cron** — same refresh runs automatically every day at **02:00 IST** (20:30 UTC)

## 📂 Structure

- `index.html` — single-page viewer
- `manifest.json` — list of all meeting dates (loaded on page open)
- `YYYY-MM-DD.md` — one file per daily standup
- `INDEX.md` — human-readable master index
- `TEMPLATE.md` — blank template
- `api/refresh.js` — Vercel serverless function: Drive → parse → GitHub
- `vercel.json` — hosting + cron config

## 🔧 One-time Setup — Auto-Refresh

The Refresh button and nightly cron need 3 Vercel environment variables. Set them once in the Vercel dashboard → Project → Settings → Environment Variables.

### 1. `GOOGLE_SERVICE_ACCOUNT_JSON`

Create a Google Cloud service account:

1. Go to https://console.cloud.google.com → create a new project (or use existing)
2. Enable the **Google Drive API** for that project (APIs & Services → Library → search "Drive")
3. IAM & Admin → Service Accounts → **Create service account** (name it e.g. `reyly-drive-reader`)
4. Skip role assignment (Drive access is per-file, not IAM)
5. Open the new service account → Keys tab → Add Key → JSON → **download the .json file**
6. Copy the full JSON contents (paste directly — Vercel accepts multi-line env vars)
7. **Share the Drive folder** containing the Gemini `Notes by Gemini` docs with the service account's email address (looks like `reyly-drive-reader@your-project.iam.gserviceaccount.com`) — give it **Viewer** access.

⚠️ Step 7 is critical. Service accounts have zero access to Drive unless a real user explicitly shares files/folders with them. Ask Mark to share the folder Gemini writes notes into.

### 2. `GITHUB_TOKEN`

GitHub → Settings → Developer settings → **Personal access tokens (fine-grained)** → Generate new:
- Repository access: **Only select repositories** → `VIVEK-B-TJCG/Reyly-daily-summary`
- Repository permissions:
  - **Contents: Read and write** ✅
  - Metadata: Read (auto)
- Expiration: 1 year (rotate annually)

Copy the token (starts with `github_pat_...`) into Vercel.

### 3. `GITHUB_REPO`

Just the string: `VIVEK-B-TJCG/Reyly-daily-summary`

### Redeploy

After setting the env vars, in Vercel → Deployments → click the latest → **Redeploy** so the new env vars take effect.

## 🔄 How Auto-Import Works

### Refresh button

Anyone visiting the site can click **🔄 Refresh**. It POSTs to `/api/refresh`. The function:

1. Reads current `manifest.json` from GitHub → knows the latest captured date
2. Queries Google Drive for `Mark:Jayesh:Romeo Standup - ... Notes by Gemini` docs
3. For each date newer than the latest captured, exports the Doc as plain text
4. Parses out Summary / Decisions / Next Steps / Details sections
5. Builds a markdown file matching the site's template
6. Commits `YYYY-MM-DD.md` + updated `manifest.json` to GitHub
7. Vercel detects the push and auto-redeploys in ~30 seconds

### Nightly cron

`vercel.json` schedules `/api/refresh?source=cron` at `30 20 * * *` UTC = **02:00 IST daily**. Same logic as the button, no user interaction needed. Requires Vercel Pro plan if you want >1 execution/day; the Hobby plan supports daily cron for free.

## ⚠️ Format Trade-off

The auto-imported files have basic structure (Summary + Decisions table + Action Items) but **NOT** the rich cross-day threads, emoji tagging, or Jayesh-facing summaries that Claude produces manually. Auto-imports include a note:

> ⚡ Auto-imported by Vercel cron/refresh. Ask Claude to enhance if you want cross-day threads or emoji tagging.

If you want higher quality later, upgrade to **Tier C** (LLM-formatted via Claude API) — say the word and I'll add that.

## ➕ Manual Adding

If auto-import misses a meeting or you want to hand-craft one:

1. Create `YYYY-MM-DD.md` at the repo root (use `TEMPLATE.md` as a starting point)
2. Add the date to the top of `manifest.json`'s `files` array
3. Commit + push → Vercel redeploys

## 📅 Coverage

- **Start:** 2026-04-01
- **F&F launch:** 2026-06-29 🎉
- **Total meetings captured:** 108+ (through 2026-09-18)
- **Data source:** Google Meet + Gemini auto-transcribed notes
