#!/usr/bin/env node
/**
 * Craigslist Job Scraper using agent-browser
 * Usage: node scrape-batch.mjs <batch_number> <total_batches>
 *
 * Searches Craigslist jobs across assigned US cities for:
 * - Claude/AI setup & development
 * - Website building
 * - SEO / Technical SEO
 * - Web & mobile app building
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const BATCH = parseInt(process.argv[2] || '0');
const TOTAL_BATCHES = parseInt(process.argv[3] || '1');
const SESSION = `scraper-${BATCH}`;

const SEARCH_QUERIES = [
  'claude AI',
  'AI development implementation',
  'AI agent',
  'LLM development',
  'website builder',
  'web development freelance',
  'SEO specialist',
  'technical SEO',
  'mobile app development',
  'web app development',
  'chatbot development',
  'AI integration',
  'prompt engineer',
];

const allCities = JSON.parse(readFileSync('./cities.json', 'utf-8'));

// Split cities into batches
const batchSize = Math.ceil(allCities.length / TOTAL_BATCHES);
const myCities = allCities.slice(BATCH * batchSize, (BATCH + 1) * batchSize);

console.log(`[Batch ${BATCH}] Scraping ${myCities.length} cities: ${myCities.slice(0, 5).join(', ')}...`);

const results = [];
const errors = [];

function runBrowser(cmd, timeoutMs = 30000) {
  try {
    const out = execSync(`npx agent-browser --session ${SESSION} ${cmd}`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: '/Users/blakenewcomb/CLjobs',
    });
    return out.trim();
  } catch (e) {
    return null;
  }
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function scrapeCity(city) {
  console.log(`[Batch ${BATCH}] Scraping: ${city}.craigslist.org`);

  for (const query of SEARCH_QUERIES) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://${city}.craigslist.org/search/jjj?query=${encodedQuery}`;

    try {
      // Navigate to search page
      const openResult = runBrowser(`open "${url}"`, 20000);
      if (openResult === null) {
        console.log(`  [${city}] Failed to open for query: ${query}`);
        continue;
      }

      // Wait for page to load
      await delay(2500);

      // Extract job listing links - use the correct Craigslist selector
      const listingsJS = runBrowser(`eval "JSON.stringify(Array.from(document.querySelectorAll('a.posting-title')).slice(0, 25).map(a => ({title: a.textContent.trim(), url: a.href})).filter(x => x.title.length > 3))"`, 10000);

      if (listingsJS) {
        try {
          // agent-browser eval double-encodes: output is a JSON string wrapping JSON
          let parsed = JSON.parse(listingsJS);
          // If it's still a string, parse again
          if (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          const listings = Array.isArray(parsed) ? parsed : [];
          if (listings.length > 0) {
            for (const listing of listings) {
              if (listing.title && listing.url && listing.title.length > 3) {
                results.push({
                  city,
                  query,
                  title: listing.title,
                  url: listing.url,
                });
              }
            }
            console.log(`  [${city}] Found ${listings.length} results for: ${query}`);
          }
        } catch (parseErr) {
          // Try alternative parsing
          console.log(`  [${city}] Parse error for ${query}: ${parseErr.message}`);
        }
      }

      // Rate limiting - be polite
      await delay(1500 + Math.random() * 1500);

    } catch (err) {
      errors.push({ city, query, error: err.message });
    }
  }
}

async function main() {
  for (const city of myCities) {
    try {
      await scrapeCity(city);
      // Extra delay between cities
      await delay(2000 + Math.random() * 2000);
    } catch (err) {
      console.error(`[Batch ${BATCH}] Error with ${city}: ${err.message}`);
      errors.push({ city, error: err.message });
    }
  }

  // Write results to batch-specific file
  const output = {
    batch: BATCH,
    cities: myCities,
    citiesCount: myCities.length,
    resultsCount: results.length,
    results,
    errors,
    scrapedAt: new Date().toISOString(),
  };

  const outPath = `/Users/blakenewcomb/CLjobs/results-batch-${BATCH}.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`[Batch ${BATCH}] Done! ${results.length} results written to ${outPath}`);

  // Print summary
  if (results.length > 0) {
    console.log(`\n=== BATCH ${BATCH} RESULTS ===`);
    for (const r of results) {
      console.log(`[${r.city}] ${r.title} - ${r.url}`);
    }
  }
}

main().catch(err => {
  console.error(`[Batch ${BATCH}] Fatal error:`, err);
  process.exit(1);
});
