import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { electionConfig } from '../src/config/election';
import { normalizeOfficial, parseNationalHtml } from '../src/lib/source';

const directory = 'fixtures/2022';
await mkdir(directory, { recursive: true });
const fromSaved = process.argv.includes('--saved');
const html = fromSaved
  ? await readFile(`${directory}/source.html`, 'utf8')
  : await (await fetch(electionConfig.sourceUrl)).text();
const csvUrl = parseNationalHtml(html, electionConfig).csvUrl;
const csv = fromSaved
  ? await readFile(`${directory}/cities.csv`, 'utf8')
  : await (await fetch(csvUrl)).text();
const capturedAt = new Date().toISOString();
const snapshot = normalizeOfficial(html, csv, electionConfig, capturedAt);
await writeFile(`${directory}/source.html`, html);
await writeFile(`${directory}/cities.csv`, csv);
await writeFile(`${directory}/official.json`, JSON.stringify(snapshot, null, 2) + '\n');
await writeFile(
  `${directory}/provenance.json`,
  JSON.stringify(
    {
      capturedAt,
      htmlUrl: electionConfig.sourceUrl,
      csvUrl,
      note: 'Official final 2022 results. Capture time is not an official publication timestamp.',
    },
    null,
    2,
  ) + '\n',
);
console.log(`Captured ${snapshot.parties.length} lists, ${snapshot.validVotes} valid votes.`);
