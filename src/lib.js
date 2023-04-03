const querystring = require('querystring');
const fs = require('fs');
const path = require('path');
const ini = require('ini');
const homedir = require('home-dir');
const yargs = require('yargs');
const { session, BrowserWindow } = require('electron');
const { parseStringPromise } = require('xml2js');
const { normalize, stripPrefix } = require('xml2js/lib/processors');
const { STS } = require('@aws-sdk/client-sts');
const { loadSharedConfigFiles } = require('@aws-sdk/shared-ini-file-loader');
const Promise = require('bluebird');
const awsSamlPage = 'https://signin.aws.amazon.com/saml';
const awsRoleAttributeName = 'https://aws.amazon.com/SAML/Attributes/Role';
const windowSettings = { width: 450, height: 600, title: 'Sign In', webPreferences: { contextIsolation: true } };
const timeout = 5000;

/* istanbul ignore next - Process command line arguments */
function getArgs () {
  return (yargs
    .option('url', { alias: 'u', type: 'string', description: 'URL that starts your single-sign on process to AWS in the browser (or set AWS_CREDFUL_URL)' })
    .option('region', { alias: 'r', type: 'string', description: 'AWS region to use for STS requests. Falls back to AWS_REGION, default profile, then us-east-1.' })
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

/* Retrieve a profile from AWS' credentials INI file with some credentials added. */
function getModifiedConfig ({ profileName, accessKey, secretKey, sessionToken }) {
  const awsPath = path.join(homedir(), '.aws');
  try {
    fs.mkdirSync(awsPath);
  } catch (err) /* istanbul ignore next - just error propagation */ {
    if (err.code !== 'EEXIST') {
      console.log('error', err);
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
  const profileCredentials = {
    aws_access_key_id: accessKey,
    aws_secret_access_key: secretKey,
    aws_session_token: sessionToken
  };
  config[profileName] = Object.assign({}, config[profileName], profileCredentials);
  return { config, credentialsPath };
}

/* Get the region from the standard env var or config file used by the AWS SDK/CLI, but allow an undefined
result that must be defaulted elsewhere. */
async function getDefaultRegion () {
  if (process.env.AWS_REGION) {
    return process.env.AWS_REGION;
  }
  const { configFile } = await loadSharedConfigFiles();
  return configFile?.default?.region;
}

/* Get STS credentials for all of the outputs based on the same samlResponse and save them all to profiles */
async function obtainAllCredentials (roles, outputs, samlResponse, hours, region) {
  const sts = new STS({ connectTimeout: timeout, timeout, region });
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
      const creds = (await sts.assumeRoleWithSAML(options)).Credentials;
      await saveProfile(profile, creds.AccessKeyId, creds.SecretAccessKey, creds.SessionToken);
      console.error(`Saved profile ${profile}`);
    } catch (err) /* istanbul ignore next - just error skipping */ {
      console.error(`${profile}: ${err.message}`);
    }
  }, { concurrency: 5 });
}

/* Save AWS credentials to a named profile in the ~/.aws/credentials file */
function saveProfile (profileName, accessKey, secretKey, sessionToken) {
  const { config, credentialsPath } = getModifiedConfig({ profileName, accessKey, secretKey, sessionToken });
  fs.writeFileSync(credentialsPath, ini.stringify(config));
}

/* Pop up a browser window with the startUrl and capture the SAMLResponse to AWS. */
async function obtainSaml (startUrl) {
  const window = new BrowserWindow(windowSettings);
  window.loadURL(startUrl, { userAgent: 'Chrome' });
  return new Promise((resolve, reject) => {
    session.defaultSession.webRequest.onBeforeRequest({ urls: [awsSamlPage] }, (page, cancel) => {
      try {
        const data = querystring.parse(page.uploadData[0].bytes.toString());
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
  getDefaultRegion,
  saveProfile,
  obtainSaml,
  listRoles
};
