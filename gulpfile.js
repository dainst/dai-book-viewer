/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* jshint node:true */
/* globals target */

'use strict';

var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var rimraf = require('rimraf');
var stream = require('stream');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var streamqueue = require('streamqueue');
var zip = require('gulp-zip');

var BUILD_DIR = 'build/';
var L10N_DIR = 'src/l10n/';
var TEST_DIR = 'src/test/';

var makeFile = require('./make.js');
var stripCommentHeaders = makeFile.stripCommentHeaders;
var builder = makeFile.builder;

var dbv_config = JSON.parse(fs.readFileSync('src/dbv.config').toString());
var pdfjs_config = JSON.parse(fs.readFileSync('pdf.js/pdfjs.config').toString());


var DEFINES = {
  PRODUCTION: true,
  // The main build targets:
  GENERIC: false,
  FIREFOX: false,
  MOZCENTRAL: false,
  CHROME: false,
  MINIFIED: false,
  SINGLE_FILE: false,
  COMPONENTS: false
};

function createStringSource(filename, content) {
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    this.push(new gutil.File({
      cwd: '',
      base: '',
      path: filename,
      contents: new Buffer(content)
    }));
    this.push(null);
  };
  return source;
}

function stripUMDHeaders(content) {
  var reg = new RegExp(
    'if \\(typeof define === \'function\' && define.amd\\) \\{[^}]*' +
    '\\} else if \\(typeof exports !== \'undefined\'\\) \\{[^}]*' +
    '\\} else ', 'g');
  return content.replace(reg, '');
}


function bundle(filename, outfilename, pathPrefix, initFiles, amdName, defines, isMainFile, versionInfo) {
  // Reading UMD headers and building loading orders of modules. The
  // readDependencies returns AMD module names: removing 'pdfjs' prefix and
  // adding '.js' extensions to the name.
  var umd = require('./pdf.js/external/umdutils/verifier.js');
  initFiles = initFiles.map(function (p) { return pathPrefix + p; });

  var files = umd.readDependencies(initFiles).loadOrder.map(function (name) {
	  return pathPrefix + name.replace(/^[\w\-]+\//, '') + '.js';
  });

  var crlfchecker = require('./pdf.js/external/crlfchecker/crlfchecker.js');
  crlfchecker.checkIfCrlfIsPresent(files);

  var bundleContent = files.map(function (file) {
    var content = fs.readFileSync(file);

    // Prepend a newline because stripCommentHeaders only strips comments that
    // follow a line feed. The file where bundleContent is inserted already
    // contains a license header, so the header of bundleContent can be removed.
    content = stripCommentHeaders('\n' + content);

    // Removes AMD and CommonJS branches from UMD headers.
    content = stripUMDHeaders(content);

    return content;
  }).join('');

  var jsName = amdName.replace(/[\-_\.\/]\w/g, function (all) {
    return all[1].toUpperCase();
  });

  // Avoiding double processing of the bundle file.
  var templateContent = fs.readFileSync(filename).toString();
  var tmpFile = outfilename + '.tmp';
  fs.writeFileSync(tmpFile, templateContent.replace(
    /\/\/#expand\s+__BUNDLE__\s*\n/, function (all) { return bundleContent; }));
  bundleContent = null;
  templateContent = null;

  // This just preprocesses the empty pdf.js file, we don't actually want to
  // preprocess everything yet since other build targets use this file.
  builder.preprocess(tmpFile, outfilename,
    builder.merge(defines, {
      BUNDLE_VERSION: versionInfo.version,
      BUNDLE_BUILD: versionInfo.commit,
      BUNDLE_AMD_NAME: amdName,
      BUNDLE_JS_NAME: jsName,
      MAIN_FILE: isMainFile
    }));
  fs.unlinkSync(tmpFile);
}

function createBundle(defines) {
  var versionJSON = JSON.parse(fs.readFileSync(BUILD_DIR + 'version.json').toString());

  console.log();
  console.log('### Bundling pdf.js files ');

  var mainFiles = [
    'display/global.js'
  ];

  var workerFiles = [
    'core/worker.js'
  ];

  var mainAMDName = 'pdfjs-dist/build/pdf';
  var workerAMDName = 'pdfjs-dist/build/pdf.worker';
  var mainOutputName = 'pdf.js';
  var workerOutputName = 'pdf.worker.js';

  workerFiles.push('core/network.js');

  var state = 'mainfile';
  var source = stream.Readable({ objectMode: true });
  source._read = function () {
    var tmpFile;
    switch (state) {
      case 'mainfile':
        // 'buildnumber' shall create BUILD_DIR for us
        tmpFile = BUILD_DIR + '~' + mainOutputName + '.tmp';
        bundle('pdf.js/src/pdf.js', tmpFile, 'pdf.js/src/', mainFiles,  mainAMDName, defines, true, versionJSON);
        this.push(new gutil.File({
          cwd: '',
          base: '',
          path: mainOutputName,
          contents: fs.readFileSync(tmpFile)
        }));
        fs.unlinkSync(tmpFile);
        state = workerFiles ? 'workerfile' : 'stop';
        break;
      case 'workerfile':
        // 'buildnumber' shall create BUILD_DIR for us
        tmpFile = BUILD_DIR + '~' + workerOutputName + '.tmp';
        bundle('pdf.js/src/pdf.js', tmpFile, 'pdf.js/src/', workerFiles, workerAMDName, defines, false, versionJSON);
        this.push(new gutil.File({
          cwd: '',
          base: '',
          path: workerOutputName,
          contents: fs.readFileSync(tmpFile)
        }));
        fs.unlinkSync(tmpFile);
        state = 'stop';
        break;
      case 'stop':
        this.push(null);
        break;
    }
  };
  return source;
}


function createDbvBundle(defines) {
  console.log();
  console.log('### create DBV bundle');

	var versionJSON = JSON.parse(fs.readFileSync(BUILD_DIR + 'version.json').toString());

	var template, files, outputName, amdName;

  amdName = 'pdfjs-dist/dbv-web/viewer';
  outputName = 'viewer.js';
  template = 'src/viewer.js';
  files = [
    'app.js',
    'mozPrintCallback_polyfill.js'
  ];


	var source = stream.Readable({objectMode: true});
	source._read = function () {
	  // 'buildnumber' shall create BUILD_DIR for us
	  var tmpFile = BUILD_DIR + '~' + outputName + '.tmp';
	  bundle(template, tmpFile, 'src/', files, amdName, defines, false, versionJSON);
	  this.push(new gutil.File({
      cwd: '',
      base: '',
      path: outputName,
      contents: fs.readFileSync(tmpFile)
	  }));
	  fs.unlinkSync(tmpFile);
	  this.push(null);
	};
	return source;
}


function checkFile(path) {
  try {
    var stat = fs.lstatSync(path);
    return stat.isFile();
  } catch (e) {
    return false;
  }
}




/**
 * dbv: finds out the build number with git
 */
gulp.task('buildnumber_dbv', function(done) {
  console.log();
  console.log('### Getting dbv build number');
  getVersionInfo(dbv_config, 'version.json', done);
});
gulp.task('buildnumber_pdfjs', function(done) {
  console.log();
  console.log('### Getting pdf.js build number');
  getVersionInfo(pdfjs_config, 'pdfjs_version.json', done);
});

function getVersionInfo(config, target, readyFn) {
  exec('git log --format=oneline ' + config.baseVersion + '..',
    function (err, stdout, stderr) {
      var buildNumber = 0;
      if (!err) {
        // Build number is the number of commits since base version
        buildNumber = stdout ? stdout.match(/\n/g).length : 0;
      }

      console.log('build number: ' + buildNumber);

      var version = config.versionPrefix + buildNumber;

      exec('git log --format="%h" -n 1',
        function (err, stdout, stderr) {
          var buildCommit = '';
          if (!err) {
            buildCommit = stdout.replace('\n', '');
          }

          createStringSource(target, JSON.stringify({
            version: version,
            build: buildNumber,
            commit: buildCommit
          }, null, 2))
            .pipe(gulp.dest(BUILD_DIR))
            .on('end', readyFn);
        });
  });
}



gulp.task('bundle-dbv', ['buildnumber_dbv', 'buildnumber_pdfjs'], function () {
  var defines = builder.merge(DEFINES, {GENERIC: true});
  return streamqueue(
      {objectMode: true},
      createBundle(defines), // pdf.js
      createDbvBundle(defines) //dbv
    )
    .pipe(gulp.dest(BUILD_DIR));
});




gulp.task('dbv', function() {
  global.target.dbv();
});


