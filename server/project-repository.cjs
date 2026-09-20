class ConflictError extends Error {
  constructor() {
    super('idempotency_key_conflict');
    this.name = 'ConflictError';
  }
}

class StorageError extends Error {
  constructor(cause) {
    super('storage_unavailable');
    this.name = 'StorageError';
    this.cause = cause;
  }
}

function createProjectRepository(options = {}) {
  const { createSqliteProjectRepository } = require('./sqlite-project-repository.cjs');
  return createSqliteProjectRepository(options);
}

module.exports = {
  ConflictError,
  StorageError,
  createProjectRepository,
};
