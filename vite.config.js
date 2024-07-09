/* eslint-disable no-unused-vars */
/* eslint-disable no-cond-assign */
/* eslint-disable comma-dangle */
import copy from 'rollup-plugin-copy';
import dotenv from 'dotenv';
import inject from '@rollup/plugin-inject';
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import * as rimraf from 'rimraf';
import { defineConfig } from 'vite';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import MagicString from 'magic-string';

export default defineConfig(({ mode }) => {
  const isProduction = process.env.NODE_ENV === 'production';

  console.log(`Loading env from .env.${mode}`);

  dotenv.config({ path: path.resolve(process.cwd(), `.env.${mode}`) });

  const browserVendor = process.env.VITE_BROWSER_VENDOR;

  const buildEntries = [
    { root: 'about', input: 'index.html' },
    { root: 'content', input: 'main.js' },
    { root: 'json', input: 'index.html' },
    { root: 'options', input: 'index.html' },
    { root: 'main', input: `main-${browserVendor}.js`, copyPublicDir: true },
    { root: 'popup', input: 'index.html' },
    { root: 'es-reindex', input: 'index.html' },
  ];

  const buildEntryByRoot = buildEntries.reduce((acc, entry) => {
    acc[entry.root] = entry;
    return acc;
  }, {});

  const buildEntry = buildEntryByRoot[process.env.BUILD_ENTRY];
  if (!buildEntry) {
    throw new Error(`Invalid entry: ${process.env.BUILD_ENTRY}`);
  }
  console.log(`Building ${buildEntry.root} for ${browserVendor}...`);

  const viteConfig = {
    css: {
      transformer: 'lightningcss'
    },
    build: {
      base: './',
      assetsDir: './', // relative to outDir
      outDir: `dist/${browserVendor}`,
      copyPublicDir: buildEntry.copyPublicDir || false,
      minify: isProduction ? 'terser' : false,
      plugins: [
        inject({
          $: 'jquery',
          jQuery: 'jquery'
        })
      ],
      publicDir: 'public',
      rollupOptions: {
        input: `src/${buildEntry.root}/${buildEntry.input}`,
        output: {
          dir: `dist/${browserVendor}/${buildEntry.root}`,
          format: 'es',
          inlineDynamicImports: false,
          assetFileNames: '[name]-[hash][extname]',
          entryFileNames: () => {
            if (buildEntry.root === 'main') {
              return `main-${browserVendor}.js`;
            }
            return '[name]-[hash].js';
          },
        },
      },
      sourcemap: true,
      target: 'es2022',
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
        name: 'css-in-js-handler',
        transform(code, id) {
          const allowedSuffixes = ['.js', '.ts'];
          const fileSuffix = id.slice(id.lastIndexOf('.'));
          if (!allowedSuffixes.some((suffix) => fileSuffix === suffix)) {
            return null; // Skip transformation for non-JS/TS files
          }
          // Separate function to handle CSS imports
          function handleCSSImports() {
            const cssImportRegex = /import\s+['"](.+\.css)['"]/g;
            code.replace(cssImportRegex, (match, cssPath, offset) => {
              const start = offset;
              const end = start + match.length;
              const replacementText = `import('${cssPath}').then(css => css.default)`;
              magicString.overwrite(start, end, replacementText);
              return replacementText; // This return value is not used since we're modifying magicString directly
            });
          }

          console.log(`Processing CSS imports in ${id}...`);

          const magicString = new MagicString(code);

          // Call the separate functions
          handleCSSImports(magicString);

          return {
            code: magicString.toString(),
            map: magicString.generateMap({ hires: true })
          };
        },
      },
      {
        name: 'patch-assets-url',
        apply: 'build',
        generateBundle(options, bundle) {
          Object.keys(bundle).forEach((fileName) => {
            const chunk = bundle[fileName];
            if (!(chunk.type === 'chunk' && chunk.fileName.endsWith('.js'))) {
              return;
            }
            const regex = /const assetsURL = function\(dep\) {\s*return "\/" \+ dep;\s*};/g;
            const match = regex.exec(chunk.code);
            if (!match) {
              return;
            }
            console.log(`Patching assetsURL function in ${fileName}`);
            // Replace the matched string with the new implementation
            const magicString = new MagicString(chunk.code);
            magicString.overwrite(match.index, match.index + match[0].length, 'const assetsURL = (dep) => dep;');
            chunk.code = magicString.toString();
            // chunk.map = magicString.generateMap({ hires: true });
          });
        }
      },
      {
        name: 'patch-css-urls',
        apply: 'build',
        writeBundle(options, bundle) {
          Object.keys(bundle).forEach((fileName) => {
            const chunk = bundle[fileName];
            if (!(chunk.type === 'asset' && chunk.fileName.endsWith('.css'))) {
              return;
            }
            const filePath = path.join(options.dir || '.', chunk.fileName);
            fs.readFile(filePath, 'utf8', (err, data) => {
              if (err) {
                console.error(`Error reading ${filePath}: ${err}`);
                return;
              }
              // Updated regex to exclude URLs starting with "/images/"
              const urlRegex = /url\("\/(?!images\/)(.*?)"\)/g;
              const magicString = new MagicString(data);
              let hasChanges = false;

              data.replace(urlRegex, (match, p1, offset) => {
                const originalUrl = `url("/${p1}")`;
                const fixedUrl = `url("${p1}")`;
                magicString.overwrite(offset, offset + originalUrl.length, fixedUrl);
                hasChanges = true;
                return fixedUrl;
              });

              if (!hasChanges) {
                return;
              }
              console.log(`Patching URLs in ${filePath}`);
              fs.writeFile(filePath, magicString.toString(), 'utf8', (writeErr) => {
                if (!writeErr) {
                  return;
                }
                console.error(`Error writing ${filePath}: ${writeErr}`);
              });
            });
          });
        }
      },
      {
        name: 'rename-main-service',
        generateBundle(options, bundle) {
          if (buildEntry.root !== 'main') return; // Only process the main entry

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
          if (buildEntry.root !== 'main') return; // Only process the main entry

          // Move contents of main directory to root
          fse.copySync(path.resolve(__dirname, `dist/${browserVendor}/main`), path.resolve(__dirname, `dist/${browserVendor}`));
          rimraf.sync(path.resolve(__dirname, `dist/${browserVendor}/main`));
        }
      },
      {
        name: 'replace-global-window-with-self',
        apply: 'build',
        renderChunk(code, chunk) {
          if (buildEntry.root !== 'main') return null; // Only process the main entry

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
        name: 'reparent-bundles',
        apply: 'build',
        generateBundle(_, bundle) {
          if (!buildEntry.input.endsWith('.html')) return; // Process only html entry points

          console.log('Reparenting bundles ...');
          Object.keys(bundle).forEach((name) => {
            const file = bundle[name];
            file.fileName = file.fileName.replace('index/', '');
            console.log(`  - ${file.fileName}...`);
          });
        },
        // eslint-disable-next-line no-unused-vars
        writeBundle(options, bundle) {
          if (!buildEntry.input.endsWith('.html')) return; // Process only html entry points

          // Move index.html to root and update script source
          const htmlFilePath = path.resolve(__dirname, `dist/${browserVendor}/${buildEntry.root}/src/${buildEntry.root}/index.html`);
          fs.promises.readFile(htmlFilePath, 'utf-8')
            .then((data) => {
              const magicString = new MagicString(data);
              const matches = [...data.matchAll(/"\/(index[^"]*)"/g)];
              matches.forEach((match) => {
                const start = match.index;
                const end = start + match[0].length;
                magicString.overwrite(start, end, `"./${match[1]}"`);
              });
              return magicString.toString(); // Use the modified content
            })
            .then((modifiedHtmlContent) => {
              fs.promises.writeFile(path.resolve(__dirname, `dist/${browserVendor}/${buildEntry.root}/index.html`), modifiedHtmlContent);
              return fs.promises.unlink(htmlFilePath);
            })
            .then(() => {
              // Remove src directory
              rimraf.sync(path.resolve(__dirname, `dist/${browserVendor}/${buildEntry.root}/src`));
            })
            .catch((err) => {
              console.error(`Got an error trying to read or write the file: ${err.message}`);
            });
        }
      },
      {
        name: 'recompute-source-map',
        writeBundle(options, bundle) {
          if (true) return; // Skip this plugin for now
          console.log('--- recompute-source-map writeBundle ---');
          //
          Object.keys(bundle).forEach((name) => {
            const file = bundle[name];
            if (file.type === 'chunk' && file.code) {
              const magicString = new MagicString(file.code);

              // Generate a new source map
              const newMap = magicString.generateMap({
                source: file.fileName,
                file: `${file.fileName}.map`,
                hires: true
              });

              // Override the existing source map
              file.map = newMap;

              console.log(`Recomputed source map for ${file.fileName}`);
              const newMapString = JSON.stringify(newMap);
              console.log(`  - Source map size: ${newMapString.length}`);
              console.log(`  - Source map content: ${newMapString.slice(0, 100)}...`); // Log first 100 characters for brevity

              // Ensure the sourceMappingURL comment is correct
              if (!file.code.includes('//# sourceMappingURL=')) {
                file.code += `\n//# sourceMappingURL=${file.fileName}.map`;
              }
            }
          });
        }
      },
      {
        name: 'extended-debug-build',
        generateBundle(options, bundle) {
          console.log('--- generateBundle ---');
          this.bundleState = {};

          Object.keys(bundle).forEach((name) => {
            const file = bundle[name];
            console.log(`- ${file.fileName}`);

            if (file.fileName.endsWith('.map')) {
              console.log(`  - Source map size: ${file.source.length}`);
              console.log(`  - Source map content: ${file.source.slice(0, 100)}...`); // Log first 100 characters for brevity
            }

            this.bundleState[file.fileName] = {
              code: file.code,
              sourceMap: file.source,
            };
          });
        },
        writeBundle(options, bundle) {
          console.log('--- writeBundle ---');

          Object.keys(bundle).forEach((name) => {
            const file = bundle[name];
            console.log(`- ${file.fileName}`);

            if (file.fileName.endsWith('.map')) {
              const originalSourceMap = this.bundleState[file.fileName]?.sourceMap;
              const currentSourceMap = file.source;

              if (originalSourceMap !== currentSourceMap) {
                console.log(`  - Source map has changed for ${file.fileName}`);
                console.log(`  - Original source map content: ${originalSourceMap?.slice(0, 100)}...`);
                console.log(`  - Current source map content: ${currentSourceMap.slice(0, 100)}...`);
              } else {
                console.log(`  - Source map has not changed for ${file.fileName}`);
              }

              console.log(`  - Current source map size: ${currentSourceMap.length}`);
            }

            const originalCode = this.bundleState[file.fileName]?.code;
            const currentCode = file.code;

            if (originalCode !== currentCode) {
              console.log(`  - Code has changed for ${file.fileName}`);
              console.log(`  - Original code size: ${originalCode?.length}`);
              console.log(`  - Current code size: ${currentCode.length}`);
            } else {
              console.log(`  - Code has not changed for ${file.fileName}`);
            }
          });
        }
      },
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
