const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { OBJECT_ID_PATTERN, BLOB_ROOT } = require('./config.cjs');

function assertObjectId(objectId) {
  if (typeof objectId !== 'string' || !OBJECT_ID_PATTERN.test(objectId)) {
    throw new Error('invalid_object_id');
  }
}

function createFileStore(options = {}) {
  const root = options.blobRoot || BLOB_ROOT;
  fs.mkdirSync(root, { recursive: true });

  function pathFor(objectId) {
    assertObjectId(objectId);
    return path.join(root, objectId);
  }

  function writeAtomic(objectId, bytes) {
    assertObjectId(objectId);
    if (!Buffer.isBuffer(bytes)) throw new Error('bytes_required');
    const dest = pathFor(objectId);
    const tmp = path.join(root, `.tmp-${objectId}-${crypto.randomBytes(8).toString('hex')}`);
    try {
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, dest);
      try {
        const dirFd = fs.openSync(root, 'r');
        try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
      } catch {
        // Directory fsync is best-effort on filesystems that reject it.
      }
      return dest;
    } catch (error) {
      try { fs.unlinkSync(tmp); } catch {}
      throw error;
    }
  }

  function read(objectId) {
    return fs.readFileSync(pathFor(objectId));
  }

  function remove(objectId) {
    try {
      fs.unlinkSync(pathFor(objectId));
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
  }

  function exists(objectId) {
    return fs.existsSync(pathFor(objectId));
  }

  function cleanupTemps() {
    for (const name of fs.readdirSync(root)) {
      if (name.startsWith('.tmp-')) {
        try { fs.unlinkSync(path.join(root, name)); } catch {}
      }
    }
  }

  return { root, pathFor, writeAtomic, read, remove, exists, cleanupTemps };
}

module.exports = { createFileStore, assertObjectId };
