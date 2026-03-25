import { readFileSync, writeFileSync, existsSync } from 'fs';

const DIR = '/Users/blakenewcomb/CLjobs';
const all = [];
let cities = 0;

// Load v3 batches (targeted scraper)
for (let i = 0; i < 7; i++) {
  const p = `${DIR}/results-v3-batch-${i}.json`;
  if (existsSync(p)) {
    const d = JSON.parse(readFileSync(p));
    all.push(...(d.results || []));
    cities += d.citiesCount || 0;
  }
}

const seen = new Set();
const uniq = all.filter(r => {
  if (!r.url || seen.has(r.url)) return false;
  seen.add(r.url);
  return true;
});

writeFileSync(`${DIR}/results-all.json`, JSON.stringify({
  total: uniq.length,
  citiesCount: cities,
  results: uniq,
  scrapedAt: new Date().toISOString(),
}, null, 2));

console.log(new Date().toLocaleTimeString() + ': ' + uniq.length + ' relevant listings');
