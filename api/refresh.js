// Vercel serverless function: /api/refresh
// - Reads new Mark:Jayesh:Romeo Standup docs from Google Drive
// - Parses each into a minimal markdown file
// - Commits them + updated manifest.json to GitHub
// - Vercel auto-redeploys on push

const { google } = require('googleapis');
const { Octokit } = require('@octokit/rest');

module.exports = async (req, res) => {
  // CORS for browser button
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cron secret protection — Vercel Cron adds an Authorization header when it calls
  // (see https://vercel.com/docs/cron-jobs/manage#securing-cron-jobs). Browser button
  // doesn't need it. Keep both open unless CRON_SECRET is set to require it.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    // Only enforce for OPTIONS/GET; POST from button is always allowed
    if (req.method === 'GET' && req.query?.source === 'cron') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await refresh();
    return res.status(200).json(result);
  } catch (e) {
    console.error('refresh failed:', e);
    return res.status(500).json({ error: e.message, stack: e.stack });
  }
};

async function refresh() {
  // 1. Validate env
  const required = ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GITHUB_TOKEN', 'GITHUB_REPO'];
  for (const k of required) {
    if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
  }

  // 2. Auth Drive (service account)
  let credentials;
  try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  // 3. Auth GitHub
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repo] = process.env.GITHUB_REPO.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPO must be owner/repo');

  // 4. Read current manifest.json from GitHub
  const { data: manifestFile } = await octokit.repos.getContent({
    owner, repo, path: 'manifest.json',
  });
  const manifest = JSON.parse(
    Buffer.from(manifestFile.content, 'base64').toString('utf8')
  );
  const knownDates = new Set(manifest.files);
  const latestDate = manifest.files[0] || '2026-01-01';

  // 5. Search Drive for Standup docs (Google Docs only)
  const q = [
    "mimeType = 'application/vnd.google-apps.document'",
    "name contains 'Standup'",
    "name contains 'Notes by Gemini'",
    "trashed = false",
  ].join(' and ');

  const { data: driveResp } = await drive.files.list({
    q,
    pageSize: 100,
    orderBy: 'createdTime desc',
    fields: 'files(id,name,size,createdTime,modifiedTime)',
  });

  const driveFiles = driveResp.files || [];

  // 6. Group by date, keep the biggest per date (main session vs skeleton)
  const byDate = {};
  for (const f of driveFiles) {
    const m = f.name.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (!m) continue;
    const dateStr = `${m[1]}-${m[2]}-${m[3]}`;
    if (knownDates.has(dateStr)) continue;
    if (dateStr <= latestDate) continue; // don't backfill

    const size = parseInt(f.size || '0', 10);
    if (!byDate[dateStr] || size > byDate[dateStr].size) {
      byDate[dateStr] = { dateStr, driveId: f.id, name: f.name, size };
    }
  }

  const toFetch = Object.values(byDate).sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  if (toFetch.length === 0) {
    return { added: [], message: 'No new meetings — everything up to date.', latestDate };
  }

  // 7. For each new date, export Doc → parse → build markdown → commit
  const results = [];
  for (const item of toFetch) {
    try {
      const { data: docText } = await drive.files.export(
        { fileId: item.driveId, mimeType: 'text/plain' },
        { responseType: 'text' }
      );

      const md = buildMarkdown(item.dateStr, docText);
      const path = `${item.dateStr}.md`;

      await putFile(octokit, owner, repo, path, md, `Auto-add meeting ${item.dateStr}`);
      results.push({ date: item.dateStr, status: 'added' });
    } catch (e) {
      console.error('Failed to import', item.dateStr, e);
      results.push({ date: item.dateStr, status: 'error', error: e.message });
    }
  }

  // 8. Update manifest.json
  const successful = results.filter(r => r.status === 'added').map(r => r.date);
  if (successful.length > 0) {
    const merged = [...new Set([...successful, ...manifest.files])].sort((a, b) => b.localeCompare(a));
    const newManifest = { files: merged };
    await putFile(
      octokit, owner, repo, 'manifest.json',
      JSON.stringify(newManifest, null, 2) + '\n',
      `Update manifest: +${successful.length} meeting${successful.length > 1 ? 's' : ''}`,
      manifestFile.sha
    );
  }

  return {
    added: successful,
    errors: results.filter(r => r.status === 'error'),
    message: successful.length > 0
      ? `Added ${successful.length} meeting${successful.length > 1 ? 's' : ''}: ${successful.join(', ')}`
      : 'No meetings added',
  };
}

// --- helpers -----------------------------------------------------------------

async function putFile(octokit, owner, repo, path, content, message, sha = null) {
  if (!sha) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path });
      sha = data.sha;
    } catch (e) {
      // file doesn't exist yet — that's fine
    }
  }
  await octokit.repos.createOrUpdateFileContents({
    owner, repo, path, message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    ...(sha ? { sha } : {}),
  });
}

function buildMarkdown(dateStr, rawText) {
  const summary = extractSection(rawText, 'Summary', ['Decisions', 'Next steps', 'Details']);
  const decisions = extractSection(rawText, 'Aligned', ['We', 'Next steps', 'Details']);
  const nextSteps = extractSection(rawText, 'Next steps', ['Details', 'You should review']);
  const details = extractSection(rawText, 'Details', ['You should review', 'Transcript']);

  const dt = new Date(dateStr + 'T00:00:00');
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dt.getDay()];
  const launchDate = new Date('2026-06-29T00:00:00');
  const tDays = Math.floor((dt - launchDate) / 86400000);
  const tLabel = tDays >= 0 ? `T+${tDays} Post-Launch` : `T${tDays} Pre-Launch`;

  const decisionRows = parseBullets(decisions).map(b => {
    const parts = b.split(/\s+[—-]\s+/);
    if (parts.length >= 2) return `| **${parts[0]}** | ${parts.slice(1).join(' — ')} | — |`;
    return `| ${b} | — | — |`;
  }).join('\n');

  const actionRows = parseBullets(nextSteps).map(b => {
    const m = b.match(/^\[([^\]]+)\]\s*(.+?):\s*(.+)$/) || b.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m && m.length === 4) return `| ${m[2]}: ${m[3]} | ${m[1]} |`;
    if (m) return `| ${m[2]} | ${m[1]} |`;
    return `| ${b} | — |`;
  }).join('\n');

  const detailBullets = parseBullets(details);
  const topicsBlock = detailBullets.length > 0
    ? detailBullets.map((b, i) => {
        const colon = b.indexOf(':');
        if (colon > 0 && colon < 80) {
          return `### ${i + 1}. ${b.substring(0, colon).trim()}\n${b.substring(colon + 1).trim()}`;
        }
        return `### ${i + 1}. ${b.substring(0, 60).trim()}${b.length > 60 ? '…' : ''}\n${b}`;
      }).join('\n\n')
    : '_(No details captured from Gemini notes)_';

  const today = new Date().toISOString().substring(0, 10);

  return `# ${dateStr} — Reyly Team Meeting (${dayName}, ${tLabel})

> ⚡ **Auto-imported** by Vercel cron/refresh. Ask Claude to enhance if you want cross-day threads or emoji tagging.

## Attendees
- Mark Gilmor, Romeo Reyes, Jayesh Gohel, Alan Zall _(from invite list; actual attendance not detected)_

## Topics Discussed

${topicsBlock}

## Decisions Made

### ✅ Aligned
| Decision | Reason | Owner |
|----------|--------|-------|
${decisionRows || '| _(No aligned decisions captured)_ | — | — |'}

## Action Items
| Task | Owner |
|------|-------|
${actionRows || '| _(No next steps captured)_ | — |'}

## Cross-Day Threads
_(Auto-import — cross-day analysis not generated. Ask Claude to enhance.)_

---
_Logged: ${today} (auto-import)_

<!-- ORIGINAL_NOTES_START -->
## 📄 Original Meeting Notes (Gemini)

### Summary
${summary || '_(No summary section found)_'}

### Decisions — Aligned
${decisions || '_(No decisions section)_'}

### Next Steps
${nextSteps || '_(No next steps section)_'}

### Details
${details || '_(No details section)_'}
<!-- ORIGINAL_NOTES_END -->

<!-- RAW_PASTE_START -->
${dateStr} — Mark:Jayesh:Romeo Standup
(Auto-imported by Vercel cron on ${today})
<!-- RAW_PASTE_END -->
`;
}

function extractSection(text, header, stopHeaders) {
  const startRe = new RegExp(`(?:^|\\n)\\s*${escapeRe(header)}\\s*\\n`, 'i');
  const startMatch = text.match(startRe);
  if (!startMatch) return '';
  const startIdx = startMatch.index + startMatch[0].length;
  let endIdx = text.length;
  for (const stop of stopHeaders) {
    const stopRe = new RegExp(`\\n\\s*${escapeRe(stop)}\\s*\\n`, 'i');
    const rest = text.substring(startIdx);
    const m = rest.match(stopRe);
    if (m && m.index !== undefined) {
      const abs = startIdx + m.index;
      if (abs < endIdx) endIdx = abs;
    }
  }
  return text.substring(startIdx, endIdx).trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseBullets(text) {
  if (!text) return [];
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => l.startsWith('- ') || l.startsWith('* ') || l.startsWith('•') || /^\d+\./.test(l))
    .map(l => l.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim())
    .filter(l => l.length > 3);
}
