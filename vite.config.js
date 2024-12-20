import inject from '@rollup/plugin-inject';
import cssnano from 'cssnano';
import dotenv from 'dotenv';
import path from 'path';
import copy from 'rollup-plugin-copy';
import { defineConfig } from 'vite';

import astPatch from './vite.config.d/ast-patch-plugin';
import cssPatch from './vite.config.d/css-patch-plugin';
import debug from './vite.config.d/debug-plugin';
import htmlReparent from './vite.config.d/html-reparent-plugin';
import mainReparent from './vite.config.d/main-reparent-plugin';

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
      transformer: 'lightningcss',
      postcss: {
        plugins: [cssnano(['default', { normalizeUrl: false }])],
      },
    },
    build: {
      base: `/${buildEntry.root}/`,
      assetsDir: './', // relative to outDir
      outDir: `dist/${browserVendor}`,
      copyPublicDir: buildEntry.copyPublicDir || false,
      minify: isProduction ? 'terser' : false,
      terserOptions: {
        // Terser options
        keep_classnames: true, // Prevent class name mangling
        keep_fnames: true // Optionally, keep function names as well
      },
      sourcemap: true, // Ensure sourcemap is enabled
      target: 'es2022',
      rollupOptions: {
        input: `src/${buildEntry.root}/${buildEntry.input}`,
        output: {
          dir: `dist/${browserVendor}/${buildEntry.root}`,
          format: 'es',
          inlineDynamicImports: true,
          assetFileNames: '[name]-[hash][extname]',
          entryFileNames: () => {
            if (buildEntry.root === 'main') {
              return `main-${browserVendor}.js`;
            }
            return '[name]-[hash].js';
          },
        },
      },
    },
    plugins: [
      inject({
        $: 'jquery',
        jQuery: 'jquery'
      }),
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
      copy({
        targets: [
          {
            src: 'src/main/content-script.js',
            dest: `dist/${browserVendor}`,
          }
        ],
        // hook: 'writeBundle', // run the plugin at the end of bundling
      }),
      htmlReparent({ browserVendor, buildEntry, sourceDir: 'src', outputDir: `dist/${browserVendor}` }),
      mainReparent({ browserVendor, buildEntry, sourceDir: 'src', outputDir: `dist/${browserVendor}` }),
      astPatch({ browserVendor, buildEntry }),
      cssPatch({ browserVendor, buildEntry }),
      debug(),
    ],
    server: {
      watch: {
        include: ['src', 'public'], // Directories to be watched for changes
      },
      sourcemap: true, // Ensure sourcemap is enabled in development
    },
  }; // end of config return

  console.log('Vite config:', JSON.stringify(viteConfig, null, 2));
  return viteConfig;
}); // end of export
