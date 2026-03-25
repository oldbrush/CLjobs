#!/usr/bin/env node
/**
 * Craigslist Job Scraper v3 — Targeted & Accurate
 *
 * Key improvements:
 * 1. Searches SPECIFIC Craigslist job subcategories (web, software, marketing, tech)
 *    instead of all jobs — eliminates custodians, cooks, attorneys
 * 2. Uses targeted multi-word queries that match how people post these jobs
 * 3. Filters out obviously irrelevant titles (nurse, driver, cook, etc.)
 * 4. Saves incrementally after each city
 *
 * Usage: node scrape-v3.mjs <batch_number> <total_batches>
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const BATCH = parseInt(process.argv[2] || '0');
const TOTAL_BATCHES = parseInt(process.argv[3] || '2');
const SESSION = `v3-${BATCH}`;

// Craigslist job subcategories to search (much more targeted than /jjj)
const SUBCATEGORIES = [
  'web',  // web/HTML/info design
  'sof',  // software/QA/DBA
  'mar',  // marketing/advertising/PR
  'tch',  // tech support
];

// Targeted queries — these match how real people post gig/job requests
const SEARCH_QUERIES = [
  'build website',
  'need website',
  'website help',
  'web developer',
  'web designer',
  'WordPress',
  'Shopify',
  'Squarespace',
  'SEO',
  'SEO help',
  'Claude',
  'OpenAI',
  'ChatGPT',
  'AI setup',
  'AI help',
  'openclaw',
  'app developer',
  'mobile app',
  'ecommerce',
  'web hosting',
];

// Title keywords that indicate IRRELEVANT jobs — filter these out
const EXCLUDE_TITLE_PATTERNS = [
  /\bnurse\b/i, /\bnursing\b/i, /\bRN\b/, /\bLPN\b/,
  /\bcook\b/i, /\bchef\b/i, /\bkitchen\b/i, /\brestaurant\b/i, /\bbartend/i,
  /\bdriver\b/i, /\bcdl\b/i, /\btruck/i, /\bdelivery\b/i,
  /\bcustodian\b/i, /\bjanitor/i, /\bhousekeeper/i, /\bcleaning\b/i,
  /\bconstruction\b/i, /\bplumb/i, /\belectrician\b/i, /\bhvac\b/i, /\broofing\b/i,
  /\bcashier\b/i, /\bretail associate\b/i, /\bbarista\b/i,
  /\bdental\b/i, /\bmedical assistant\b/i, /\bpharmac/i, /\btherapist\b/i,
  /\bteacher\b/i, /\btutor\b/i, /\binstructor\b/i,
  /\bsecurity guard\b/i, /\bsecurity officer\b/i,
  /\bwarehouse\b/i, /\bforklift\b/i, /\bpacker\b/i,
  /\bbabysit/i, /\bnanny\b/i, /\bcaregiver\b/i, /\bchild care\b/i,
  /\blandscap/i, /\blawn\b/i, /\bpainter\b/i,
  /\battorney\b/i, /\bparalegal\b/i,
  /\breal estate agent\b/i, /\brealtor\b/i,
  /\binsurance agent\b/i,
  /\bsnack route\b/i, /\bvending\b/i,
  /\bcash machine\b/i, /\b🔥.*CASH/i,
  /\bcold calling\b/i,
];

// Title keywords that BOOST relevance — prefer these
const BOOST_TITLE_PATTERNS = [
  /\bwebsite\b/i, /\bweb\s*(site|design|develop|page)\b/i,
  /\bwordpress\b/i, /\bshopify\b/i, /\bsquarespace\b/i, /\bwix\b/i,
  /\bseo\b/i, /\bsearch engine/i,
  /\bclaude\b/i, /\bopenai\b/i, /\bchatgpt\b/i, /\bopenclaw\b/i,
  /\bai\b/i, /\bartificial intelligence/i,
  /\bapp\s*develop/i, /\bmobile app\b/i, /\bios\b/i, /\bandroid\b/i,
  /\bfront.?end\b/i, /\bfull.?stack\b/i, /\bback.?end\b/i,
  /\bhtml\b/i, /\bcss\b/i, /\bjavascript\b/i, /\breact\b/i, /\bnode\b/i,
  /\becommerce\b/i, /\be-commerce\b/i, /\bonline store\b/i,
  /\bhosting\b/i, /\bdomain\b/i,
  /\bdigital market/i, /\bgoogle ads\b/i, /\bppc\b/i,
  /\bautomation\b/i, /\bchatbot\b/i, /\bapi\b/i,
];

function isRelevant(title) {
  // Exclude obviously irrelevant
  if (EXCLUDE_TITLE_PATTERNS.some(p => p.test(title))) return false;
  // Must match at least one boost pattern to be included
  if (BOOST_TITLE_PATTERNS.some(p => p.test(title))) return true;
  // If no boost match, exclude (too generic)
  return false;
}

const allCities = JSON.parse(readFileSync('./wealthy-cities.json', 'utf-8'));
const batchSize = Math.ceil(allCities.length / TOTAL_BATCHES);
const myCities = allCities.slice(BATCH * batchSize, (BATCH + 1) * batchSize);

console.log(`[Batch ${BATCH}] Scraping ${myCities.length} wealthy areas`);

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
  } catch { return null; }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseJSON(raw) {
  if (!raw) return null;
  try {
    let p = JSON.parse(raw);
    if (typeof p === 'string') p = JSON.parse(p);
    return Array.isArray(p) ? p : null;
  } catch { return null; }
}

async function scrapeCity(cityObj) {
  const { city, label } = cityObj;
  console.log(`\n[Batch ${BATCH}] === ${label} ===`);

  for (const subcat of SUBCATEGORIES) {
    for (const query of SEARCH_QUERIES) {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://${city}.craigslist.org/search/${subcat}?query=${encodedQuery}`;

      try {
        const opened = runBrowser(`open "${url}"`, 25000);
        if (!opened) {
          consecutiveFailures++;
          if (consecutiveFailures >= 8) {
            console.log(`  Too many failures, backing off 30s...`);
            await delay(30000);
            consecutiveFailures = 0;
          }
          continue;
        }

        consecutiveFailures = 0;
        await delay(2500);

        const listingsJS = runBrowser(
          `eval "JSON.stringify(Array.from(document.querySelectorAll('a.posting-title, .cl-search-result a.cl-search-anchor')).slice(0, 25).map(a => ({title: a.textContent.trim(), url: a.href})).filter(x => x.title.length > 3))"`,
          15000
        );

        const listings = parseJSON(listingsJS);

        if (listings && listings.length > 0) {
          let added = 0;
          for (const listing of listings) {
            if (listing.title && listing.url && isRelevant(listing.title)) {
              if (!results.some(r => r.url === listing.url)) {
                results.push({
                  city,
                  label,
                  query,
                  subcat,
                  title: listing.title,
                  url: listing.url,
                });
                added++;
              }
            }
          }
          if (added > 0) {
            console.log(`  [${subcat}] "${query}" → ${added} relevant (${listings.length - added} filtered)`);
          }
        }

        // Shorter delay since we're hitting subcategories (less load)
        await delay(3000 + Math.random() * 2000);

      } catch (err) {
        errors.push({ city, label, query, subcat, error: err.message });
      }
    }
  }
}

async function main() {
  const staggerMs = BATCH * 10000;
  console.log(`[Batch ${BATCH}] Staggering start by ${staggerMs / 1000}s...`);
  await delay(staggerMs);

  const outPath = `/Users/blakenewcomb/CLjobs/results-v3-batch-${BATCH}.json`;

  for (const cityObj of myCities) {
    try {
      await scrapeCity(cityObj);

      // Save after each city
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
      console.log(`  >> Saved ${results.length} relevant results so far`);

      await delay(3000 + Math.random() * 2000);
    } catch (err) {
      console.error(`[Batch ${BATCH}] Error: ${err.message}`);
      errors.push({ city: cityObj.city, label: cityObj.label, error: err.message });
    }
  }

  console.log(`\n[Batch ${BATCH}] Done! ${results.length} total relevant results in ${outPath}`);
}

main().catch(err => {
  console.error(`Fatal:`, err);
  process.exit(1);
});
