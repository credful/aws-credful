#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

// Pass through all command line arguments
const args = process.argv.slice(2);

// Find binary paths relative to the installed directory
const electronBin = path.join(process.mainModule.path, 'node_modules', '.bin', 'electron');
const index = path.join(process.mainModule.path, 'src', 'index.js');

// Call through (this is all basically so we can run electron from a 'bin' in package.json)
const result = spawnSync(electronBin, [index, ...args], { env: process.env, stdio: 'inherit' });
process.exit(result.status || result.signal);
