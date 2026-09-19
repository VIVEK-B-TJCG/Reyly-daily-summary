# Reyly Daily Meeting Summary

Live viewer of Reyly team standup summaries. Deployed on Vercel, source in this GitHub repo, updated nightly by a scheduled Claude cloud agent.

## 🌐 Live Site

**https://reyly-daily-summary.vercel.app**

Loads all meeting summaries automatically. Dashboard, task tracker, full-text search, per-meeting 3-tab view (Summary / Gemini Notes / Raw Transcript).

## ✨ Features

- **📊 Dashboard** — aggregate stats: total meetings, decisions, people activity, monthly chart, milestones
- **📋 Task Tracker** — every action item, filterable by owner/status/search. Mark done → saved in browser
- **📅 Sidebar** — month tabs + day cards with milestone badges (launch 🎉, dual session 2x, empty 🟡)
- **🔍 Full-text search** across all meetings
- **🔄 Refresh button** — hard-reloads the site (bypasses browser cache to pull latest pushed summaries)

## 🌙 Auto-Sync

A scheduled **Claude cloud agent** runs every day at **02:00 IST** and:

1. Checks Google Drive for new `Mark:Jayesh:Romeo Standup ... Notes by Gemini` docs
2. Formats each into rich markdown (topics, decisions, actions, cross-day threads, emoji tags)
3. Includes the full raw transcript in the Raw tab
4. Commits + pushes to this GitHub repo
5. Vercel auto-redeploys

**Manage the routine:** https://claude.ai/code/routines/trig_01HfykCKZg4UCp8aCnCCEft1

The routine uses the owner's claude.ai account for Google Drive access and a GitHub PAT for pushing.

## 📂 Structure

- `index.html` — single-page viewer
- `manifest.json` — list of all meeting dates (loaded on page open)
- `YYYY-MM-DD.md` — one file per daily standup
- `INDEX.md` — human-readable master index
- `TEMPLATE.md` — blank template
- `vercel.json` — static hosting config (markdown MIME + cache headers)

## ➕ Manual Adding

If auto-import misses a meeting or you want to hand-craft one:

1. Create `YYYY-MM-DD.md` at the repo root (use `TEMPLATE.md` as starting point)
2. Add the date to the top of `manifest.json`'s `files` array
3. Commit + push → Vercel redeploys automatically

## 📅 Coverage

- **Start:** 2026-04-01
- **F&F launch:** 2026-06-29 🎉
- **Data source:** Google Meet + Gemini auto-transcribed notes
