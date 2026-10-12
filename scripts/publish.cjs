#!/usr/bin/env node
// Одна команда публикации: проверки, commit, push, GitHub Pages, затем только vic-smetacraft на AEZA.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  SHA_PATTERN,
  isForbiddenPath,
  hasSecretAssignment,
  readRelease,
  readLog,
  nextReleaseId,
  applyReleaseId,
  upsertRelease,
  testFiles,
} = require('./release-lib.cjs');
const { deployRelease, NOT_PUBLISHED, FINISH_COMMAND } = require('./aeza-update.cjs');

const root = path.resolve(__dirname, '..');
const pagesUrl = 'https://viktor-qatester.github.io/smetacraft/';
const aezaOnly = process.argv.includes('--aeza-only');

function git(args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')}`).trim());
  }
  return { code: result.status ?? 1, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() };
}

function changedPaths() {
  const text = git(['status', '--porcelain']).stdout;
  const paths = [];
  for (const line of text.split('\n').filter(Boolean)) {
    const pathPart = line.slice(3).trim();
    if (pathPart.includes(' -> ')) paths.push(...pathPart.split(' -> ').map(item => item.trim()));
    else paths.push(pathPart);
  }
  return paths;
}

function assertNoForbidden(paths) {
  const forbidden = paths.filter(isForbiddenPath);
  if (forbidden.length > 0) {
    throw new Error(`Публикация остановлена. Эти файлы нельзя отправлять в Git: ${forbidden.join(', ')}`);
  }
}

function assertBranch() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
  if (branch !== 'master') throw new Error('Публикация идёт только из ветки master.');
}

function assertFastForward() {
  git(['fetch', 'origin', 'master']);
  const counts = git(['rev-list', '--left-right', '--count', 'origin/master...HEAD']).stdout.split(/\s+/);
  const behind = Number(counts[0] || 0);
  const ahead = Number(counts[1] || 0);
  if (behind > 0) {
    throw new Error('На GitHub есть коммиты, которых нет в этой копии. Force push запрещён, сначала разберите расхождение вручную.');
  }
  return ahead;
}

function runChecks() {
  const files = testFiles(root);
  const tests = spawnSync(process.execPath, ['--test', ...files], { cwd: root, stdio: 'inherit' });
  if (tests.status !== 0) throw new Error('Проверки не прошли. Ничего не отправлено.');
  const skills = spawnSync(process.execPath, ['scripts/validate-skills.cjs'], { cwd: root, stdio: 'inherit' });
  if (skills.status !== 0) throw new Error('Проверка скиллов не прошла. Ничего не отправлено.');
  git(['diff', '--check']);
  return {
    result: 'pass',
    command: `node --test ${files.join(' ')} && node scripts/validate-skills.cjs`,
    at: new Date().toISOString(),
  };
}

function commitIfNeeded(title, body) {
  assertNoForbidden(changedPaths());
  git(['add', '-A']);
  const cached = git(['diff', '--cached', '--name-only']).stdout.split('\n').filter(Boolean);
  assertNoForbidden(cached);
  const diff = git(['diff', '--cached'], true);
  if (hasSecretAssignment(`${diff.stdout}\n${diff.stderr}`)) {
    git(['reset'], true);
    throw new Error('В изменениях найден секрет. Commit остановлен, индекс очищен, файлы на диске сохранены.');
  }
  if (cached.length === 0) return false;
  git(['commit', '-m', title, '-m', body]);
  return true;
}

function push() {
  const ahead = assertFastForward();
  if (ahead === 0) return git(['rev-parse', 'HEAD']).stdout;
  git(['push', 'origin', 'HEAD:master']);
  return git(['rev-parse', 'HEAD']).stdout;
}

function gitHash(text) {
  const result = spawnSync('git', ['hash-object', '--stdin'], {
    cwd: root,
    input: text.replace(/\r\n/g, '\n'),
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || 'hash-object');
  return result.stdout.trim();
}

async function pagesMatch(sha, releaseId) {
  const stamp = Date.now();
  const files = ['index.html', 'version.json', 'js/core/slab.js', 'docs/releases/log.json'];
  for (const file of files) {
    const response = await fetch(`${pagesUrl}${file}?release-check=${stamp}`, {
      headers: { 'user-agent': 'smetacraft-release', 'cache-control': 'no-cache' },
    });
    if (!response.ok) return false;
    const text = await response.text();
    const expected = git(['rev-parse', `${sha}:${file}`]).stdout;
    if (gitHash(text) !== expected) return false;
    if (file === 'index.html') {
      const markers = ['Тестовая версия SmetaCraft', 'Плита', 'id="bill-total"', `>${releaseId}<`];
      if (markers.some(marker => !text.includes(marker))) return false;
    }
  }
  return true;
}

async function waitForPages(sha, releaseId) {
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      if (await pagesMatch(sha, releaseId)) return true;
    } catch (error) {
      process.stdout.write(`GitHub Pages пока недоступны для сверки: ${error.message}\n`);
    }
    process.stdout.write('Жду, пока GitHub Pages начнёт отдавать этот коммит...\n');
    await new Promise(resolve => setTimeout(resolve, 20000));
  }
  return false;
}

function record(releaseId, patch) {
  const current = readLog(root).releases.find(item => item.releaseId === releaseId) || {};
  upsertRelease(root, {
    ...current,
    releaseId,
    ...patch,
    pagesUrl,
    aezaProject: 'vic-smetacraft',
  });
}

function reportNotPublished(extra) {
  process.stdout.write(`\n${NOT_PUBLISHED}\n`);
  if (extra) process.stdout.write(`${extra}\n`);
  process.stdout.write(`Команда для завершения обновления AEZA:\n${FINISH_COMMAND}\n`);
  process.stdout.write('Перед ней один раз создайте deploy/aeza.local.env из deploy/aeza.local.env.example и укажите SSH-пользователя. Пароль команда не спрашивает.\n');
}

async function publishAeza(sha, releaseId) {
  const pagesReady = await waitForPages(sha, releaseId);
  if (!pagesReady) {
    reportNotPublished('GitHub Pages ещё не совпал с отправленным коммитом, AEZA не менялся.');
    return 2;
  }
  record(releaseId, {
    publications: { githubPages: 'published', aeza: 'pending' },
    deployedCommit: sha,
  });
  const result = await deployRelease({ root, sha, releaseId });
  if (!result.ok) {
    record(releaseId, {
      publications: { githubPages: 'published', aeza: 'not_published' },
      aezaReason: result.reason,
    });
    commitIfNeeded(
      `docs: record AEZA pending for ${releaseId}`,
      'GitHub Pages проверен. AEZA этим запуском не обновлён.',
    );
    push();
    const hint = result.reason === 'no-access'
      ? 'Файл deploy/aeza.local.env не заполнен, поэтому сервер не изменялся.'
      : 'Обновление AEZA не завершилось. Если оно успело начаться, скрипт возвращает предыдущий код и копию SQLite.';
    reportNotPublished(hint);
    return 2;
  }
  record(releaseId, {
    publications: { githubPages: 'published', aeza: 'published' },
    deployedCommit: sha,
    aezaReason: '',
  });
  const recorded = commitIfNeeded(
    `docs: record publication ${releaseId}`,
    'Проверки пройдены. GitHub Pages и AEZA отдают этот релиз.',
  );
  if (!recorded) {
    process.stdout.write(`Оба адреса на релизе ${releaseId}, коммит ${sha}.\n`);
    return 0;
  }
  const finalSha = push();
  const finalRelease = readRelease(root).releaseId;
  const finalPages = await waitForPages(finalSha, finalRelease);
  if (!finalPages) {
    reportNotPublished('Журнал отправлен в GitHub, но Pages ещё не показал запись. AEZA остаётся на предыдущем успешном коммите этого запуска.');
    return 2;
  }
  const second = await deployRelease({ root, sha: finalSha, releaseId: finalRelease });
  if (!second.ok) {
    reportNotPublished('Запись о публикации есть в GitHub. Повторное включение этого коммита на AEZA не прошло. Команда завершения повторит его.');
    return 2;
  }
  process.stdout.write(`\nГотово. Релиз ${finalRelease}.\nКоммит: ${finalSha}\nСтраница: ${pagesUrl}\nAEZA: проект vic-smetacraft, коммит ${finalSha}\n`);
  return 0;
}

async function main() {
  assertBranch();
  if (aezaOnly) {
    if (changedPaths().length > 0) throw new Error('Сначала сохраните или уберите локальные изменения. --aeza-only обновляет уже отправленный коммит.');
    assertFastForward();
    const sha = git(['rev-parse', 'HEAD']).stdout;
    if (!SHA_PATTERN.test(sha)) throw new Error('Некорректный коммит.');
    const releaseId = readRelease(root).releaseId;
    try {
      process.exit(await publishAeza(sha, releaseId));
    } catch (error) {
      reportNotPublished(error.message);
      process.exit(2);
    }
  }
  assertNoForbidden(changedPaths());
  const checks = runChecks();
  const used = new Set(readLog(root).releases.map(item => item.releaseId));
  let releaseId = readRelease(root).releaseId;
  if (used.has(releaseId)) releaseId = nextReleaseId(used);
  applyReleaseId(root, releaseId);
  record(releaseId, {
    recordedAt: new Date().toISOString(),
    checks,
    publications: { githubPages: 'pending', aeza: 'pending' },
    deployedCommit: '',
    aezaReason: '',
    note: 'Номер релиза виден в жёлтой плашке. GitHub Pages хранит проект в браузере. AEZA хранит проекты в SQLite и не заменяет их демонстрационными данными.',
  });
  commitIfNeeded(
    `release: ${releaseId}`,
    'Фиксирует номер релиза, журнал публикации и обновление AEZA без замены данных сервера.',
  );
  const sha = push();
  try {
    process.exit(await publishAeza(sha, releaseId));
  } catch (error) {
    reportNotPublished(error.message);
    process.exit(2);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
