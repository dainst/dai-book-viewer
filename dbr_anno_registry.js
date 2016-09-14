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
    define('pdfjs-dbv/dbr_anno_registry', ['exports', 'pdfjs-dbv/pdfjs'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebAnnoRegistry = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {

	
	function AnnoRegistry() {
	}

	AnnoRegistry.prototype = {
			
			/* file information */
			url: '',
			filename: '',			
			
			/* registry for loaded annotations ordered by ID */
			registry: {},
			
			/* status view */
			state: 'wait',  
			states: {
				'wait': 0, 
				'loading': 1, 
				'ready': 2,
				'error': -1
			},
			statusDiv: null,
			
			/* data loader functions */
			successFn: function() {},
			errorFn: function() {},
			
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
				var url = source + '/' + restparams.join('/');
				var get = post ? 'POST': 'GET';
				
				console.log('fetch', get, url);
				
				this.setState('loading');
				
				var request = new XMLHttpRequest();
				request.open('get', url, true);
				request.onload = function() {
					if (request.status >= 200 && request.status < 400) {
						try {
							var data = JSON.parse(request.responseText);
						} catch (e) {
							return self.error(e, request);
						}
						console.log('ADS Success', data);
						self.successFn(data);
						self.registerSet(data);
						self.setState('ready');
					} else {
						return self.error('404 not found: ' + url, request);
					}
				}
				request.onerror = function(e) {
					return self.error(e, request);
				};

				request.send();
				
				
			},
			
			/**
			 * registers a set
			 * @param data
			 */
			registerSet: function(data) {
				console.log(data);
				for (var type in data) {
					for (var i = 0; i < data[type].items.length; i++) {
						var annotation = data[type].items[i];
						annotation.type = type;
						this.registerAnnotation(annotation);
					}
				}
			},
			
			/**
			 * registers an annotation and returns if it was already registered
			 * 
			 * @param annotation
			 * @returns {Boolean}
			 */
			registerAnnotation: function(annotation) {
		
				annotation.lemma = annotation.lemma || annotation.terms[0] ||  '<annotation>';
				annotation.type = annotation.type || 'link';

				this.registry[annotation.id] = annotation;
				
				return true;
				
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
				console.log(this.errorFn)
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
	
	exports.AnnoRegistry = AnnoRegistry;
}));
