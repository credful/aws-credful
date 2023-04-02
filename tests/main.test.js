const test = require('ava');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const sinon = require('sinon');

test.before(() => {
  process.env = {};
});

test.beforeEach(t => {
  t.context.lib = {
    getArgs: sinon.stub(),
    obtainSaml: sinon.stub().resolves(''),
    listRoles: sinon.stub(),
    getConfig: sinon.stub(),
    obtainAllCredentials: sinon.stub(),
    getDefaultRegion: sinon.stub(),
  };
  t.context.stubs = {
    electron: {
      app: {
        quit: sinon.spy()
      }
    },
    './lib': t.context.lib
  };
  t.context.main = proxyquire('../src/index', t.context.stubs).main;
});

test('requires a url', async t => {
  t.context.lib.getArgs.returns({});
  await t.context.main();
  t.truthy(t.context.stubs.electron.app.quit.called);
  t.falsy(t.context.lib.obtainSaml.called);
});

test('lists roles', async t => {
  t.context.lib.getArgs.returns({ url: 'https://example.com', listRoles: true });
  t.context.lib.listRoles.returns([{ roleArn: 'XXX', principalArn: 'YYY' }]);
  await t.context.main();
  t.truthy(t.context.stubs.electron.app.quit.called);
  t.truthy(t.context.lib.listRoles.called);
});

test('exist if no outputs', async t => {
  t.context.lib.getArgs.returns({ url: 'https://example.com' });
  t.context.lib.listRoles.returns([{ roleArn: 'XXX', principalArn: 'YYY' }]);
  await t.context.main();
  t.truthy(t.context.stubs.electron.app.quit.called);
  t.falsy(t.context.lib.obtainAllCredentials.called);
});

test('outputs specified roles', async t => {
  t.context.lib.getArgs.returns({ url: 'https://example.com', output: ['profile:XXX'], hours: 1, region: 'us-east-1' });
  t.context.lib.listRoles.returns([{ roleArn: 'XXX', principalArn: 'YYY' }]);
  await t.context.main();
  t.truthy(t.context.stubs.electron.app.quit.called);
  t.truthy(t.context.lib.obtainAllCredentials.called);
  t.deepEqual(t.context.lib.obtainAllCredentials.firstCall.args, [
    [{ roleArn: 'XXX', principalArn: 'YYY' }],
    [{ role: 'XXX', profile: 'profile' }],
    '',
    1,
    'us-east-1'
  ]);
});

test('outputs all roles', async t => {
  t.context.lib.getArgs.returns({ url: 'https://example.com', all: true, hours: 1, region: 'us-east-1' });
  t.context.lib.listRoles.returns([{ roleArn: 'role/XXX', principalArn: 'YYY' }, { roleArn: 'role/AAA', principalArn: 'BBB' }]);
  await t.context.main();
  t.truthy(t.context.stubs.electron.app.quit.called);
  t.truthy(t.context.lib.obtainAllCredentials.called);
  t.deepEqual(t.context.lib.obtainAllCredentials.firstCall.args, [
    [{ roleArn: 'role/XXX', principalArn: 'YYY' }, { roleArn: 'role/AAA', principalArn: 'BBB' }],
    [{ role: 'role/XXX', profile: 'XXX' }, { role: 'role/AAA', profile: 'AAA' }],
    '',
    1,
    'us-east-1'
  ]);
});
