/* Copyright 2012 Mozilla Foundation
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
/* globals cat, cd, cp, echo, env, exec, exit, find, ls, mkdir, mv, process, rm,
           sed, target, test */

'use strict';

try {
  require('shelljs/make');
} catch (e) {
  console.log('ShellJS is not installed. Run "npm install" to install ' + 'all dependencies.');
  return;
}

var builder = require('./pdf.js/external/builder/builder.js');
var fs = require('fs');

var CONFIG_FILE = 'pdf.js/pdfjs.config';
var config = JSON.parse(fs.readFileSync(CONFIG_FILE));

var ROOT_DIR = __dirname + '/', // absolute path to project's root
    BUILD_DIR = 'build/',
    SRC_DIR = 'node_modules/pdfjs-dist/src/',
    BUILD_TARGET = BUILD_DIR + 'pdf.js',
    BUILD_WORKER_TARGET = BUILD_DIR + 'pdf.worker.js',
    BUILD_TARGETS = [BUILD_TARGET, BUILD_WORKER_TARGET],
    LOCALE_SRC_DIR = 'pdf.js/l10n/';


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

function getCurrentVersion() {
  // The 'build/version.json' file is created by 'buildnumber' task.
  return JSON.parse(fs.readFileSync(ROOT_DIR + 'build/version.json').toString())
    .version;
}



////////////////////////////////////////////////////////////////////////////////
//
// Production stuff
//

//make DBV version
//
target.dbv = function() {
  // clean
  rm('-rf', BUILD_DIR);

  exec('gulp bundle-dbv');

	target.locale();

	cd(ROOT_DIR);
	echo();
	echo('### collect other files');


	mkdir('-p', BUILD_DIR);
	mkdir('-p', BUILD_DIR + '/cmaps');

	/*mv(BUILD_DIR + 'pdf.worker.js', BUILD_DIR + 'tmp.pdf.worker.js')
	mv(BUILD_DIR + 'pdf.js', BUILD_DIR + 'tmp.pdf.js')
*/
	var defines = builder.merge(DEFINES, {GENERIC: true});

	var setup = {
	 defines: defines,
	 copy: [
	   ['src/images', BUILD_DIR],
	   ['src/inc', BUILD_DIR],
	   ['src/locale-dbv', BUILD_DIR],
	   ['LICENSE', BUILD_DIR],
	   ['pdf.js/external/webL10n/l10n.js', BUILD_DIR],
	   ['src/compatibility.js', BUILD_DIR],
	   ['pdf.js/external/bcmaps/*', BUILD_DIR + '/cmaps/']
	 ],
	 preprocess: [
	   ['src/viewer.html', BUILD_DIR],
     [BUILD_DIR + '*.js', BUILD_DIR]
	 ],
	 preprocessCSS: [
	   ['generic', 'src/viewer.css', BUILD_DIR + '/viewer.css']
	 ]
	};

	builder.build(setup);

	cleanupJSSource(BUILD_DIR + '/viewer.js');
	cleanupCSSSource(BUILD_DIR + '/viewer.css');

  echo('.. done');
};



//
// make locale
// Creates localized resources for the viewer and extension.
//
target.locale = function() {
  var VIEWER_LOCALE_OUTPUT = BUILD_DIR + '/locale/';

  cd(ROOT_DIR);
  echo();
  echo('### Building localization files');

  rm('-rf', VIEWER_LOCALE_OUTPUT);
  mkdir('-p', VIEWER_LOCALE_OUTPUT);

  var subfolders = ls(LOCALE_SRC_DIR);
  subfolders.sort();
  //var metadataContent = '';
  //var chromeManifestContent = '';
  var viewerOutput = '';
  for (var i = 0; i < subfolders.length; i++) {
    var locale = subfolders[i];
    var path = LOCALE_SRC_DIR + locale;
    if (!test('-d', path)) {
      continue;
    }
    if (!/^[a-z][a-z]([a-z])?(-[A-Z][A-Z])?$/.test(locale)) {
      echo('Skipping invalid locale: ' + locale);
      continue;
    }

    mkdir('-p', VIEWER_LOCALE_OUTPUT + '/' + locale);

    if (test('-f', path + '/viewer.properties')) {
      viewerOutput += '[' + locale + ']\n' + '@import url(' + locale + '/viewer.properties)\n\n';
      cp(path + '/viewer.properties', VIEWER_LOCALE_OUTPUT + '/' + locale);
    }

  }

  viewerOutput.to(VIEWER_LOCALE_OUTPUT + 'locale.properties');

  echo('.. done');
};




function stripCommentHeaders(content) {
  var notEndOfComment = '(?:[^*]|\\*(?!/))+';
  var reg = new RegExp(
    '\n/\\* Copyright' + notEndOfComment + '\\*/\\s*' +
    '(?:/\\*' + notEndOfComment + '\\*/\\s*|//(?!#).*\n\\s*)*' +
    '\\s*\'use strict\';', 'g');
  content = content.replace(reg, '');
  return content;
}

function cleanupJSSource(file) {
  var content = cat(file);

  content = stripCommentHeaders(content);

  content.to(file);
}

function cleanupCSSSource(file) {
  var content = cat(file);

  // Strip out all license headers in the middle.
  var reg = /\n\/\* Copyright(.|\n)*?Mozilla Foundation(.|\n)*?\*\//g;
  content = content.replace(reg, '');

  content.to(file);
}




target.publish_dbv = function(versionJSON, token) {

  var version = versionJSON.version;

  echo('### commiting built version ' + version + ' | ' + token);

  exec(
	'git clone https://'+token+'@github.com/dainst/dai-book-viewer-built.git tmp && ' + 
	'cp -r build/* tmp && ' + 
  	'cd tmp && ' +
	'echo " dai-book-viewer build ' + version +  ' timestamp ' + Date.now() + '" >> build.info &&' + // because we don't want jenkins to fail, just because there is nothing to commit!
 	'git add . && ' +
  	'git commit -m "build dai book viewer version '+version+'" && ' +
  	'git push origin master && ' +
  	'cd .. && ' +
  	'rm -r tmp'
  ); // must be one command, otherwise it forgets github api token
  echo('..done');

}




exports.stripCommentHeaders = stripCommentHeaders;
exports.builder = builder;
