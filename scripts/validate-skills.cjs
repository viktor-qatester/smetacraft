const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '.agents', 'skills');
const errors = [];
let checked = 0;

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const folder = path.join(root, entry.name);
  const skillPath = path.join(folder, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    errors.push(`${entry.name}: SKILL.md отсутствует`);
    continue;
  }
  checked += 1;
  const source = fs.readFileSync(skillPath, 'utf8');
  const lines = source.split(/\r?\n/);
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 2) {
    errors.push(`${entry.name}: нет YAML frontmatter`);
    continue;
  }
  const fields = Object.fromEntries(lines.slice(1, end)
    .map(line => /^([a-z_]+):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map(match => [match[1], match[2].replace(/^(?:"|')|(?:"|')$/g, '')]));
  if (fields.name !== entry.name || !/^[a-z0-9-]{1,63}$/.test(entry.name)) {
    errors.push(`${entry.name}: имя в frontmatter не совпадает с папкой`);
  }
  if (!fields.description || fields.description.includes('[TODO')) {
    errors.push(`${entry.name}: заполните description`);
  }
  if (source.includes('[TODO')) errors.push(`${entry.name}: остался текст шаблона`);

  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    const resolved = path.resolve(folder, target);
    if (!fs.existsSync(resolved)) errors.push(`${entry.name}: ссылка не существует: ${target}`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`Проверено скиллов: ${checked}. Ошибок нет.`);
}
