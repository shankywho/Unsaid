import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { buildOpenApi } from '../src/http/openapi';

const out = path.resolve(__dirname, '../docs/openapi.yaml');
const yaml = YAML.stringify(buildOpenApi(), { lineWidth: 0 });
fs.mkdirSync(path.dirname(out), { recursive: true });
if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (current !== yaml) {
    console.error('docs/openapi.yaml is out of date. Run: pnpm openapi');
    process.exit(1);
  }
  console.log('docs/openapi.yaml is up to date');
} else {
  fs.writeFileSync(out, yaml, 'utf8');
  console.log(`wrote ${out}`);
}
process.exit(0);
