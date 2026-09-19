# Reyly Daily Meeting Summary

Live viewer for the Reyly team daily standup summaries — decisions, action items, bugs, launches, and everything in between.

## 🌐 Live Site

Deploy this repo to Vercel — the site loads automatically with all 108+ meeting summaries indexed.

## 📂 Structure

- `index.html` — the single-page viewer (dashboard + tasks + full-text search)
- `manifest.json` — list of all meeting dates (loaded on page open)
- `YYYY-MM-DD.md` — one file per daily standup (~108 files, Apr 2026 – Sep 2026)
- `INDEX.md` — human-readable master index
- `TEMPLATE.md` — blank template for new days

## ✨ Features

- **📊 Dashboard** — aggregate stats: total meetings, decisions, action items, people activity, monthly chart, milestones
- **📋 Task Tracker** — every action item across every meeting, filterable by owner / status / search. Mark done → saved in your browser (localStorage)
- **📅 Sidebar** — month tabs + day cards with milestone badges (launch 🎉, dual session 2x, empty 🟡)
- **🔍 Search** — full-text search across all meetings
- **3 tabs per meeting** — Structured Summary / Original Gemini Notes / Raw Paste

## 🚀 Deploy to Vercel

1. Push this repo to GitHub (already done at [github.com/VIVEK-B-TJCG/Reyly-daily-summary](https://github.com/VIVEK-B-TJCG/Reyly-daily-summary))
2. On Vercel: New Project → Import this GitHub repo → Deploy
3. No build step needed — it's a static site. Vercel serves `index.html` as the root.

## ➕ Adding a New Meeting

1. Create a new `YYYY-MM-DD.md` file at the repo root following the [TEMPLATE.md](TEMPLATE.md) pattern
2. Add the date to the top of `manifest.json`'s `files` array
3. Commit + push → Vercel auto-redeploys

## 📅 Coverage

- **Start date:** 2026-04-01
- **F&F launch:** 2026-06-29 🎉
- **Total meetings captured:** 108+
- **Data source:** Google Meet + Gemini auto-transcribed notes
