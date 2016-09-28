'use strict';

/**
 * 
 * this object is the registry for annotations
 * it can fetch annotations frm nlp database or other sources and know wich are already displayed 
 * 
 * 
 * registry structure is:
 * 
 * {
 * 	<page>: 
 * 	 [
 * 		<type:lemma>:
 * 			{
 * 				term: ...,
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
			successFn: {},
			errorFn: function() {},
			
			loadingPromise: null,
			loadingPromiseResolver: null,
			
			reset: function() {
				this.url = '';
				this.filename = '';
				this.state = 'wait';
				this.registry = {};
				this.metadata = {};
				
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
			 * 
			 * get annotations from annotation API
			 * 
			 * 
			 * @param restparams	<array>			list subfolders / REST-arguments   
			 * @param source		<string>		URL of the API/File
			 * @param post			<boolean>		true: use POST; false (or omit) use GET
			 */
			getAnnotations: function(restparams, source, post) {
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
						
						setTimeout(function(){ 
							self.loadingPromiseResolver(data);
						}, 10000);
						

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
			 * registers a function, which get called after data loading
			 * @param fn
			 */
			onGetAnnotations: function(fn) {				
				var name = 'fn__' + Object.keys(this.successFn).length;
				this.successFn[fn.name || name] = fn;
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
			 * display Error with errorFn
			 * 
			 * 
			 * @param e
			 * @param x
			 */
			error: function(e, x) {
				console.log('Error: ', e, x);
				this.setState('error');
				this.errorFn(e);
			},
			
			setFilename: function(url) {
				this.url = url;
				this.filename = url.split('/').pop();
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
