const { createSqliteFileMetadataRepository } = require('./sqlite-file-metadata-repository.cjs');

function createFileMetadataRepository(options = {}) {
  return createSqliteFileMetadataRepository(options);
}

module.exports = { createFileMetadataRepository };
