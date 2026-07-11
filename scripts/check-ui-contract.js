const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const contract = JSON.parse(fs.readFileSync(path.join(root, 'test/contracts/ui-contract.json'), 'utf8'));
const errors = [];

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)(?:\s*=\s*["']([^"']*)["'])?/g)) result[match[1].toLowerCase()] = match[2] || '';
  return result;
}

for (const [name, section] of Object.entries(contract)) {
  const htmlPath = path.join(root, section.html);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const htmlDir = path.dirname(htmlPath);
  const resources = [
    ...[...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)].map((match) => ['CSS', match[1], section.css]),
    ...[...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => ['JS', match[1], section.js])
  ];
  for (const [kind, reference, expected] of resources) {
    if (!expected.includes(reference)) errors.push(`${name}: unexpected ${kind} ${reference}`);
    if (!fs.existsSync(path.resolve(htmlDir, reference))) errors.push(`${name}: missing ${kind} path ${reference}`);
  }
  for (const reference of [...section.css, ...section.js]) {
    if (!resources.some((resource) => resource[1] === reference)) errors.push(`${name}: required resource is not linked: ${reference}`);
  }
  for (const [id, expectedType] of Object.entries(section.elements)) {
    const match = html.match(new RegExp(`<([\\w-]+)\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
    if (!match) { errors.push(`${name}: missing #${id}`); continue; }
    const tag = match[1].toLowerCase();
    const attrs = attributes(match[0]);
    const actualType = tag === 'input' ? (attrs.type || 'text').toLowerCase() : tag;
    if (actualType !== expectedType) errors.push(`${name}: #${id} must be ${expectedType}, found ${actualType}`);
  }
  if (section.accordions) {
    for (const name of section.accordions) {
      const header = html.match(new RegExp(`<[^>]+class=["'][^"']*accordionHeader[^"']*["'][^>]*data-section=["']${name}["'][^>]*>`, 'i'));
      const bodyId = `section${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      const body = html.match(new RegExp(`<[^>]+id=["']${bodyId}["'][^>]*>`, 'i'));
      if (!header || !body) errors.push(`${name}: missing accordion ${name}`);
      if (header && /\bopen\b/i.test(header[0])) errors.push(`${name}: accordion ${name} must not be open in HTML`);
      if (body && /\bopen\b/i.test(body[0])) errors.push(`${name}: accordion body ${name} must not be open in HTML`);
    }
    if (section.accordionInitialState === 'closed' && /section\s*===\s*['"]display['"]/.test(fs.readFileSync(path.resolve(htmlDir, section.js.find((entry) => entry.endsWith('.js'))), 'utf8'))) errors.push(`${name}: Display mode must not be opened by JavaScript`);
  }
}

if (errors.length) {
  console.error('UI contract violations:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else console.log('UI contract is satisfied.');
