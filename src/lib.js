const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const homedir = require('home-dir');
const yargs = require('yargs');
const { session, BrowserWindow } = require('electron');
const { parseStringPromise } = require('xml2js');
const { normalize, stripPrefix } = require('xml2js/lib/processors');
const STS = require('aws-sdk/clients/sts');
const Promise = require('bluebird');

const awsSamlPage = 'https://signin.aws.amazon.com/saml';
const awsRoleAttributeName = 'https://aws.amazon.com/SAML/Attributes/Role';
const windowSettings = { width: 450, height: 600, title: 'Sign In' };
const timeout = 5000;

/* istanbul ignore next - Process command line arguments */
function getArgs () {
  return (yargs
    .option('url', { alias: 'u', type: 'string', description: 'URL that starts your single-sign on process to AWS in the browser (or set AWS_CREDFUL_URL)' })
    .option('output', { alias: 'o', type: 'array', description: '<profile name>:<role arn> - you can specify this argument multiple times for multiple profiles' })
    .option('all', { type: 'boolean', description: 'Instead of outputs, save all roles, using role name as profile name. Does not dedupe role names' })
    .option('list-roles', { type: 'boolean', description: 'Just list the available roles and quit' })
    .option('hours', { type: 'integer', description: 'Duration in hours to request from STS', default: 1 })
    .conflicts('list-roles', 'all')
    .conflicts('list-roles', 'output')
    .conflicts('all', 'output')
    .alias('h', 'help')
    .strict()
    .parse());
}

/* Get STS credentials for all of the outputs based on the same samlResponse and save them all to profiles */
async function obtainAllCredentials (roles, outputs, samlResponse, hours) {
  const sts = new STS({ connectTimeout: timeout, timeout });
  await Promise.map(outputs, async ({ role, profile }) => {
    try {
      const roleObj = roles.find(x => x.roleArn === role);
      if (!roleObj) {
        console.error(`Cannot assume role ${role}`);
        return;
      }
      const options = {
        PrincipalArn: roleObj.principalArn,
        RoleArn: roleObj.roleArn,
        SAMLAssertion: samlResponse,
        DurationSeconds: hours * 3600
      };
      const creds = (await sts.assumeRoleWithSAML(options).promise()).Credentials;
      await saveProfile(profile, creds.AccessKeyId, creds.SecretAccessKey, creds.SessionToken);
      console.error(`Saved profile ${profile}`);
    } catch (err) /* istanbul ignore next - just error skipping */ {
      console.error(`${profile}: ${err.message}`);
    }
  }, { concurrency: 5 });
}

/* Save AWS credentials to a named profile in the ~/.aws/credentials file */
function saveProfile (profileName, accessKey, secretKey, sessionToken) {
  const awsPath = path.join(homedir(), '.aws');
  try {
    fs.mkdirSync(awsPath);
  } catch (err) /* istanbul ignore next - just error propagation */ {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
  const credentialsPath = path.join(awsPath, 'credentials');
  let config = {};
  try {
    config = ini.parse(fs.readFileSync(credentialsPath, 'utf-8'));
  } catch (err) /* istanbul ignore next - just error propagation */ {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  config[profileName] = Object.assign({}, config[profileName], {
    aws_access_key_id: accessKey,
    aws_secret_access_key: secretKey,
    aws_session_token: sessionToken
  });
  fs.writeFileSync(credentialsPath, ini.stringify(config));
}

/* Pop up a browser window with the startUrl and capture the SAMLResponse to AWS. */
async function obtainSaml (startUrl) {
  const window = new BrowserWindow(windowSettings);
  window.loadURL(startUrl);
  return new Promise((resolve, reject) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: [awsSamlPage] }, (page, cancel) => {
      try {
        const data = querystring.parse(page.uploadData[0].bytes.toString());
        cancel({ cancel: true });
        resolve(data.SAMLResponse);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/* Parse a base64-encoded SAML response and extract objects of { roleArn, principalArn } from
the Role attributes, representing all the AWS roles that the user could assume */
async function listRoles (samlResponse) {
  const decoded = Buffer.from(samlResponse, 'base64').toString();
  const parsed = await parseStringPromise(decoded, { tagNameProcessors: [normalize, stripPrefix] });
  const attributes = parsed.response.assertion[0].attributestatement[0].attribute;
  const roleAttribute = attributes.find(x => x.$.Name === awsRoleAttributeName);
  /* istanbul ignore next - just a top level error */
  if (!roleAttribute) {
    throw new Error('No roles found');
  }
  const roles = roleAttribute.attributevalue.map(attr => {
    const [roleArn, principalArn] = attr._.split(',');
    return { roleArn, principalArn };
  });
  return roles;
}

module.exports = {
  getArgs,
  obtainAllCredentials,
  saveProfile,
  obtainSaml,
  listRoles
};
