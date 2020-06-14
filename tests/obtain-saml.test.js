const test = require('ava');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const sinon = require('sinon');

test.beforeEach(t => {
  t.context.electron = {
    app: {},
    session: { defaultSession: { webRequest: {} } },
    BrowserWindow: function () {}
  };
  t.context.onBeforeRequest = t.context.electron.session.defaultSession.webRequest.onBeforeRequest = sinon.spy();
  t.context.loadURL = t.context.electron.BrowserWindow.prototype.loadURL = sinon.spy();
  t.context.obtainSaml = proxyquire('../src/lib', { electron: t.context.electron }).obtainSaml;
});

test('loads a URL and extracts a SAMLResponse from an event', async t => {
  const promise = t.context.obtainSaml('https://example.com');

  t.truthy(t.context.loadURL.called);
  const [startUrl] = t.context.loadURL.firstCall.args;
  t.is(startUrl, 'https://example.com');

  t.truthy(t.context.onBeforeRequest.called);
  const [filter, func] = t.context.onBeforeRequest.firstCall.args;
  t.truthy(filter);
  t.is(typeof func, 'function');

  const samplePage = { uploadData: [{ bytes: 'SAMLResponse=XYZ' }] };
  func(samplePage, () => {});
  t.is(await promise, 'XYZ');
});

test('catches error in event handler', async t => {
  const promise = t.context.obtainSaml('https://example.com');
  const func = t.context.onBeforeRequest.firstCall.args[1];
  const samplePage = { invalid: 'nope' };
  func(samplePage, () => {});
  await t.throwsAsync(promise, { instanceOf: TypeError });
});
