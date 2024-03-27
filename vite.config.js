/* eslint-disable comma-dangle */
import copy from 'rollup-plugin-copy';
import dotenv from 'dotenv';
import inject from '@rollup/plugin-inject';
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import * as rimraf from 'rimraf';
import { defineConfig } from 'vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const parser = require('@babel/parser');
const traverse = require('@babel/traverse');
const generate = require('@babel/generator');

export default defineConfig(({ mode }) => {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(`Loading env from .env.${mode}`);

  dotenv.config({ path: path.resolve(process.cwd(), `.env.${mode}`) });

  const buildEntry = process.env.BUILD_ENTRY;
  const browserVendor = process.env.VITE_BROWSER_VENDOR;

  console.log(`Building ${buildEntry} for ${browserVendor}...`);

  const paths = {
    about: { input: 'about/index.html' },
    content: { input: 'content/main.js' },
    json: { input: 'json/index.html' },
    options: { input: 'options/index.html' },
    main: { input: `main/main-${browserVendor}.js`, copyPublicDir: true },
    popup: { input: 'popup/index.html' },
  };

  if (!Object.prototype.hasOwnProperty.call(paths, buildEntry)) {
    throw new Error(`Invalid entry: ${buildEntry}`);
  }

  const viteConfig = {
    build: {
      assetsDir: '.', // relative to outDir
      outDir: `dist/${browserVendor}`,
      copyPublicDir: paths[buildEntry].copyPublicDir || false,
      minify: isProduction ? 'terser' : false,
      plugins: [
        inject({
          $: 'jquery',
          jQuery: 'jquery'
        })
      ],
      rollupOptions: {
        input: `src/${paths[buildEntry].input}`,
        output: {
          dir: `dist/${browserVendor}/${buildEntry}`,
          format: 'es',
          inlineDynamicImports: false,
          entryFileNames: '[name]/index.js',
          chunkFileNames: 'chunks/[name].js',
        },
      },
      sourcemap: true,
      target: 'es2020',
    },
    plugins: [
      copy({
        targets: [
          {
            src: 'src/browser.js',
            dest: `dist/${browserVendor}`,
            rename: 'scripts/browser.js',
          },
        ],
        hook: 'writeBundle', // run the plugin at the end of bundling
      }),
      {
        name: 'rename-main-service',
        generateBundle(options, bundle) {
          if (buildEntry !== 'main') return; // Only process the main entry

          console.log(`Renaming service_worker for ${browserVendor}... `);

          const manifestPath = path.resolve(
            __dirname,
            `src/main/manifest-${browserVendor}.json`,
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const mainRegex = new RegExp('^main-.*.js$');

          Object.keys(bundle).forEach((name) => {
            const file = bundle[name];

            console.log(`Processing ${file.fileName}...`);

            if (mainRegex.test(file.fileName)) {
              // Update the manifest with the new service worker file name
              console.log(`Updating manifest for ${file.fileName}...`);
              manifest.background.service_worker = file.fileName;
              manifest.version = process.env.VITE_BUILD_VERSION;
              manifest.version_name = process.env.VITE_BUILD_VERSION_NAME;
            }
          });

          this.emitFile({
            type: 'asset',
            fileName: 'manifest.json',
            source: JSON.stringify(manifest, null, 2),
          });
        },
        writeBundle() {
          if (buildEntry !== 'main') return; // Only process the main entry

          // Move contents of main directory to root
          fse.copySync(path.resolve(__dirname, `dist/${browserVendor}/main`), path.resolve(__dirname, `dist/${browserVendor}`));
          rimraf.sync(path.resolve(__dirname, `dist/${browserVendor}/main`));
        }
      },
      {
        name: 'replace-global-window-with-self',
        apply: 'build',
        renderChunk(code, chunk) {
          if (buildEntry !== 'main') return null; // Only process the main entry

          // Parse the code into an AST
          const ast = parser.parse(code);

          // Traverse the AST and replace global window with self
          traverse.default(ast, {
            // eslint-disable-next-line no-shadow
            enter(path) {
              if (
                path.isIdentifier({ name: 'window' }) &&
                path.scope.hasGlobal('window') &&
                (path.parent.type === 'MemberExpression' || path.parent.type === 'ThisExpression')
              ) {
                path.node.name = 'self';
              }
            },
          });

          // Generate the modified code from the AST
          const { code: newCode, map } = generate.default(ast, {
            sourceMaps: true,
            sourceFileName: chunk.fileName,
          });

          // Return the modified code and source map
          return { code: newCode, map };
        },
      },
      {
        name: 'rename-popup-bundles',
        apply: 'build',
        generateBundle(_, bundle) {
          if (!paths[buildEntry].input.endsWith('.html')) return; // Process only html entry points

          console.log('Reparenting popup bundles ...');
          Object.keys(bundle).forEach((name) => {
            const file = bundle[name];

            console.log(`Processing file: ${file.fileName}, type: ${file.type}, isEntry: ${file.isEntry}...`);

            file.fileName = file.fileName.replace('index/', '');

            console.log(`Reparented to: ${file.fileName}...`);
          });
        },
        writeBundle() {
          console.log(`vendor is  ${browserVendor}...`);
          if (!paths[buildEntry].input.endsWith('.html')) return; // Process only html entry points

          // Move index.html to root and update script source
          const htmlFilePath = path.resolve(__dirname, `dist/${browserVendor}/${buildEntry}/src/${buildEntry}/index.html`);
          let htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
          htmlContent = htmlContent.replace(/"\/(index[^"]*)"/g, '"./$1"');
          fs.writeFileSync(path.resolve(__dirname, `dist/${browserVendor}/${buildEntry}/index.html`), htmlContent);
          fs.unlinkSync(htmlFilePath);

          // Remove src directory
          rimraf.sync(path.resolve(__dirname, `dist/${browserVendor}/${buildEntry}/src`));
        }
      },
      // other plugins...
    ],
    server: {
      watch: {
        // Directories to be watched for changes
        include: ['src', 'public'],
      },
    },
  }; // end of config return

  console.log('Vite config:', JSON.stringify(viteConfig, null, 2));
  return viteConfig;
}); // end of export
