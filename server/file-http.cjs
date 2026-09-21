const crypto = require('node:crypto');
const {
  MAX_FILE_BYTES, MAX_FILES_PER_PROJECT, PROJECT_ID_PATTERN, OBJECT_ID_PATTERN,
  PDF_MEDIA_TYPE, DOCX_MEDIA_TYPE,
} = require('./config.cjs');
const { StorageError } = require('./project-repository.cjs');
const { detectMediaType, parseDocument } = require('./import/explicit-text.cjs');

const ALLOWED_MEDIA = new Set([PDF_MEDIA_TYPE, DOCX_MEDIA_TYPE]);

function sanitizeOriginalName(raw, mediaType) {
  const fallback = mediaType === DOCX_MEDIA_TYPE ? 'upload.docx' : 'upload.pdf';
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  if (raw.includes('..') || raw.includes('\0') || raw.includes(':')) return fallback;
  const trimmed = raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255);
  const base = trimmed.split(/[/\\]/).pop() || fallback;
  if (!base || base === '.' || /[/\\]/.test(base)) return fallback;
  return base.slice(0, 255);
}

function downloadFilename(originalName, mediaType) {
  const ext = mediaType === DOCX_MEDIA_TYPE ? 'docx' : 'pdf';
  const ascii = String(originalName || 'upload')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);
  if (!ascii || ascii === '_') return `upload.${ext}`;
  if (/\.(pdf|docx)$/i.test(ascii)) return ascii;
  return `${ascii}.${ext}`;
}

function previewPayload(record, preview) {
  return {
    ok: true,
    objectId: record.objectId,
    projectId: record.projectId,
    bytes: record.bytes,
    sha256: record.sha256,
    mediaType: record.mediaType,
    originalName: record.originalName,
    status: record.status,
    createdAt: record.createdAt,
    preview,
  };
}

function createFileHandlers({
  fail,
  validLocalAuthority,
  parseBearerToken,
  timingSafeHashEqual,
  capabilityHash,
  projectRepository,
  fileStore,
  fileMeta,
}) {
  function authorize(req, res, projectId) {
    if (!validLocalAuthority(req)) {
      fail(res, 403, 'origin_forbidden');
      return null;
    }
    const token = parseBearerToken(req);
    if (!token) {
      fail(res, 401, 'capability_required');
      return null;
    }
    let record;
    try {
      record = projectRepository.getProject({ projectId });
    } catch (error) {
      if (error instanceof StorageError) {
        fail(res, 503, 'storage_unavailable');
        return null;
      }
      fail(res, 503, 'storage_unavailable');
      return null;
    }
    if (!record || !timingSafeHashEqual(record.capabilityHash, capabilityHash(projectId, token))) {
      fail(res, 404, 'not_found');
      return null;
    }
    return record;
  }

  function sendBlob(res, method, record, bytes) {
    const filename = downloadFilename(record.originalName, record.mediaType);
    res.writeHead(200, {
      'Content-Type': record.mediaType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Length': bytes.length,
    });
    res.end(method === 'HEAD' ? undefined : bytes);
  }

  function readFileBody(req, res, onBody) {
    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MEDIA.has(contentType)) {
      fail(res, 415, 'unsupported_media_type');
      return;
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
      fail(res, 413, 'body_too_large');
      return;
    }
    const chunks = [];
    let bytes = 0;
    let finished = false;
    req.on('data', chunk => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) {
        finished = true;
        chunks.length = 0;
        fail(res, 413, 'body_too_large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      onBody(Buffer.concat(chunks), contentType);
    });
  }

  function handleUpload(req, res, projectId) {
    if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
    if (!authorize(req, res, projectId)) return;
    readFileBody(req, res, (body, contentType) => {
      const detected = detectMediaType(body, contentType);
      if (!detected) return fail(res, 422, 'invalid_file');
      const originalName = sanitizeOriginalName(req.headers['x-smetacraft-filename'], detected);
      const sha256 = crypto.createHash('sha256').update(body).digest('hex');
      const now = new Date().toISOString();
      try {
        const existing = fileMeta.findBySha256({ projectId, sha256 });
        if (existing) {
          const bytes = fileStore.read(existing.objectId);
          const preview = parseDocument(bytes, existing.mediaType);
          return sendJson(res, 200, previewPayload(existing, preview));
        }
        if (fileMeta.countByProject({ projectId }) >= MAX_FILES_PER_PROJECT) {
          return fail(res, 409, 'file_limit_exceeded');
        }
        const objectId = crypto.randomBytes(16).toString('hex');
        fileStore.writeAtomic(objectId, body);
        let record;
        try {
          record = fileMeta.insertFileObject({
            objectId,
            projectId,
            originalName,
            mediaType: detected,
            bytes: body.length,
            sha256,
            status: 'quarantine',
            now,
          });
        } catch (error) {
          fileStore.remove(objectId);
          throw error;
        }
        let preview;
        try {
          preview = parseDocument(body, detected);
        } catch {
          fileMeta.updateStatus({ objectId, projectId, status: 'rejected', now: new Date().toISOString() });
          fileStore.remove(objectId);
          return fail(res, 422, 'invalid_file');
        }
        record = fileMeta.updateStatus({
          objectId, projectId, status: 'validated', now: new Date().toISOString(),
        });
        sendJson(res, 201, previewPayload(record, preview));
      } catch (error) {
        if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
        return fail(res, 503, 'storage_unavailable');
      }
    });
  }

  function sendJson(res, status, value) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(value));
  }

  function handleGetBlob(req, res, projectId, objectId) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method_not_allowed');
    if (!authorize(req, res, projectId)) return;
    try {
      const record = fileMeta.getFileObject({ objectId, projectId });
      if (!record || record.status === 'rejected') return fail(res, 404, 'not_found');
      const bytes = fileStore.read(objectId);
      sendBlob(res, req.method, record, bytes);
    } catch (error) {
      if (error && error.code === 'ENOENT') return fail(res, 404, 'not_found');
      if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
      return fail(res, 503, 'storage_unavailable');
    }
  }

  function handlePreview(req, res, projectId, objectId) {
    if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
    if (!authorize(req, res, projectId)) return;
    try {
      const record = fileMeta.getFileObject({ objectId, projectId });
      if (!record || record.status === 'rejected') return fail(res, 404, 'not_found');
      const bytes = fileStore.read(objectId);
      const preview = parseDocument(bytes, record.mediaType);
      sendJson(res, 200, previewPayload(record, preview));
    } catch (error) {
      if (error && error.code === 'ENOENT') return fail(res, 404, 'not_found');
      if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
      return fail(res, 422, 'invalid_file');
    }
  }

  function handleApply(req, res, projectId, objectId) {
    if (req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
    if (!authorize(req, res, projectId)) return;
    try {
      const record = fileMeta.getFileObject({ objectId, projectId });
      if (!record || record.status === 'rejected') return fail(res, 404, 'not_found');
      const updated = fileMeta.updateStatus({
        objectId, projectId, status: 'available', now: new Date().toISOString(),
      });
      sendJson(res, 200, {
        ok: true,
        objectId: updated.objectId,
        status: updated.status,
      });
    } catch (error) {
      if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
      return fail(res, 503, 'storage_unavailable');
    }
  }

  function handleList(req, res, projectId) {
    if (req.method !== 'GET') return fail(res, 405, 'method_not_allowed');
    if (!authorize(req, res, projectId)) return;
    try {
      const files = fileMeta.listByProject({ projectId }).map(record => ({
        objectId: record.objectId,
        originalName: record.originalName,
        mediaType: record.mediaType,
        bytes: record.bytes,
        sha256: record.sha256,
        status: record.status,
        createdAt: record.createdAt,
      }));
      sendJson(res, 200, { ok: true, files });
    } catch (error) {
      if (error instanceof StorageError) return fail(res, 503, 'storage_unavailable');
      return fail(res, 503, 'storage_unavailable');
    }
  }

  function tryHandle(req, res, pathname) {
    const listMatch = pathname.match(/^\/api\/projects\/([0-9a-f]{32})\/files$/);
    if (listMatch) {
      if (!PROJECT_ID_PATTERN.test(listMatch[1])) {
        fail(res, 404, 'not_found');
        return true;
      }
      if (req.method === 'POST') handleUpload(req, res, listMatch[1]);
      else handleList(req, res, listMatch[1]);
      return true;
    }
    const fileMatch = pathname.match(/^\/api\/projects\/([0-9a-f]{32})\/files\/([0-9a-f]{32})(?:\/(preview|apply))?$/);
    if (!fileMatch) return false;
    if (!PROJECT_ID_PATTERN.test(fileMatch[1]) || !OBJECT_ID_PATTERN.test(fileMatch[2])) {
      fail(res, 404, 'not_found');
      return true;
    }
    const projectId = fileMatch[1];
    const objectId = fileMatch[2];
    const action = fileMatch[3];
    if (action === 'preview') {
      handlePreview(req, res, projectId, objectId);
      return true;
    }
    if (action === 'apply') {
      handleApply(req, res, projectId, objectId);
      return true;
    }
    handleGetBlob(req, res, projectId, objectId);
    return true;
  }

  return { tryHandle };
}

module.exports = { createFileHandlers, sanitizeOriginalName, downloadFilename };
