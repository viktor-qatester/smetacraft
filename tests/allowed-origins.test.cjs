const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePublicOrigins, parseBind, createAuthorityChecker, DEFAULT_BIND, PUBLIC_BIND,
} = require('../server/allowed-origins.cjs');

test('parsePublicOrigins keeps http Fornex hosts and drops junk', () => {
  assert.deepEqual(parsePublicOrigins(''), []);
  assert.deepEqual(
    parsePublicOrigins('http://31.172.78.193,http://333428.fornex.cloud'),
    ['http://31.172.78.193', 'http://333428.fornex.cloud'],
  );
  assert.deepEqual(parsePublicOrigins('ftp://31.172.78.193, not-a-url'), []);
  assert.deepEqual(parsePublicOrigins('http://31.172.78.193/secret'), []);
});

test('parseBind allows only loopback or all-interfaces', () => {
  assert.equal(parseBind(undefined), DEFAULT_BIND);
  assert.equal(parseBind(''), DEFAULT_BIND);
  assert.equal(parseBind('127.0.0.1'), DEFAULT_BIND);
  assert.equal(parseBind(PUBLIC_BIND), PUBLIC_BIND);
  assert.equal(parseBind('1.2.3.4'), null);
  assert.equal(parseBind('::'), null);
});

test('authority checker forbids GitHub Pages and allows configured public origin', () => {
  const check = createAuthorityChecker(['http://31.172.78.193', 'http://333428.fornex.cloud']);
  const loopbackReq = {
    socket: { localPort: 8000 },
    headers: { host: '127.0.0.1:8000', origin: 'http://127.0.0.1:8000' },
  };
  assert.equal(check(loopbackReq), true);
  assert.equal(check({
    socket: { localPort: 8000 },
    headers: { host: '31.172.78.193', origin: 'http://31.172.78.193' },
  }), true);
  assert.equal(check({
    socket: { localPort: 8000 },
    headers: { host: 'viktor-qatester.github.io', origin: 'https://viktor-qatester.github.io' },
  }), false);
  assert.equal(check({
    socket: { localPort: 8000 },
    headers: { host: '31.172.78.193', origin: 'https://viktor-qatester.github.io' },
  }), false);
});
