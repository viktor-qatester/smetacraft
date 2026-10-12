const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { SHA_PATTERN, RELEASE_ID_PATTERN } = require('./release-lib.cjs');

const NOT_PUBLISHED = 'В GitHub сохранено, на AEZA не опубликовано';
const FINISH_COMMAND = 'node scripts/publish.cjs --aeza-only';
const BACKUP_ROOT = '/srv/vic-workspace/backups/smetacraft';

function loadLocalEnv(root) {
  const filename = path.join(root, 'deploy', 'aeza.local.env');
  if (!fs.existsSync(filename)) return null;
  const values = {};
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

function sshArgs(target, identity) {
  const args = [
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=20',
  ];
  if (identity) args.push('-i', identity);
  args.push(target);
  return args;
}

function finishChild(child, name, settled, state) {
  if (settled[name]) return;
  settled[name] = true;
  state.left -= 1;
  if (state.left === 0) state.resolve(state.failed ? 1 : 0);
}

function uploadArchive(root, target, identity, sha) {
  const remote = `mkdir -p ${BACKUP_ROOT} && cat > ${BACKUP_ROOT}/incoming-${sha}.tar`;
  return new Promise((resolve) => {
    const state = { failed: false, left: 2, resolve };
    const settled = { archive: false, ssh: false };
    const ssh = spawn('ssh', [...sshArgs(target, identity), remote], { stdio: ['pipe', 'inherit', 'inherit'] });
    const archive = spawn('git', ['archive', '--format=tar', sha], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    archive.stdout.pipe(ssh.stdin);
    archive.on('close', (code) => {
      if (code !== 0) state.failed = true;
      finishChild(archive, 'archive', settled, state);
    });
    ssh.on('close', (code) => {
      if (code !== 0) state.failed = true;
      finishChild(ssh, 'ssh', settled, state);
    });
    archive.on('error', () => {
      state.failed = true;
      finishChild(archive, 'archive', settled, state);
    });
    ssh.on('error', () => {
      state.failed = true;
      finishChild(ssh, 'ssh', settled, state);
    });
  });
}

function runRemote(root, target, identity, sha, releaseId) {
  const script = fs.readFileSync(path.join(root, 'scripts', 'aeza-remote.sh'), 'utf8').replace(/\r\n/g, '\n');
  return new Promise((resolve) => {
    const ssh = spawn('ssh', [...sshArgs(target, identity), 'bash', '-s', '--', sha, releaseId], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    ssh.stdin.write(script);
    ssh.stdin.end();
    ssh.on('close', (code) => resolve(code ?? 1));
    ssh.on('error', () => resolve(1));
  });
}

async function deployRelease({ root, sha, releaseId }) {
  if (!SHA_PATTERN.test(sha) || !RELEASE_ID_PATTERN.test(releaseId)) {
    return { ok: false, reason: 'bad-id' };
  }
  const env = loadLocalEnv(root);
  const target = env && env.AEZA_SSH_TARGET;
  if (!target || target.includes('ПОЛЬЗОВАТЕЛЬ')) {
    return { ok: false, reason: 'no-access' };
  }
  const identity = env.AEZA_SSH_IDENTITY || '';
  const uploaded = await uploadArchive(root, target, identity, sha);
  if (uploaded !== 0) return { ok: false, reason: 'upload' };
  const code = await runRemote(root, target, identity, sha, releaseId);
  return { ok: code === 0, reason: code === 0 ? 'ok' : 'remote' };
}

module.exports = {
  deployRelease,
  NOT_PUBLISHED,
  FINISH_COMMAND,
  loadLocalEnv,
};
