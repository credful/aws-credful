const test = require('ava');
const { listRoles } = require('../src/lib');
const fs = require('fs');
const path = require('path');

const sampleAssertion = fs.readFileSync(path.join(module.path, '/sample-assertion.xml'));
const sampleAssertionBase64 = Buffer.from(sampleAssertion).toString('base64');

test('parses a valid SAMLResponse', async t => {
  const roles = await listRoles(sampleAssertionBase64);
  t.truthy(roles);
  t.deepEqual(roles, [
    {
      roleArn: 'arn:aws:iam::111:role/XXX',
      principalArn: 'arn:aws:iam::111:saml-provider/XXX'
    }
  ]);
});
