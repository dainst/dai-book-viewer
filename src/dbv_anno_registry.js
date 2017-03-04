'use strict';

/**
 *
 * this object is the registry for annotations
 * it can fetch annotations frm nlp database or other sources and know wich are already displayed
 *
 *
 *
 *
 * @param root
 * @param factory
 */

//#if !PRODUCTION
const TEST_DATA_URL = 'http://localhost:63342/dai-book-viewer/DAIbookViewer';
//#else
//const TEST_DATA_URL = false;
//#endif

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbv_anno_registry', ['exports', 'pdfjs-dbv/pdfjs'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebAnnoRegistry = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {

	var AnnoRegistry = (function AnnoRegistryClosure() {
		function AnnoRegistry() {
			this.reset();
		};

		AnnoRegistry.prototype = {

			/* file information */
			url: '',
			filename: '',
			pubid: '',
			metadata: Object.create(null),

			/* registry for loaded annotations ordered by ID */
			registry: Object.create(null),
			mayloadmore: false,

			/* status view */
			state: 'wait',
			states: {
				'wait': 0,
				'loading': 1,
				'ready': 2,
				'error': 9
			},
			statusDiv: null,

			/* data loader functions */
			successFn: 	Object.create(null),
			errorFn: 	Object.create(null),

			loadingPromise: null,
			loadingPromiseResolver: null,
			loadingPromiseFail: null,
			loadingPromiseAlways: null, // gets resolved if loading promise fails or not
			loadingPromiseAlwaysResolver: null, // gets resolved if loading promise fails or not

			reset: function() {
				this.url = '';
				this.filename = '';
				this.state = 'wait';
				this.registry = Object.create(null);
				this.metadata = Object.create(null);
				this.mayloadmore = false;

				this.loadingPromiseReset();
			},

			/**
			 * while app loading phase, several componets can bind functions to annotation loading success or fail
			 * with this.onGetAnnotations
			 *
			 * if some functions shall be bound only on the next loading promise use then() and catch() functions
			 * of this.loadingPromise oder this.loadingPromiseAlways. The latter resolves when the first resolves or fails
			 * and can be used to indicate, that the attempt to get annotations for this document is now over.
			 *
			 *
			 */
			loadingPromiseReset: function() {
				this.loadingPromise = new Promise(
					function(resolve, fail) {
						this.loadingPromiseResolver = resolve;
						this.loadingPromiseFail = fail;
					}.bind(this)
				);

				this.loadingPromiseAlways = new Promise(
					function(resolve, fail) {
						this.loadingPromiseAlwaysResolver = resolve;
					}.bind(this)
				);

				this.loadingPromise
					.then(
					function(data) {
						console.log('ADS Resolve', data, this.successFn);
						this.registerSet(data);
						for (var fn in this.successFn) {
							this.successFn[fn](data);
						}
						this.loadingPromiseAlwaysResolver();
						this.setState('ready');
					}.bind(this)
					)
					['catch'](
					function(e, x) {
						e = (typeof e.getMessage === "function") ? e.getMessage() : e;
            			console.warn('ADS Error: ', e);
						this.setState('error');
						for (var fn in this.errorFn) {
							this.errorFn[fn](e, x);
						}
						this.loadingPromiseAlwaysResolver();
					}.bind(this)
				);

			},

			/**
			 * get annotation for file from default source
			 *
			 * @param identifier	<object>	{<filename|daiPubId>: <string>}
			 */
			get: function(identifier) {
				console.log(identifier);

				if (identifier.filename) {
					this.setFilename(identifier.filename);
				}

				this.pubid = identifier.pubid;

				// dai pubid
				if (identifier.pubid) {
          		console.log("get annotations by daiPubId: " + identifier.pubid);
				  this.getAnnotations(['annotations', identifier.pubid]);
					return;
				} else if (identifier.filename && TEST_DATA_URL) {
					console.warn("get annotations by filename is for testing only");
					this.getAnnotations(['testdata', 'digest_' + this.filename + '.json'], TEST_DATA_URL);
					return;
				} else {
          			this.loadingPromiseFail('no annotations to load');
        		}
			},

			/**
			 *
			 * get annotations from annotation API
			 *
			 *
			 * @param restparams	<array>			list subfolders / REST-arguments
			 * @param source		<string>		URL of the API/File
			 * @param post			<boolean>		true: use POST; false (or omit) use GET
			 */
			getAnnotations: function(restparams, source, post) {

				if (this.state == 'loading') {
					return;
				}

				var self = this;

				var restprams = restparams || [];
				var source = source || 'https://nlp.dainst.org:3000';
				var url = source + '/' + restparams.join('/') + '?cachekiller' + Date.now();

				var get = post ? 'POST': 'GET';

				//console.log('fetch', get, url);

				this.setState('loading');

				this.loadingPromiseReset();

				var request = new XMLHttpRequest();
				request.timeout = 5000;
				request.open('get', url, true);
				request.onload = function() {
					if (request.status >= 200 && request.status < 400) {
						try {
							var data = JSON.parse(request.responseText);
							if (self.checkAnnotationCount(data) > 0) {
								//setTimeout(function(){
								self.loadingPromiseResolver(data);
								//}, 10000);
								console.log('ADS Success');
							} else {
								return self.loadingPromiseFail('ADS no results', request);
							}
						} catch (e) {
							return self.loadingPromiseFail('JSON Parse Error: ' + e, request);
						}
					} else {
						return self.loadingPromiseFail('404 not found: ' + url, request);
					}
				}
				request.onerror = function(e) {
					return self.loadingPromiseFail('Request Error:' + e, request);
				};
				request.ontimeout = function(e) {
					console.log("ADS timeout");
					return self.loadingPromiseFail('Timeout: ' + e, request);
				}

				request.send();
			},

			/**
			 * open local file and get annotations from there
			 */
			getFromLocalFile: function() {

				if (this.state == 'loading') {
					return;
				}

				this.setState('loading');
				var fileInput = document.createElement('input');
				fileInput.id = 'tmpfileopener';
				fileInput.setAttribute('type', 'file');
				//document.body.appendChild(fileInput); // <- never ever enable this

				fileInput.addEventListener('change', function(e) {
			        var files = fileInput.files;
			        var len = files.length;

			    	var file = files[0];

			    	if (!file) {
			    		console.log("No File Selected");
			    		return;
			    	}

			        console.log("Filename: " + file.name + " | Type: " + file.type + " | Size: " + file.size + " bytes");

			        if (file.type !== "text/json") {
			        	this.loadingPromiseFail("Wrong filetype: " +  file.type);
			        	return;
			        }

			        this.loadingPromiseReset();
			        var reader = new FileReader();

			        reader.onload = function(e) {
			              try {
			            	  var result = JSON.parse(e.target.result);
			              } catch (e) {
			            	  return this.loadingPromiseFail(e);
			              }
			              this.loadingPromiseResolver(result);
			        }.bind(this);

			        reader.onerror = function(e){
			        	return this.loadingPromiseFail(e);
			        }.bind(this);

			        reader.readAsText(file);


				}.bind(this));
				fileInput.click();

			},

			/**
			 * registers a function, which get called after data loading
			 * this is something wich exactly works like a promise, and actually I just realized that too late...
			 * @param fn
			 * @param errorFn
			 */
			onGetAnnotations: function(fn, errorFn) {

				if (typeof fn === 'function') {
					var name = 'fn__' + Object.keys(this.successFn).length;
					this.successFn[fn.name || name] = fn;
				}

				if (typeof errorFn === 'function') {
					var name = 'fn__' + Object.keys(this.errorFn).length;
					this.errorFn[errorFn.name || name] = errorFn;
				}
			},

			/**
			 * registers a set
			 * @param data
			 */
			registerSet: function(data) {
				for (var type in data) {
					// register metadata
					if (type == 'meta') {
						this.metadata = data[type];
						continue;
					}
					// register items
					data[type].items = data[type].items || [];
					for (var i = 0; i < data[type].items.length; i++) {
						var annotation = data[type].items[i];
						annotation.type = type;
						this.registerAnnotation(annotation);
					}
					// may load more
					if (data[type].more) {
						this.mayloadmore = true;
					}
				}
			},


			checkAnnotationCount: function(data) {
				var count = 0;
				for (var type in data) {
					if (typeof data[type].items !== "undefined") {
						count += data[type].items.length;
					}
				}
				return count;
			},

			/**
			 * registers an annotation
			 *
			 * Attention: annotation only gets added to collection, not shown
			 *
			 *
			 * @param annotation
			 * @returns annotation
			 */
			registerAnnotation: function(annotation) {

				annotation.lemma = annotation.lemma || annotation.terms[0] ||  '<annotation>';
				annotation.type = annotation.type || 'link';

				this.registry[annotation.id] = annotation;

				return this.registry[annotation.id];

			},

			/**
			 * Returns all registered annotations in the very same form we get them
			 *
			 * @returns <object>
			 */
			dump: function() {
				var ret = {};

				for (var id in this.registry) {
					var type = this.registry[id].type;
					if (typeof ret[type] === "undefined") {
						ret[type] = {
								"items": []
						}
					}
					ret[type].items.push(this.registry[id]);
				}

				ret.meta = this.metadata;

				ret.meta['downloaded_at'] = Date.now();


				return ret;
			},




			setFilename: function(url) {
				this.url = url;
				this.filename = url.split('/').pop();
			},


			/**
			 * return 0 if there are annotations, and no hint for more, otherwise the number of loaded annotations
			 * @returns <int>
			 */
			count: function() {
				var len = Object.keys(this.registry).length;
				if (len > 0 || this.mayloadmore) {
					return len;
				}
				return 0;
			},

			/**
			 *
			 * set state of the anno-Registry
			 *
			 *
			 * @param state		<string>	@see A available states above
			 */
			setState: function(state) {
				// set state if given
				if (typeof state !== "undefined") {
					this.state = state;
				}

				// create div if not existing
				if (this.statusDiv == null) {
			        var div = document.createElement('div');
			        div.className = 'dbv-av-state';
			        document.getElementById('dbv-annotationsView').appendChild(div);
			        this.statusDiv = div;
				} else {
					var div = this.statusDiv;
				}

				// set class of div
				for (var st in this.states) {
					div.classList.remove(st);
				}
				div.classList.add(state);
			}




		}
		return AnnoRegistry;
	})();


	exports.AnnoRegistry = AnnoRegistry;
}));
