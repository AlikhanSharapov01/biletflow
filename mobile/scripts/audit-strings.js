// Lists interface text in src/ that is not translated: string literals, JSX
// text and template literals a person could read, except reviewed code, data
// and brand strings in src/i18n/technical-strings.json. Run with --check to
// fail when any are found (the web has the same check in web/scripts).
//
// Usage: node scripts/audit-strings.js [--check]

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const SRC = path.join(__dirname, "..", "src");
const TECHNICAL = new Set(JSON.parse(fs.readFileSync(path.join(SRC, "i18n", "technical-strings.json"), "utf8")));

// JSX props that carry readable text, and props that never do.
const READABLE = new Set([
  "label", "title", "subtitle", "message", "placeholder", "hint", "confirmLabel", "cancelLabel", "eyebrow",
  "accessibilityLabel", "accessibilityHint", "meta", "note", "feature", "submitLabel", "backLabel", "legend", "emptyMessage",
]);
const TECHNICAL_PROPS = new Set([
  "testID", "keyboardType", "autoCapitalize", "autoComplete", "returnKeyType", "contentFit", "accessibilityRole", "tone",
  "textContentType", "icon", "name", "id", "key", "style", "mode", "variant", "pointerEvents", "resizeMode", "href",
]);
const DATA_KEYS = new Set(["pathname", "mimeType", "type", "status", "kind", "code", "tone", "value", "id"]);
const NON_TEXT_CALLS = /^(require|mock|setItem|getItem|includes|startsWith|endsWith|replace|split|join|test|push|navigate|fetch|request|requestBlob|downloadFile|fetchText|uploadFile|apiUrl|withQuery|encodeURIComponent|get|set|has|delete|t)$/;

function looksTechnical(value) {
  return (
    /^(\.{1,2}\/|@\/|\/|https?:\/\/|image\/|application\/|text\/|expo-|#)/.test(value) ||
    /^[a-z0-9_.:\-[\]/]+$/.test(value) ||
    /^[A-Z0-9_]+$/.test(value) ||
    /^(BiletFlow|English|Русский|Қазақша|KZT|QR|PDF|CSV|SVG|PNG|JPEG|ICS)$/.test(value) ||
    // Only separators and placeholders, such as "{p0} · {p1}".
    !/[A-Za-z]/.test(value.replace(/\{p\d+\}/g, ""))
  );
}

const RAW_NAMES = /^name_en$/;
const RAW_CODES = /^(status|state|kind|publication_state|time_status|moderation_state|client_kind|visibility)$/;

// True when the value itself ends up on screen: as JSX text, as a readable
// prop, or through ?? / || fallbacks into one of those.
function shownAsText(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current.parent) || (ts.isBinaryExpression(current.parent) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(current.parent.operatorToken.kind)) || (ts.isConditionalExpression(current.parent) && current.parent.condition !== current)) {
    current = current.parent;
  }
  const parent = current.parent;
  if (!ts.isJsxExpression(parent)) return false;
  if (ts.isJsxAttribute(parent.parent)) return READABLE.has(parent.parent.name.getText());
  return ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent);
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  let text = node.head.text;
  node.templateSpans.forEach((span, index) => (text += `{p${index}}` + span.literal.text));
  return text;
}

function auditFile(file, found) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const record = (node, raw) => {
    const value = raw.replace(/\s+/g, " ").trim();
    if (!value || looksTechnical(value) || TECHNICAL.has(value)) return;
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const where = `${path.relative(SRC, file).split(path.sep).join("/")}:${line}`;
    found.set(value, [...(found.get(value) ?? []), where]);
  };
  (function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isJsxText(node)) return record(node, node.text);
    // A server code or an English-only name shown as it is: statusLabel() or
    // categoryName() translates it.
    if (ts.isPropertyAccessExpression(node) && (RAW_NAMES.test(node.name.text) || (RAW_CODES.test(node.name.text) && shownAsText(node)))) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const value = `[shown untranslated] ${node.getText(source)}`;
      found.set(value, [...(found.get(value) ?? []), `${path.relative(SRC, file).split(path.sep).join("/")}:${line}`]);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const parent = node.parent;
      const value = ts.isStringLiteral(node) ? node.text : templateText(node);
      const attribute = ts.isJsxAttribute(parent) ? parent : ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) ? parent.parent : null;
      const name = attribute ? attribute.name.getText(source) : null;
      const skip =
        (name && TECHNICAL_PROPS.has(name)) ||
        (ts.isPropertyAssignment(parent) && (parent.name === node || DATA_KEYS.has(parent.name.getText(source)))) ||
        (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(parent.operatorToken.kind)) ||
        ts.isCaseClause(parent) || ts.isElementAccessExpression(parent) || ts.isLiteralTypeNode(parent) ||
        (ts.isCallExpression(parent) && NON_TEXT_CALLS.test(parent.expression.getText(source).split(".").pop()));
      if (!skip && ((name && READABLE.has(name)) || /[A-Z]/.test(value[0] ?? "") || value.includes(" "))) record(node, value);
    }
    ts.forEachChild(node, visit);
  })(source);
}

function auditStrings() {
  const found = new Map();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["i18n", "testing"].includes(entry.name)) walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.|testFixtures|fixtures\./.test(entry.name)) {
        auditFile(full, found);
      }
    }
  })(SRC);
  return found;
}

module.exports = { auditStrings };

if (require.main === module) {
  const found = auditStrings();
  for (const [value, places] of found) console.log(`${JSON.stringify(value)}  ${places.join(", ")}`);
  console.log(found.size ? `${found.size} untranslated interface strings.` : "No untranslated interface strings.");
  if (process.argv.includes("--check") && found.size) process.exitCode = 1;
}
