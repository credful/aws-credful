const test = require('ava');
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const sinon = require('sinon');
const path = require('path');
const { EOL } = require('os');

// Create a multi-platform expectation for testing
const expectedCredentialsPath = path.join('/home', '.aws', 'credentials');

function platformEol (str) {
  return str.replace(/\n/g, EOL);
}

test.beforeEach(t => {
  t.context.stubs = {
    fs: {
      readFileSync: sinon.stub(),
      writeFileSync: sinon.spy(),
      mkdirSync: sinon.spy()
    },
    'home-dir': () => '/home',
    'aws-sdk/clients/sts': function () {}
  };
  t.context.assumeRoleWithSAML = t.context.stubs['aws-sdk/clients/sts'].prototype.assumeRoleWithSAML = sinon.stub();
  const lib = proxyquire('../src/lib', t.context.stubs);
  t.context.saveProfile = lib.saveProfile;
  t.context.obtainAllCredentials = lib.obtainAllCredentials;
});

test('creates .aws directory', t => {
  t.context.stubs.fs.readFileSync.returns('');
  t.context.saveProfile('profile', 'key', 'secret', 'token');
  t.truthy(t.context.stubs.fs.mkdirSync.called);
});

test('writes a profile to an empty credentials file', t => {
  t.context.stubs.fs.readFileSync.returns('');
  t.context.saveProfile('profile', 'key', 'secret', 'token');
  const [filename, content] = t.context.stubs.fs.writeFileSync.firstCall.args;
  t.is(filename, expectedCredentialsPath);
  t.is(content, platformEol('[profile]\naws_access_key_id=key\naws_secret_access_key=secret\naws_session_token=token\n'));
});

test('updates an existing profile and leaves extraneous values', t => {
  t.context.stubs.fs.readFileSync.returns(platformEol('[profile]\naws_access_key_id=a\naws_secret_access_key=b\naws_session_token=c\nsomething_else=q\n'));
  t.context.saveProfile('profile', 'key', 'secret', 'token');
  const [filename, content] = t.context.stubs.fs.writeFileSync.firstCall.args;
  t.is(filename, expectedCredentialsPath);
  t.is(content, platformEol('[profile]\naws_access_key_id=key\naws_secret_access_key=secret\naws_session_token=token\nsomething_else=q\n'));
});

test('adds a profile to an existing file', t => {
  const profile1 = platformEol('[other]\naws_access_key_id=a\naws_secret_access_key=b\naws_session_token=c\n');
  t.context.stubs.fs.readFileSync.returns(profile1);
  t.context.saveProfile('profile', 'key', 'secret', 'token');
  const [filename, content] = t.context.stubs.fs.writeFileSync.firstCall.args;
  t.is(filename, expectedCredentialsPath);
  t.is(content, profile1 + platformEol('\n[profile]\naws_access_key_id=key\naws_secret_access_key=secret\naws_session_token=token\n'));
});

test('gets STS credentials', async t => {
  t.context.stubs.fs.readFileSync.returns('');
  t.context.assumeRoleWithSAML.returns({
    promise: () => ({
      Credentials: {
        AccessKeyId: 'key',
        SecretAccessKey: 'secret',
        SessionToken: 'token'
      }
    })
  });
  const roles = [{ roleArn: 'XXX', principalArn: 'YYY' }];
  const outputs = [{ role: 'XXX', profile: 'profile' }];
  const samlResponse = 'SAML';
  const hours = 1;
  await t.context.obtainAllCredentials(roles, outputs, samlResponse, hours);
  const [options] = t.context.assumeRoleWithSAML.firstCall.args;
  const [filename, content] = t.context.stubs.fs.writeFileSync.firstCall.args;
  t.is(options.RoleArn, 'XXX');
  t.is(options.PrincipalArn, 'YYY');
  t.is(options.SAMLAssertion, 'SAML');
  t.is(options.DurationSeconds, 3600);
  t.is(filename, expectedCredentialsPath);
  t.is(content, platformEol('[profile]\naws_access_key_id=key\naws_secret_access_key=secret\naws_session_token=token\n'));
});

test('intersects available and desired roles without error', async t => {
  t.context.stubs.fs.readFileSync.returns('');
  t.context.assumeRoleWithSAML.returns({
    promise: () => ({
      Credentials: {
        AccessKeyId: 'key',
        SecretAccessKey: 'secret',
        SessionToken: 'token'
      }
    })
  });
  const roles = [
    { roleArn: 'XXX', principalArn: 'YYY' },
    { roleArn: 'AAA', principalArn: 'BBB' },
    { roleArn: 'CCC', principalArn: 'DDD' }
  ];
  const outputs = [{ role: 'XXX', profile: 'profile' }, { role: 'NOPE', profile: 'profile2' }];
  const samlResponse = 'SAML';
  const hours = 1;
  await t.context.obtainAllCredentials(roles, outputs, samlResponse, hours);
  const [options] = t.context.assumeRoleWithSAML.firstCall.args;
  const [filename, content] = t.context.stubs.fs.writeFileSync.firstCall.args;
  t.is(options.RoleArn, 'XXX');
  t.is(options.PrincipalArn, 'YYY');
  t.is(options.SAMLAssertion, 'SAML');
  t.is(options.DurationSeconds, 3600);
  t.is(filename, expectedCredentialsPath);
  t.is(content, platformEol('[profile]\naws_access_key_id=key\naws_secret_access_key=secret\naws_session_token=token\n'));
});
