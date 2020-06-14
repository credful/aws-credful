const { app } = require('electron');
const { getArgs, obtainAllCredentials, obtainSaml, listRoles } = require('./lib');

/* istanbul ignore next */
if (app && app.on) {
  app.on('ready', () => main());
}

async function main () {
  try {
    const args = getArgs();

    const startUrl = args.url || process.env.AWS_CREDFUL_URL;
    if (!startUrl) {
      console.error('No URL specified');
      return app.quit();
    }

    const samlResponse = await obtainSaml(startUrl);
    const roles = await listRoles(samlResponse);

    if (args.listRoles) {
      console.log(roles.map(x => x.roleArn).join('\n'));
      return app.quit();
    }

    const outputs = [];
    if (args.output && args.output.length) {
      for (const output of args.output) {
        const [profile, role] = output.split(/:/);
        outputs.push({ profile, role });
      }
    } else if (args.all) {
      for (const { roleArn } of roles) {
        const roleName = roleArn.split('/')[1];
        outputs.push({ profile: roleName, role: roleArn });
      }
    }

    if (!outputs.length) {
      console.error('No outputs specified');
      return app.quit();
    }

    await obtainAllCredentials(roles, outputs, samlResponse, args.hours);
    app.quit();
  } catch (err) /* istanbul ignore next */ {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { main };
