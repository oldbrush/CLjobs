#!/usr/bin/env node
/**
 * Enriches job listings with description summaries by visiting each posting.
 * Usage: node enrich-descriptions.mjs
 * Reads results-all.json, visits each URL, extracts key description points.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const SESSION = 'enricher';

function runBrowser(cmd, timeoutMs = 20000) {
  try {
    const out = execSync(`npx agent-browser --session ${SESSION} ${cmd}`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: '/Users/blakenewcomb/CLjobs',
      env: { ...process.env, AGENT_BROWSER_PROXY: 'socks5://127.0.0.1:9050' },
    });
    return out.trim();
  } catch { return null; }
}

function parseJSON(raw) {
  if (!raw) return null;
  try {
    let p = JSON.parse(raw);
    if (typeof p === 'string') p = JSON.parse(p);
    return p;
  } catch { return null; }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const dataPath = '/Users/blakenewcomb/CLjobs/results-all.json';
  if (!existsSync(dataPath)) {
    console.log('No results-all.json found. Run aggregate-results.mjs first.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
  const results = data.results || [];
  console.log(`Enriching ${results.length} listings with descriptions...`);

  let enriched = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.description) continue; // Already has one

    console.log(`[${i + 1}/${results.length}] ${r.title}`);

    const opened = runBrowser(`open "${r.url}"`, 20000);
    if (!opened) {
      r.description = '';
      continue;
    }

    await delay(2000);

    // Extract posting body text (first 500 chars)
    const descRaw = runBrowser(
      `eval "(() => { const body = document.querySelector('#postingbody, .print-qrcode-label + section, .body'); if (!body) return ''; const text = body.innerText.replace(/QR Code Link to This Post/i, '').trim(); return text.substring(0, 600); })()"`,
      10000
    );

    const desc = parseJSON(descRaw);
    if (desc && typeof desc === 'string' && desc.length > 10) {
      // Summarize: take first 2-3 sentences or 200 chars
      const sentences = desc.split(/[.!?\n]+/).filter(s => s.trim().length > 5).slice(0, 3);
      r.description = sentences.join('. ').substring(0, 250).trim();
      if (r.description.length < desc.length) r.description += '...';
      enriched++;
    } else {
      r.description = '';
    }

    await delay(3000 + Math.random() * 2000);

    // Save progress every 20 items
    if (i % 20 === 0) {
      writeFileSync(dataPath, JSON.stringify(data, null, 2));
      console.log(`  Saved progress (${enriched} enriched so far)`);
    }
  }

  writeFileSync(dataPath, JSON.stringify(data, null, 2));
  console.log(`\nDone! Enriched ${enriched} of ${results.length} listings.`);
}

main().catch(console.error);
