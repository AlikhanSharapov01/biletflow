import { parseAst } from 'rolldown/parseAst';
import fs from 'node:fs';
import path from 'node:path';

const entries = new Map();
function walk(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, file.name);
    if (name === path.join('src', 'analytics')) continue;
    if (file.isDirectory()) { if (!['i18n', 'test'].includes(file.name)) walk(name); continue; }
    if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
    const text = fs.readFileSync(name, 'utf8');
    const source = parseAst(text, { lang: name.endsWith('tsx') ? 'tsx' : 'ts' }, name);
    function visit(node, parent) {
      if (node.type === 'Literal' && typeof node.value === 'string' || node.type === 'JSXText' || node.type === 'TemplateLiteral') {
        const raw = node.type === 'TemplateLiteral' ? node.quasis.map((part,i) => part.value.cooked + (i < node.expressions.length ? `{p${i}}` : '')).join('') : node.value;
        const value = raw.replace(/\s+/g, ' ').trim();
        // Audit only: code, routes and backend values are deliberately retained in
        // this inventory until reviewed, rather than silently translated.
        const technical = parent?.type.startsWith('Import') || parent?.type.startsWith('TS') ||
          parent?.type === 'JSXAttribute' && ['className','id','type','name','value','role','to','href','accept','autoComplete'].includes(parent.name?.name) ||
          /^(\.{1,2}\/|https?:\/\/|image\/|application\/)/.test(value) ||
          /^[A-Z0-9_]+$/.test(value) || /^(BiletFlow|English|Русский|Қазақша)$/.test(value);
        const readableAttribute = parent?.type === 'JSXAttribute' && ['label','title','hint','placeholder','subtitle','eyebrow','submitLabel','feature','noun','aria-label','alt'].includes(parent.name?.name);
        if (!technical && /[A-Za-z]/.test(value) && (node.type === 'JSXText' || readableAttribute || /[A-Z]/.test(value) || value.includes(' '))) {
          const locations = entries.get(value) ?? [];
          locations.push(name.replaceAll('\\', '/') + ':' + (text.slice(0, node.start).split('\n').length));
          entries.set(value, locations);
        }
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach((item) => { if (item?.type) visit(item, node); });
        else if (value?.type) visit(value, node);
      }
    }
    visit(source);
  }
}
walk('src');
const exceptions = JSON.parse(fs.readFileSync('translations/technical-strings.json', 'utf8'));
for (const value of Object.keys(exceptions)) entries.delete(value);
if (!process.argv.includes('--check')) {
  fs.mkdirSync('translations', { recursive: true });
  fs.writeFileSync('translations/string-inventory.json', JSON.stringify(Object.fromEntries([...entries].sort()), null, 2) + '\n');
}
if (entries.size) {
  console.error(`${entries.size} unreviewed interface strings:`, JSON.stringify(Object.fromEntries(entries), null, 2));
  process.exitCode = 1;
} else console.log('No unreviewed interface literals; code/brand/data exceptions are documented in translations/technical-strings.json.');
