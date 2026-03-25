#!/usr/bin/env node
/**
 * Aggregates all v2 batch results into results-all.json for the website
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';

const TOTAL_BATCHES = 15;
const allResults = [];
const allErrors = [];
let totalCities = 0;

for (let i = 0; i < TOTAL_BATCHES; i++) {
  const path = `/Users/blakenewcomb/CLjobs/results-v2-batch-${i}.json`;
  if (existsSync(path)) {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    allResults.push(...(data.results || []));
    allErrors.push(...(data.errors || []));
    totalCities += data.citiesCount || 0;
    console.log(`Batch ${i}: ${data.resultsCount} results from ${data.citiesCount} cities`);
  } else {
    console.log(`Batch ${i}: NOT FOUND`);
  }
}

// Deduplicate by URL
const seen = new Set();
const unique = allResults.filter(r => {
  if (seen.has(r.url)) return false;
  seen.add(r.url);
  return true;
});

const output = {
  total: unique.length,
  citiesCount: totalCities,
  results: unique,
  allErrors,
  scrapedAt: new Date().toISOString(),
};

writeFileSync('/Users/blakenewcomb/CLjobs/results-all.json', JSON.stringify(output, null, 2));

console.log(`\nAggregated: ${unique.length} unique listings from ${totalCities} cities`);
console.log(`Written to results-all.json`);
