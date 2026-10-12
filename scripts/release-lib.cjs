const fs = require('node:fs');
const path = require('node:path');

const RELEASE_ID_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isForbiddenPath(value) {
  const norm = normalizePath(value);
  const base = norm.split('/').pop();
  if (!norm || norm.includes('..')) return true;
  if (base === '.env' || norm.endsWith('/.env') || norm.endsWith('.env')) return true;
  if (norm.includes('smetacraft.env')) return true;
  if (norm.startsWith('deploy/') && norm.endsWith('.local.env')) return true;
  if (norm === 'data' || (norm.startsWith('data/') && !norm.startsWith('data/training/annotations/'))) return true;
  if (/(^|\/)backups\//.test(norm) || /(^|\/)node_modules\//.test(norm)) return true;
  if (/\.(sqlite|sqlite-wal|sqlite-shm|db|pem|key|pdf|docx|zip)$/i.test(norm)) return true;
  return false;
}

function hasSecretAssignment(text) {
  return /GEMINI_API_KEY\s*=\s*\S/.test(text) ||
    /BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY/.test(text);
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function releasePaths(root) {
  return {
    version: path.join(root, 'version.json'),
    log: path.join(root, 'docs', 'releases', 'log.json'),
    index: path.join(root, 'index.html'),
  };
}

function readRelease(root) {
  const parsed = readJson(releasePaths(root).version);
  if (!RELEASE_ID_PATTERN.test(parsed.releaseId || '')) {
    throw new Error('В version.json нет номера релиза вида ГГГГ-ММ-ДД.N');
  }
  return parsed;
}

function nextReleaseId(usedIds, now = new Date()) {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let number = 1;
  while (usedIds.has(`${day}.${number}`)) number += 1;
  return `${day}.${number}`;
}

function applyReleaseId(root, releaseId) {
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new Error(`Некорректный номер релиза: ${releaseId}`);
  const files = releasePaths(root);
  const version = readJson(files.version);
  version.releaseId = releaseId;
  version.branch = 'master';
  version.pagesDirectory = '/';
  version.pagesUrl = 'https://viktor-qatester.github.io/smetacraft/';
  writeJson(files.version, version);
  const html = fs.readFileSync(files.index, 'utf8');
  const next = html
    .replace(
      /(<meta name="smetacraft-release" content=")[^"]+(" \/>)/,
      `$1${releaseId}$2`,
    )
    .replace(
      /(<span id="app-release">)[^<]+(<\/span>)/,
      `$1${releaseId}$2`,
    );
  if (!next.includes(`content="${releaseId}"`) || !next.includes(`>${releaseId}<`)) {
    throw new Error('Не удалось записать номер релиза в index.html');
  }
  if (next !== html) fs.writeFileSync(files.index, next);
}

function readLog(root) {
  const filename = releasePaths(root).log;
  if (!fs.existsSync(filename)) return { pagesBaseline: null, releases: [] };
  const parsed = readJson(filename);
  if (!Array.isArray(parsed.releases)) parsed.releases = [];
  return parsed;
}

function writeLog(root, log) {
  writeJson(releasePaths(root).log, log);
}

function upsertRelease(root, entry) {
  const log = readLog(root);
  const index = log.releases.findIndex(item => item.releaseId === entry.releaseId);
  if (index === -1) log.releases.push(entry);
  else log.releases[index] = { ...log.releases[index], ...entry };
  writeLog(root, log);
  return log;
}

function testFiles(root) {
  return fs.readdirSync(path.join(root, 'tests'))
    .filter(name => name.endsWith('.test.cjs'))
    .sort()
    .map(name => `tests/${name}`);
}

module.exports = {
  RELEASE_ID_PATTERN,
  SHA_PATTERN,
  isForbiddenPath,
  hasSecretAssignment,
  readRelease,
  nextReleaseId,
  applyReleaseId,
  readLog,
  upsertRelease,
  testFiles,
};
