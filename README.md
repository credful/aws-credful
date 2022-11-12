# AWS CLI creds from any IDP: `aws-credful`

This tool, `aws-credful`, makes it easy to obtain AWS CLI credentials from web browser single sign-on (SSO). Unlike similar tools that support a single identity provider (IDP) such as Microsoft ADFS or Okta, `aws-credful` opens a web browser popup and lets you use any IDP that your organization has connected to your AWS accounts. Multiple AWS accounts and roles are also supported (as long as they are set up properly in your IDP).

# Installation

```
npm install --global aws-credful
```

# Usage

```
Options:
  --version     Show version number                                    [boolean]
  --url, -u     URL that starts your single-sign on process to AWS in the
                browser (or set AWS_CREDFUL_URL)                           [string]
  --output, -o  <profile name>:<role arn> - you can specify this argument
                multiple times for multiple profiles                     [array]
  --all         Instead of outputs, save all roles, using role name as profile
                name. Does not dedupe role names                       [boolean]
  --list-roles  Just list the available roles and quit                 [boolean]
  --hours       Duration in hours to request from STS               [default: 1]
  -h, --help    Show help                                              [boolean]
```

## Finding the URL

The `--url` paramter requires the URL you would go to in your browser for an identity provider (IDP) initiated login to AWS. Generally, you would find this by going to the "apps" screen your IDP offers and copying the URL from the link to AWS.

If you select AWS from a drop-down during the single sign-on process (as in some ADFS setups), specify the generic single sign-on URL, and you'll have to select AWS from the dropdown during the login process each time.

# Why Electron?

In the past, I've both built and used CLIs for this purpose that make direct HTTP requests to the IDP, parse HTML, and interact directly with the login and MFA forms. Although this approach is widely used and officially recommended on the AWS blog, it's fragile, hard to adapt to MFA and Captchas, and entirely IDP-specific.

By popping up a browser window from the CLI, we bypass nearly all of the fragility and just let the browser-based login process be what it wants to be: a browser-based login process.

We also get free cookies (meaning, we're not starting a new blank session every time and can take advantage of session cookies for re-logins). This is especially helpful with G Suite, since it can add a Captcha and email you every time you log into using an unfamiliar device (i.e. one with no cookies). Cookie duration is of course subject to your IDP's limits, just as it would be in a regular web browser.

# Version support

Node 14-18.

# Maintainers

* [Jason Stitt](https://github.com/jasonstitt)
