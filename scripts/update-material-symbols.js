/** Refresh the self-hosted subset used by portal Material Symbols icons. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'client', 'src');
const outputRoot = path.join(root, 'client', 'public', 'fonts');

async function sourceFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(fullPath));
    else if (entry.name.endsWith('.tsx')) files.push(fullPath);
  }
  return files;
}

const names = new Set();
let spansFound = 0;
for (const file of await sourceFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  const spans = /<span\b[^>]*material-symbols-outlined[^>]*>([\s\S]*?)<\/span>/g;
  for (const match of source.matchAll(spans)) {
    spansFound++;
    const contents = match[1].trim();
    if (/^[a-z0-9_]+$/.test(contents)) {
      names.add(contents);
    } else if (['{item.icon}', '{preset.icon}', '{svc.icon}', '{getTypeIcon(n.type)}'].includes(contents)) {
      // These names come from the source definitions scanned below.
    } else {
      const alternatives = contents.match(/\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/);
      if (!alternatives) throw new Error(`Unrecognized dynamic Material Symbol in ${file}: ${contents}`);
      names.add(alternatives[1]);
      names.add(alternatives[2]);
    }
  }
}

for (const file of [
  path.join(sourceRoot, 'pages', 'portal', 'AdminDashboard.tsx'),
  path.join(sourceRoot, 'pages', 'portal', 'CustomerDashboard.tsx'),
  path.join(sourceRoot, 'components', 'AdminCreateOrderDialog.tsx'),
  path.join(sourceRoot, 'components', 'RatesPanel.tsx'),
]) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/icon:\s*'([a-z0-9_]+)'/g)) names.add(match[1]);
}
if (spansFound < 140 || names.size < 65) throw new Error('Icon scan looks incomplete; font was not updated.');

const sortedNames = [...names].sort();
if (process.argv.includes('--check')) {
  const savedNames = await readFile(path.join(outputRoot, 'material-symbols-icon-names.txt'), 'utf8');
  const savedFont = await readFile(path.join(outputRoot, 'material-symbols-outlined.woff2'));
  if (savedNames !== `${sortedNames.join('\n')}\n`) {
    throw new Error('Material Symbols have changed; run node scripts/update-material-symbols.js.');
  }
  if (savedFont.toString('ascii', 0, 4) !== 'wOF2') throw new Error('Material Symbols WOFF2 is invalid.');
  console.log(`Verified ${sortedNames.length} Material Symbols across ${spansFound} icon uses.`);
  process.exit(0);
}

const cssUrl = `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&icon_names=${sortedNames.join(',')}&display=block`;
const response = await fetch(cssUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
});
if (!response.ok) throw new Error(`Google Fonts stylesheet failed: ${response.status}`);
const css = await response.text();
const fontUrl = css.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('woff2'\)/)?.[1];
if (!fontUrl) throw new Error('Google Fonts did not provide a WOFF2 subset.');

const fontResponse = await fetch(fontUrl);
if (!fontResponse.ok) throw new Error(`Google Fonts download failed: ${fontResponse.status}`);
const font = Buffer.from(await fontResponse.arrayBuffer());
if (font.toString('ascii', 0, 4) !== 'wOF2' || font.length < 3_000 || font.length > 200_000) {
  throw new Error('Downloaded font is not the expected WOFF2 subset.');
}

const licenseResponse = await fetch('https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE');
if (!licenseResponse.ok) throw new Error(`Material Symbols license download failed: ${licenseResponse.status}`);
const license = await licenseResponse.text();
if (!license.includes('Apache License')) throw new Error('Unexpected Material Symbols license contents.');

await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'material-symbols-outlined.woff2'), font);
await writeFile(path.join(outputRoot, 'material-symbols-icon-names.txt'), `${sortedNames.join('\n')}\n`);
await writeFile(path.join(outputRoot, 'LICENSE-material-symbols.txt'), license);
console.log(`Saved ${sortedNames.length} Material Symbols (${font.length} bytes) from ${spansFound} icon uses.`);
