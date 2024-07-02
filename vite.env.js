import fs from 'fs';
import path from 'path';

const browserVendor = process.argv[2];
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

const semverRegex = /^(\d+\.\d+\.\d+)(-.+)?$/;
const matches = packageJson.version.match(semverRegex);

const buildVersion = matches[1];
const buildVersionName = matches[0];

const env = {
  VITE_BROWSER_VENDOR: browserVendor,
  VITE_BUILD_TIMESTAMP: Date.now(),
  VITE_BUILD_VERSION: buildVersion,
  VITE_BUILD_VERSION_NAME: buildVersionName,
  VITE_DEVELOPMENT_MODE: process.env.NODE_ENV !== 'production',
};

const content = Object.entries(env)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

fs.writeFileSync(path.resolve(process.cwd(), `.env.${browserVendor}`), content);
