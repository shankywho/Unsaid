// Build-time: pick the most recent LIVE eval report (provenance.mode === "live") and copy it into src/generated.
// Never hardcode or round numbers: the UI renders exactly what the report says.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.resolve(root, 'web/src/generated');
fs.mkdirSync(outDir, { recursive: true });

const readAll = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(dir, f))
    : [];

const files = [...readAll(path.join(root, 'eval-results')), ...readAll(path.join(root, 'docs/eval'))];
const parse = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const live = (kind) =>
  files
    .filter((f) => (kind === 'learn' ? /learn/.test(path.basename(f)) : !/learn/.test(path.basename(f))))
    .map((f) => ({ f, j: parse(f) }))
    .filter(({ j }) => j?.provenance?.mode === 'live')
    .sort((a, b) => String(b.j.timestamp).localeCompare(String(a.j.timestamp)))[0];

const ev = live('eval');
if (!ev) {
  console.error(
    'prepare-data: no live eval report with provenance.mode="live" found in eval-results/ or docs/eval/. Run `pnpm eval` first.',
  );
  process.exit(1);
}
fs.writeFileSync(path.join(outDir, 'eval.json'), JSON.stringify(ev.j, null, 2));
console.log(`prepare-data: eval <- ${path.relative(root, ev.f)} (${ev.j.timestamp})`);

const learn = live('learn');
fs.writeFileSync(path.join(outDir, 'learn.json'), JSON.stringify(learn ? learn.j : null, null, 2));
console.log(`prepare-data: learn <- ${learn ? path.relative(root, learn.f) : 'none'}`);
