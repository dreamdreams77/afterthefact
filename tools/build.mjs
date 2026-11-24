// Builds the single-file app: src/shell.html + src/styles.css + src/js/*.js → index.html
// Usage: node tools/build.mjs [outFile]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'index.html');
const shell = readFileSync(join(root, 'src/shell.html'), 'utf8');
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const jsDir = join(root, 'src/js');
const js = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort().map(f => `/* ===== ${f} ===== */\n` + readFileSync(join(jsDir, f), 'utf8')).join('\n');
if (js.includes('</script')) throw new Error('JS contains a closing script tag');
const html = shell.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
writeFileSync(out, html);
writeFileSync(join(root, 'tools/.bundle.js'), js);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
