import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { electionConfig } from '../src/config/election';
import { election2022Config } from '../src/config/election2022';
import { normalizeOfficial, parseNationalHtml } from '../src/lib/source';
import { normalizeOfficial2026 } from '../src/lib/source2026';
import { Browser2026Adapter } from '../src/lib/server/browser-source';

const historical = process.argv.includes('--2022');
const config = historical ? election2022Config : electionConfig;
const directory = historical ? 'fixtures/2022' : 'fixtures/2026';
const fromSaved = process.argv.includes('--saved');
const capturedAt = new Date().toISOString();
async function download(url: string): Promise<string> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname}: HTTP ${response.status}`);
  if (response.headers.get('x-amzn-waf-action')) throw new Error('Browser verification required');
  return response.text();
}
const html = fromSaved
  ? await readFile(`${directory}/source.html`, 'utf8')
  : await download(config.sourceUrl).catch((error) => {
      if (historical) throw error;
      return new Browser2026Adapter().fetchNationalHtml(config);
    });
const csvUrl = historical ? parseNationalHtml(html, config).csvUrl : null;
const csv = csvUrl
  ? fromSaved
    ? await readFile(`${directory}/cities.csv`, 'utf8')
    : await download(csvUrl)
  : null;
const snapshot = historical
  ? normalizeOfficial(html, csv!, config, capturedAt)
  : normalizeOfficial2026(html, config, capturedAt);
// Validate everything before replacing any fixture. --saved keeps original provenance.
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/official.json`, JSON.stringify(snapshot, null, 2) + '\n');
if (!fromSaved) {
  await writeFile(`${directory}/source.html`, html);
  if (csv !== null) await writeFile(`${directory}/cities.csv`, csv);
  await writeFile(
    `${directory}/provenance.json`,
    JSON.stringify(
      {
        capturedAt,
        htmlUrl: config.sourceUrl,
        csvUrl,
        note: 'Capture time is not an official publication timestamp.',
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(`Captured ${snapshot.parties.length} lists, ${snapshot.validVotes} valid votes.`);
