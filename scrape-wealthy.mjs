#!/usr/bin/env node
/**
 * Craigslist Job Scraper - Top 20 Wealthiest US Areas
 * Broad search for website dev, SEO, AI/Claude, and related gigs
 * Usage: node scrape-wealthy.mjs <batch_number> <total_batches>
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const BATCH = parseInt(process.argv[2] || '0');
const TOTAL_BATCHES = parseInt(process.argv[3] || '2');
const SESSION = `wealthy-${BATCH}`;

// Broad, loose single-term searches
const SEARCH_QUERIES = [
  'website',
  'web developer',
  'web design',
  'WordPress',
  'Shopify',
  'SEO',
  'Claude',
  'OpenAI',
  'ChatGPT',
  'openclaw',
  'AI',
  'ai development',
  'app developer',
  'web hosting',
  'Squarespace',
  'Wix',
  'ecommerce',
  'automation',
];

const allCities = JSON.parse(readFileSync('./wealthy-cities.json', 'utf-8'));

// Split cities into batches
const batchSize = Math.ceil(allCities.length / TOTAL_BATCHES);
const myCities = allCities.slice(BATCH * batchSize, (BATCH + 1) * batchSize);

console.log(`[Batch ${BATCH}] Scraping ${myCities.length} wealthy areas: ${myCities.slice(0, 3).map(c => c.label).join(', ')}...`);

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
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed);
    }
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function scrapeCity(cityObj) {
  const { city, label } = cityObj;
  console.log(`[Batch ${BATCH}] Scraping: ${label} (${city}.craigslist.org)`);

  for (const query of SEARCH_QUERIES) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://${city}.craigslist.org/search/jjj?query=${encodedQuery}`;

    try {
      const openResult = runBrowser(`open "${url}"`, 25000);
      if (openResult === null) {
        console.log(`  [${city}] Failed to open for query: ${query}`);
        consecutiveFailures++;
        if (consecutiveFailures >= 5) {
          console.log(`  [${city}] Too many failures, backing off 30s...`);
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
            if (!results.some(r => r.url === listing.url)) {
              results.push({
                city,
                label,
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

      // Polite delay
      await delay(5000 + Math.random() * 3000);

    } catch (err) {
      errors.push({ city, label, query, error: err.message });
    }
  }
}

async function main() {
  const staggerMs = BATCH * 10000;
  console.log(`[Batch ${BATCH}] Staggering start by ${staggerMs / 1000}s...`);
  await delay(staggerMs);

  const outPath = `/Users/blakenewcomb/CLjobs/results-wealthy-batch-${BATCH}.json`;

  for (const cityObj of myCities) {
    try {
      await scrapeCity(cityObj);

      // Write results after EVERY city so the website updates live
      const output = {
        batch: BATCH,
        cities: myCities,
        citiesCount: myCities.length,
        resultsCount: results.length,
        results,
        errors,
        scrapedAt: new Date().toISOString(),
      };
      writeFileSync(outPath, JSON.stringify(output, null, 2));
      console.log(`  >> Saved ${results.length} results so far`);

      await delay(4000 + Math.random() * 3000);
    } catch (err) {
      console.error(`[Batch ${BATCH}] Error with ${cityObj.city}: ${err.message}`);
      errors.push({ city: cityObj.city, label: cityObj.label, error: err.message });
    }
  }

  console.log(`\n[Batch ${BATCH}] Done! ${results.length} total results in ${outPath}`);

  if (results.length > 0) {
    console.log(`\n=== BATCH ${BATCH} RESULTS ===`);
    for (const r of results) {
      console.log(`[${r.label}] ${r.title}`);
      console.log(`  -> ${r.url}`);
    }
  }
}

main().catch(err => {
  console.error(`[Batch ${BATCH}] Fatal error:`, err);
  process.exit(1);
});
