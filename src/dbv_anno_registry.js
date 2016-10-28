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
			metadata: {},
			
			/* registry for loaded annotations ordered by ID */
			registry: {},
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
			successFn: 	{},
			errorFn: 	{},
			
			loadingPromise: null,
			loadingPromiseResolver: null,
			
			reset: function() {
				this.url = '';
				this.filename = '';
				this.state = 'wait';
				this.registry = {};
				this.metadata = {};
				this.mayloadmore = false;
				
				this.loadingPromiseReset();
			},
			
			loadingPromiseReset: function() {
				this.loadingPromise = new Promise(function(resolve) {
					this.loadingPromiseResolver = resolve;
				}.bind(this), function (reason) {
					this.error(reason);
			    }.bind(this));
				
				this.loadingPromise.then(function(data) {
					console.log('ADS Resolve', data, this.successFn);
					this.registerSet(data);
					for (var fn in this.successFn) {
						this.successFn[fn](data);
					}
					this.setState('ready');
				}.bind(this));
			},
			
			/**
			 * get annotation for file from default source
			 * 
			 * @param identifier	<object>	{<filename|daiPubId>: <string>} 
			 */
			get: function(identifier) {
				if (identifier.daiPubId) {
					console.warn("get Annotations by daiPubId is not implemented right now");
				}
				
				if (identifier.filename) {
					this.setFilename(identifier.filename);
					this.getAnnotations(['testdata', 'digest_' + this.filename + '.json'],'http://195.37.232.186/DAIbookViewer');
					return;
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
				var source = source || 'https://nlp.dainst.org:3000/';
				var url = source + '/' + restparams.join('/') + '?cachekiller' + Date.now();
				var get = post ? 'POST': 'GET';
				
				//console.log('fetch', get, url);
				
				this.setState('loading');
				
				this.loadingPromiseReset();
				
				var request = new XMLHttpRequest();
				//request.timeout = 5000;
				request.open('get', url, true);
				request.onload = function() {
					if (request.status >= 200 && request.status < 400) {
						try {
							var data = JSON.parse(request.responseText);
						} catch (e) {
							return self.error(e, request);
						}
						console.log('ADS Success');
						
						//setTimeout(function(){ 
							self.loadingPromiseResolver(data);
						//}, 10000);
						

					} else {

						return self.error('404 not found: ' + url, request);
					}
				}
				request.onerror = function(e) {
					return self.error(e, request);
				};
				request.ontimeout = function(e) {
					console.log("ADS timeout");
					return self.error(e, request);
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
			        	this.error("Wrong filetype " +  file.type);
			        	return;
			        }
			        			        
			        this.loadingPromiseReset();
			        var reader = new FileReader();

			        reader.onload = function(e) {
			              try {				            	  
			            	  var result = JSON.parse(e.target.result);
			              } catch (e) {
			            	  return this.error(e);
			              }
			              this.loadingPromiseResolver(result);
			        }.bind(this);

			        reader.onerror = function(e){
			        	return this.error(e);
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
			
			
			/**
			 * display Error with errorFn
			 * 
			 * 
			 * @param e
			 * @param x
			 */
			error: function(e, x) {
				console.log('Error: ', e, x);
				this.setState('error');
				this.loadingPromiseResolver({});
				for (var fn in this.errorFn) {
					this.errorFn[fn](e, x);
				}
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
