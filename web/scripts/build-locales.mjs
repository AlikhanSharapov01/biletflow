import fs from 'node:fs';
const rows = fs.readFileSync('translations/core.tsv', 'utf8').trim().split(/\r?\n/).slice(1);
const catalogs = { en: {}, ru: {}, kk: {} };
for (const row of rows) {
  const [key, en, ru, kk, extra] = row.split('\t');
  if (!key || !en || !ru || !kk || extra || key in catalogs.en) throw new Error(`Invalid or duplicate translation: ${key}`);
  Object.assign(catalogs.en, { [key]: en });
  Object.assign(catalogs.ru, { [key]: ru });
  Object.assign(catalogs.kk, { [key]: kk });
}
fs.mkdirSync('src/i18n/locales', { recursive: true });
for (const [locale, catalog] of Object.entries(catalogs)) {
  fs.writeFileSync(`src/i18n/locales/${locale}.json`, JSON.stringify(catalog, null, 2) + '\n');
}
console.log(`Generated ${rows.length} keys in en / ru / kk; share translations/core.tsv with mobile.`);
