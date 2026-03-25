#!/usr/bin/env node
/**
 * Craigslist Job Scraper v2 - Fixed JSON parsing + better rate limiting
 * Usage: node scrape-v2.mjs <batch_number> <total_batches>
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const BATCH = parseInt(process.argv[2] || '0');
const TOTAL_BATCHES = parseInt(process.argv[3] || '4');
const SESSION = `scraper-v2-${BATCH}`;

// Broad, loose searches — single terms or simple pairs to cast a wide net
// Craigslist treats spaces as AND, so keep queries short
const SEARCH_QUERIES = [
  'website',
  'web developer',
  'web design',
  'WordPress',
  'Shopify',
  'SEO',
  'Claude',
  'AI',
  'app developer',
  'Squarespace',
  'Wix',
  'ecommerce',
];

const allCities = JSON.parse(readFileSync('./cities.json', 'utf-8'));

// Split cities into batches
const batchSize = Math.ceil(allCities.length / TOTAL_BATCHES);
const myCities = allCities.slice(BATCH * batchSize, (BATCH + 1) * batchSize);

console.log(`[Batch ${BATCH}] Scraping ${myCities.length} cities: ${myCities.slice(0, 5).join(', ')}...`);

const results = [];
const errors = [];
let consecutiveFailures = 0;

function runBrowser(cmd, timeoutMs = 30000) {
  try {
    const out = execSync(`npx agent-browser --session ${SESSION} ${cmd}`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: '/Users/blakenewcomb/CLjobs',
      env: {
        ...process.env,
        AGENT_BROWSER_PROXY: 'socks5://127.0.0.1:9050',
      },
    });
    return out.trim();
  } catch (e) {
    return null;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function parseAgentBrowserJSON(raw) {
  if (!raw) return null;
  try {
    let parsed = JSON.parse(raw);
    // agent-browser double-encodes: "\"[...]\""  -> parse once = string, parse twice = array
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function scrapeCity(city) {
  console.log(`[Batch ${BATCH}] Scraping: ${city}.craigslist.org`);

  for (const query of SEARCH_QUERIES) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://${city}.craigslist.org/search/jjj?query=${encodedQuery}`;

    try {
      const openResult = runBrowser(`open "${url}"`, 25000);
      if (openResult === null) {
        console.log(`  [${city}] Failed to open for query: ${query}`);
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          console.log(`  [${city}] Too many consecutive failures, backing off 30s...`);
          await delay(30000);
          consecutiveFailures = 0;
        }
        continue;
      }

      consecutiveFailures = 0;
      await delay(3000);

      // Extract job listing links
      const listingsJS = runBrowser(
        `eval "JSON.stringify(Array.from(document.querySelectorAll('a.posting-title, .cl-search-result a.cl-search-anchor')).slice(0, 30).map(a => ({title: a.textContent.trim(), url: a.href})).filter(x => x.title.length > 3))"`,
        15000
      );

      const listings = parseAgentBrowserJSON(listingsJS);

      if (listings && listings.length > 0) {
        for (const listing of listings) {
          if (listing.title && listing.url && listing.title.length > 3) {
            // Deduplicate by URL within this batch
            if (!results.some(r => r.url === listing.url)) {
              results.push({
                city,
                query,
                title: listing.title,
                url: listing.url,
              });
            }
          }
        }
        console.log(`  [${city}] Found ${listings.length} listings for: ${query}`);
      } else {
        console.log(`  [${city}] No listings for: ${query}`);
      }

      // Polite rate limiting - 5-8 seconds between requests
      await delay(5000 + Math.random() * 3000);

    } catch (err) {
      errors.push({ city, query, error: err.message });
    }
  }
}

async function main() {
  // Stagger start based on batch number to avoid thundering herd
  const staggerMs = BATCH * 10000;
  console.log(`[Batch ${BATCH}] Staggering start by ${staggerMs / 1000}s...`);
  await delay(staggerMs);

  for (const city of myCities) {
    try {
      await scrapeCity(city);
      // Extra delay between cities - 4-7 seconds
      await delay(4000 + Math.random() * 3000);
    } catch (err) {
      console.error(`[Batch ${BATCH}] Error with ${city}: ${err.message}`);
      errors.push({ city, error: err.message });
    }
  }

  const output = {
    batch: BATCH,
    cities: myCities,
    citiesCount: myCities.length,
    resultsCount: results.length,
    results,
    errors,
    scrapedAt: new Date().toISOString(),
  };

  const outPath = `/Users/blakenewcomb/CLjobs/results-v2-batch-${BATCH}.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n[Batch ${BATCH}] Done! ${results.length} results written to ${outPath}`);

  if (results.length > 0) {
    console.log(`\n=== BATCH ${BATCH} RESULTS ===`);
    for (const r of results) {
      console.log(`[${r.city}] ${r.title}`);
      console.log(`  -> ${r.url}`);
    }
  }
}

main().catch(err => {
  console.error(`[Batch ${BATCH}] Fatal error:`, err);
  process.exit(1);
});
