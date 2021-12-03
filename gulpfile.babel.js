import cheerio from 'gulp-cheerio';
import concat from 'gulp-concat';
import del from 'del';
import eslint from 'gulp-eslint';
import filter from 'gulp-filter';
import fs from 'fs';
import gulp from 'gulp';
import gulpLoadPlugins from 'gulp-load-plugins';
import ls from 'list-directory-contents';
import minimist from 'minimist';
import moment from 'moment';
import ms from 'merge-stream';
import path from 'path';
import replace from 'gulp-replace';
import runSequence from 'run-sequence';
import { stream as wiredep } from 'wiredep';
import util from 'gulp-util';

const knownOptions = {
  string: 'env',
  default: { env: process.env.NODE_ENV || 'test' }
};
const options = minimist(process.argv.slice(2), knownOptions);
const $ = gulpLoadPlugins();
const test = options.env;
const copyrighted = [
  'app/*.html',
  'app/scripts.babel/*.js',
  'app/scripts.babel/bkg/*.js',
  'app/vendor.babel/chrome/*.js',
  'app/vendor.babel/firefox/*.js',
  'test/features/step_definitions/*.js',
  'test/*.js',
  './LICENSE.txt'
]

let version = '';

// Create WIP build version based on date and time
function buildNumber() {
  // Ensure build number is the same if FF and Chrome are built together.
  return moment.utc().format('DDMM.HHmm');
}

// Get version from manifest
function readVersion(vendor) {
  let manifest = require(`./app/vendor/${ vendor }/manifest.json`);
  return manifest.version.split('\.');
}

// Get version from tag
function readTagVersion() {
  // Read the version from the env variable
  const tagVersion = process.env.TAG_VERSION;
  // Remove the tag prefix to keep only the 'X.X.X'
  const regEx = /[0-9]+.[0-9]+.[0-9]+/g;
  return tagVersion.match(regEx)[0];
}

// Create timestamped build version
function buildVersion(vendor) {
  let [major, minor, build] = readVersion(vendor);
  return `${ major }.${ minor }.${ buildNumber() }`;
}

// Increment fix version
function fixVersion(vendor) {
  let [major, minor, build] = readVersion(vendor);
  return `${ major }.${ minor }.${ parseInt(build) + 1 }`;
}

// Increment minor version
function minorVersion(vendor) {
  let [major, minor, build] = readVersion(vendor);
  return `${ major }.${ parseInt(minor) + 1 }.0`;
}

// Increment major version
function majorVersion(vendor) {
  let [major, minor, build] = readVersion(vendor);
  return `${ parseInt(major) + 1 }.0.0`;
}

function updateVersionForRelease(vendor, version, distFile) {

  util.log(`Releasing ${ vendor } Extension: ${ version }`);
  // Update sources Manifest
  gulp.src(`app/vendor/${ vendor }/manifest.json`).pipe($.chromeManifest({
    buildnumber: version
  })).pipe(gulp.dest(`app/vendor/${ vendor }`));

  return gulp.src(`dist/${ vendor }/manifest.json`).pipe($.chromeManifest({
    buildnumber: version,
    background: {
      target: 'scripts/background.js'
    }
  }));
}

function lint(files) {
  try {
    fs.mkdirSync('ftest/target');
    fs.writeFileSync('ftest/target/checkstyle-result.xml');
  }
  catch(err) {}
  finally {
    return () => {
      return gulp.src(files)
        .pipe(eslint())
        .pipe(eslint.format())
        .pipe(eslint.format('checkstyle', fs.createWriteStream('ftest/target/checkstyle-result.xml')));
    };
  }
}

function prependScript(node, file) {
  node.prepend(`<script src="${ file }"></script>`);
}

function appendScript(node, file) {
  node.append(`<script src="${ file }"></script>`);
}

function updateCopyright(source) {
  const year = new Date().getFullYear();
  const dest = source.substring(0, source.lastIndexOf("/")) || './';
  return gulp.src(source)
    .pipe(replace(/Copyright ?(.+) Nuxeo/g, `Copyright 2016-${year} Nuxeo`))
    .pipe(gulp.dest(dest));
}

gulp.task('copyright', function(done){
  copyrighted.forEach((file) => {
    return updateCopyright(file);
  });
  done();
});

gulp.task('lint', lint([
  'app/scripts.babel/*.js',
  'app/vendor.babel/**/*.js',
  'test*/features/step_definitions/*.js',
  'test*/features/step_definitions/support/**/*.js'
]));

gulp.task('extras', () => {
  return gulp.src([
    'app/*.*',
    'app/_locales/**',
    'app/libs/**',
    '!app/libs/highlight.js',
    '!app/vendor.babel',
    '!app/scripts.babel',
    '!app/*.json',
    '!app/*.html'
  ], {
    base: 'app',
    dot: true
  }).pipe(gulp.dest('dist/base'));
});

gulp.task('scripts', () => {
  return gulp.src('app/scripts.babel/*.js').pipe(gulp.dest('dist/base/scripts'));
});

gulp.task('styles', () => {
  return gulp.src('app/styles/*.css').pipe(gulp.dest('dist/base/styles'));
});

gulp.task('images', () => {
  return gulp.src('app/images/*').pipe(gulp.dest('dist/base/images'));
});

gulp.task('babel:bkg', () => {
  return gulp.src('app/scripts.babel/bkg/*.js').pipe(concat('bkg.js')).pipe($.babel({
    presets: ['@babel/env']
  })).pipe(gulp.dest('app/scripts'));
});

gulp.task('babel:base', gulp.series('babel:bkg'), () => {
  return gulp.src('app/scripts.babel/*.js').pipe($.babel({
    presets: ['@babel/env']
  })).pipe(gulp.dest('app/scripts'));
});

gulp.task('babel:vendor:chrome', () => {
  return gulp.src('app/vendor.babel/chrome/*.js').pipe($.babel({
    presets: ['@babel/env']
  })).pipe(gulp.dest('app/vendor/chrome'));
});

gulp.task('babel:vendor:firefox', () => {
  return gulp.src('app/vendor.babel/firefox/*.js').pipe($.babel({
    presets: ['@babel/env']
  })).pipe(gulp.dest('app/vendor/firefox'));
});

gulp.task('manifest:firefox', () => {
  return gulp.src('app/vendor.babel/firefox/manifest.json').pipe(gulp.dest('app/vendor/firefox'));
});

gulp.task('manifest:chrome', () => {
  return gulp.src('app/vendor.babel/chrome/manifest.json').pipe(gulp.dest('app/vendor/chrome'));
});

gulp.task('manifest', gulp.parallel('manifest:firefox', 'manifest:chrome'));

gulp.task('babel:vendor', gulp.parallel('babel:vendor:chrome', 'babel:vendor:firefox', 'manifest'));

gulp.task('babel', gulp.series('lint', gulp.parallel('babel:base', 'babel:vendor')));

gulp.task('vendor:chrome', () => {
  return gulp.src('app/vendor/chrome/browser.js').pipe(gulp.dest('dist/chrome/scripts'));
});

gulp.task('vendor:firefox', () => {
  return gulp.src('app/vendor/firefox/browser.js').pipe(gulp.dest('dist/firefox/scripts'));
});

gulp.task('html', () => {
  return gulp.src('app/*.html').pipe(gulp.dest('dist/base'));
});

gulp.task('build:base',
  gulp.series(
    'babel',
    gulp.parallel(
      'vendor:chrome',
      'vendor:firefox'
    ),
    gulp.parallel(
      'images',
      'extras',
      'scripts',
      'styles',
      'html'
    )
  )
);

gulp.task('build:chrome:version', (done) => {
  version = buildVersion('chrome');
  done();
});

gulp.task('build:chrome:base', () => {
  util.log(`Building Chrome Extension: ${ version }`);
  return gulp.src('dist/base/**/*')
    .pipe(filter(['**', '!**/about.html']))
    .pipe(filter(['**', '!**/json.html']))
    .pipe(gulp.dest('dist/chrome'));
});

gulp.task('build:chrome:about', () => {
  return gulp.src('dist/base/about.html').pipe(cheerio($ => {
    $('#version').text(`Version ${ version }`);
  })).pipe(gulp.dest('dist/chrome'));
});

gulp.task('build:chrome:json', () => {
  return gulp.src('dist/base/json.html').pipe(cheerio($ => {
    const $body = $('body');
    appendScript($body, 'libs/highlight.js');
  })).pipe(gulp.dest('dist/chrome'));
});

gulp.task('build:chrome:highlight', () => {
  return gulp.src('app/libs/highlight.js').pipe(gulp.dest('dist/chrome/libs'));
});

// gulp-chrome-manifest messes up base directory
gulp.task('build:chrome:manifest', () => {
  return gulp.src('app/vendor/chrome/manifest.json').pipe($.chromeManifest({
    buildnumber: version,
    background: {
      target: 'scripts/background.js'
    }
  })).pipe(gulp.dest('../../../dist/chrome'));
});

gulp.task('build:chrome', gulp.series(
  'build:chrome:base',
  'build:chrome:about',
  'build:chrome:json',
  'build:chrome:highlight',
  'build:chrome:manifest'
));

gulp.task('build:sinon-chrome:version', (done) => {
  version = buildVersion('chrome');
  done();
});

gulp.task('build:sinon-chrome:base', () => {
  // Copy Chrome build
  return gulp.src('dist/chrome/**/*')
    .pipe(filter(['**', '!**/popup.html']))
    .pipe(filter(['**', '!**/about.html']))
    .pipe(filter(['**', '!**/es-reindex.html']))
    .pipe(gulp.dest('dist/sinon-chrome'));
});

// Add sinon-chrome.min script
gulp.task('build:sinon-chrome:min', () => {
  return gulp.src(require.resolve('sinon-chrome/bundle/sinon-chrome.min.js'))
    .pipe(gulp.dest('dist/sinon-chrome/scripts'));
});

// Transpile and copy injecter.js script
gulp.task('build:sinon-chrome:injector', () => {
  return gulp.src(path.join(`${ test }`, 'injecter.js')).pipe($.babel({
    presets: ['@babel/env']
  })).pipe(gulp.dest('dist/sinon-chrome/scripts'));
});

// Create a standalone index.html with background.js, sinon-chrome and a script injecter to manipulate mocks from Webdriverio.
gulp.task('build:sinon-chrome:index', () => {
  return gulp.src('dist/chrome/popup.html').pipe(cheerio($ => {
    const $head = $('head');
    // Order matters; as we use `prepend`, last added will be first.
    prependScript($head, 'scripts/background.js');
    prependScript($head, 'scripts/injecter.js');
    prependScript($head, 'scripts/sinon-chrome.min.js');
  })).pipe(gulp.dest('dist/sinon-chrome'));
});

gulp.task('build:sinon-chrome:about', () => {
  return gulp.src('dist/chrome/about.html').pipe(cheerio($ => {
      const $head = $('head');
      // Order matters; as we use `prepend`, last added will be first.
      prependScript($head, 'scripts/background.js');
      prependScript($head, 'scripts/injecter.js');
      prependScript($head, 'scripts/sinon-chrome.min.js');
      $('#version').text(`Version ${ version }`);
    })).pipe(gulp.dest('dist/sinon-chrome'));
});

gulp.task('build:sinon-chrome:es-reindex', () => {
  return gulp.src('dist/chrome/es-reindex.html').pipe(cheerio($ => {
    const $head = $('head');
    // !! Order matters; as we use `prepend`, last added will be first.
    prependScript($head, 'scripts/background.js');
    prependScript($head, 'scripts/injecter.js');
    prependScript($head, 'scripts/sinon-chrome.min.js');
  })).pipe(gulp.dest('dist/sinon-chrome'));
});

gulp.task('build:sinon-chrome', gulp.series(
  'build:sinon-chrome:version',
  'build:sinon-chrome:base',
  'build:sinon-chrome:min',
  'build:sinon-chrome:injector',
  'build:sinon-chrome:index',
  'build:sinon-chrome:about',
  'build:sinon-chrome:es-reindex'
));

// Build ONLY sinon-chrome for testing purposes
gulp.task('sinon-chrome', gulp.series(
  'build:base',
  'build:chrome',
  'build:sinon-chrome'
));

gulp.task('build:firefox:version', (done) => {
  version = buildVersion('firefox');
  done();
});

gulp.task('build:firefox:base', () => {
  if (version.length < 1) {
    version = buildVersion('firefox');
  }
  util.log(`Building Firefox Extension: ${ version }`);
  return gulp.src('dist/base/**/*')
    .pipe(filter(['**', '!**/about.html']))
    .pipe(gulp.dest('dist/firefox'));
});

gulp.task('build:firefox:about', () => {
  return gulp.src('dist/base/about.html').pipe(cheerio($ => {
    $('#version').text(`Version ${ version }`);
  })).pipe(gulp.dest('dist/firefox'));
});

// gulp-chrome-manifest messes up base directory
gulp.task('build:firefox:manifest', () => {
  return gulp.src('app/vendor/firefox/manifest.json').pipe($.chromeManifest({
    buildnumber: version,
    background: {
      target: 'scripts/background.js'
    }
  })).pipe(gulp.dest('../../../dist/firefox'));
});

gulp.task('build:firefox', gulp.series(
  'build:firefox:base',
  'build:firefox:about',
  'build:firefox:manifest'
));

gulp.task('version:chrome', () => {
  return updateVersionForRelease('chrome', version);
});

gulp.task('version:firefox', () => {
  return updateVersionForRelease('firefox', version);
});

gulp.task('zip:chrome', () => {
  let filename = `BrowserDeveloperExtension-Chrome-${ version }.zip`;
  util.log(`Building file: ${ filename }`);
  return gulp.src('dist/chrome/**').pipe($.zip(filename)).pipe(gulp.dest('package/chrome'));
});

gulp.task('zip:firefox', () => {
  let filename = `BrowserDeveloperExtension-Firefox-${ version }.zip`;
  util.log(`Building file: ${ filename }`);
  return gulp.src('dist/firefox/**').pipe($.zip(filename)).pipe(gulp.dest('package/firefox'));
});

gulp.task('release:chrome',
  gulp.series(
    'build:chrome',
    'version:chrome',
    'zip:chrome'
  )
);

gulp.task('release:firefox',
  gulp.series(
    'build:firefox',
    'version:firefox',
    'zip:firefox'
  )
);

gulp.task('clean', () => {
  return del([
    '.tmp',
    'dist',
    'package',
    'app/scripts',
    'app/vendor',
    'test*/screenshots/*.png'
  ]);
});

gulp.task('size', () => {
  return gulp.src('dist/**/*').pipe($.size({
    title: 'build',
    gzip: true
  }));
});

// build:chrome is dependency of build:sinon-chrome
gulp.task('build',
  gulp.series(
    'build:base',
    gulp.parallel(
      'build:firefox',
      'build:chrome'
    ),
    gulp.parallel(
      'build:firefox:version',
      'build:chrome:version'
    ),
    'size',
    'build:sinon-chrome'
  )
);

gulp.task('watch:tasks', (done) => {
  $.livereload.listen();
  gulp.watch([
    'app/*.html',
    'app/libs/**/*.js',
    'app/images/**/*',
    'app/styles/**/*',
    'app/_locales/**/*.json',
    'app/vendor.babel/**/*.js',
    'app/scripts.babel/*.js',
    'app/scripts.babel/bkg/*.js'
  ]).on('change',
    gulp.series(
      'clean',
      'build:base',
      'build:chrome:version',
      'build:chrome'
    )
  );
  gulp.watch([
    'dist/chrome/**/'
  ]).on('change', function () {
    $.livereload.reload;
  });
  done();
});

gulp.task('watch:lint', (done) => {
  $.livereload.listen();
  gulp.watch([
    'app/*.html',
    'app/libs/**/*.js',
    'app/images/**/*',
    'app/styles/**/*',
    'app/_locales/**/*.json',
    'app/vendor.babel/**/*.js',
    'app/scripts.babel/*.js',
    'app/scripts.babel/bkg/*.js',
    'test*/features/step_definitions/*.js',
    'test*/features/step_definitions/support/**/*.js'
  ]).on('change', gulp.series('lint'));
  done();
})

gulp.task('watch',
  gulp.series(
    'build:base',
    'build:chrome:version',
    'build:chrome',
    'watch:tasks'
  )
);

gulp.task('package:chrome', gulp.series('build:chrome', 'zip:chrome'));

gulp.task('package:firefox', gulp.series('build:firefox', 'zip:firefox'));

gulp.task('version:setversion', (done) => {
  version = readTagVersion();
  done();
});

gulp.task('default', gulp.series('clean', 'build'));

gulp.task('package',
  gulp.series(
    'build:base',
    gulp.parallel(
      'package:chrome',
      'package:firefox'
    )
  )
);

gulp.task('release',
  gulp.series(
    'clean',
    'copyright',
    'build:base',
    'version:setversion',
    gulp.parallel(
      'build:chrome',
      'build:firefox'
    ),
    gulp.parallel(
      'version:chrome',
      'version:firefox'
    ),
    gulp.parallel(
      'zip:chrome',
      'zip:firefox'
    )
  )
);

gulp.task('zip:source', () => {
  let filename = `BrowserDeveloperExtension-SourceCode-${ version }.zip`;
  util.log(`Building file: ${ filename }`);
  return gulp.src(['./**','!/dist/**','!./package/**','!./node_modules/**','!.git*','!./.git/**']).pipe($.zip(filename)).pipe(gulp.dest('.'));
});

gulp.task('create-source-archive', gulp.series('clean','zip:source'));