'use strict';
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbv_anno_editor', ['exports', 'pdfjs-dbv/pdfjs'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebAnnoEditor = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {

	var AnnoEditor = (function AnnoEditorClosure() {
	
		function AnnoEditor(options) {
			this.annoRegistry = options.annoRegistry;
			this.findController = options.findController;
			this.eventBus = options.eventBus;
			this.$ = options.annoSidebar;
			this.$.parent = this;
			this._addEventListeners();
		}
		
		function annotation(type) {
			return {
				type: type || 'other',
				terms: [],
				lemma: '',
				pages: [],
				text: '',
				references: {},
				coordinates: [],
				id: 'id#' + Math.random(),
				new: true
			}
		}
		
		var annotationBase = {
			terms: {},
			lemma: {},
			pages: {},
			text:  {},
			id: {}
		};
		
		var annotationTypes = {
	        'locations': {
	        	'longitude': 	{'type': 'number', 'min': '-180', 'max': '180', 'step': '0.00000000000001'},
	        	'latitude': 	{'type': 'number', 'min': '-90', 'max': '90', 'step': '0.00000000000001'},
	        },
	        'keyterms': {}, 
	        'persons': {},
	        'other': {}
		};
	
		AnnoEditor.prototype = {
				
			editorElements: {
				input: {},
				types: {},
				typeSpecific: {}
			},
			
			editorNewAnnotation: new annotation(),
			editorNewCollection: {},


			load: function() {
				this.displayEditor();
			},
			
			displayEditor: function() {
				var self = this;
				
				this.editorContentEditor();
				this.editorContentOverview();
				
				//document.getElementById('viewer').addEventListener('mouseup', function(e) {return self.getSelection(e)});				
			},
			
			editorContentEditor: function() {
				var block = this.$.block('edit', 'Annotation Editor', '', false, false, {
					"store": {
						icon: 'floppy-save',
						eventListeners: {'click': 'saveAnnotation'},
						caption: 'save annotation'
					}
				});
				
				var typesList = block.appendChild(this.$.htmlElement('div', {'classes': ['dbv-edit-types-list']}, ''));
				
				for (var field in annotationBase) {
					var attr = annotationBase[field];
					attr.type = attr.type || 'text';
					attr.id = 'dbv-edit-annotation-input-' + field;
					this.editorElements.input[field] = this.$.htmlInput(attr, field, {'keyup': ['editNewAnnotation', field]}, typesList);
				}
				
				for (var type in annotationTypes) {
					var tab = typesList.appendChild(this.$.htmlElement('div', {'id': 'dbv-edit-annotation-type-' + type, 'classes': ['dbv-edit-annotation-type']}));
					this.editorElements.types[type] = this.$.htmlInput({'type':'radio'}, type, {'click': ['clickAnnoTypeSelector', type]}, tab);
					var tob = tab.appendChild(this.$.htmlElement('div', {'classes': ['dbv-edit-annotation-tab', 'hidden']}))
					for (var field in annotationTypes[type]) {
						var fieldset = annotationTypes[type][field];
						fieldset.id = 'dbv-edit-annotation-input-' + field;
						fieldset.data = {'id': field};
						this.editorElements.input[field] = this.$.htmlInput(fieldset, field, {'keyup': ['editNewAnnotation', field]}, tob);
					}
					this.editorElements.typeSpecific[type] = tob;
					this.editorNewCollection[type] = {'items': []};
				}
				block.appendChild(typesList);
				this.editorElements.result = block.appendChild(this.$.htmlElement('pre', {id: 'dbv-edit-annotation-result'}));
			},
			
			editorContentOverview: function() {
				var block = this.$.block('overview', 'Saved Annotations', 'pencil', {'items': ''});
				this.editorElements.overview = block.appendChild(this.$.htmlElement('pre', {id: 'dbv-edit-annotation-overview'}));
			},
			
			onTextmarker: function(text, pageIdx) {

				if (typeof this.editorNewAnnotation.new !== "undefined" || !this.editorNewAnnotation.new) {
					return;
				}

			    if (text !== '') {
				    this.updateNewAnnotation('terms', text);
				    this.updateNewAnnotation('lemma', text);
			    }
				

				if (pageIdx) {
					var page = pageIdx - 1;
					if (this.editorNewAnnotation.pages.indexOf(page) === -1) {
						this.editorNewAnnotation.pages.push(page);
					}
				}
					
				this.viewNewAnnotation();
			},

			clickAnnotation: function(annotation) {
				this.editorNewAnnotation = annotation;
				this.displayAnnotationInEditor();
			},
			
			saveAnnotation: function() {
				console.log(this.editorNewCollection);

				this.editorNewCollection[this.editorNewAnnotation.type].items.push(this.editorNewAnnotation);
				
				this.annoRegistry.registerAnnotation(this.editorNewAnnotation);
				this.findController.showAnnotation(this.editorNewAnnotation);
				
				this.editorNewAnnotation = new annotation(this.editorNewAnnotation.type);
				this.viewNewAnnotation();
				this.editorElements.overview.textContent = JSON.stringify(this.editorNewCollection, null, "  ");
				
			},

			clickAnnoTypeSelector: function(event, at) {
				this.selectNewAnnoType(at);
				this.viewNewAnnotation();
			},
			
			selectNewAnnoType: function(at) {
				if (typeof this.editorElements.typeSpecific[at] !== "undefined") {


					this.editorElements.typeSpecific[at].classList.remove('hidden');
				} else {
					console.log('at is', at, this.editorElements.typeSpecific);
				}

				this.$.blocks.edit.header.className = 'panel-heading dbv-colors-' + at;
				this.editorNewAnnotation.type = at;
			},
			
			editNewAnnotation: function(e, field) {
				this.updateNewAnnotation(field, ((typeof e.target.validity  === "undefined") || (e.target.validity.valid)) ? e.target.value : '');
			},
			
			updateNewAnnotation: function(field, value) {
				value = value.replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1');
				if (field === 'terms') {
					this.editorNewAnnotation[field] = [value];
				} else if (field === 'pages') {
					this.editorNewAnnotation[field] = value.split(',').map(function(a){return parseInt(a)}).filter(function(a){return !isNaN(a)});
				} else if (field === 'longitude') {
					this.editorNewAnnotation['coordinates'][0] = value;
				} else if (field === 'latitude') {
					this.editorNewAnnotation['coordinates'][1] = value;
				} else {
					this.editorNewAnnotation[field] = value;	
				}
	
				this.viewNewAnnotation();
			},
			
			displayAnnotationInEditor: function() {
				var self = this;
				
				function updateInput(field, value) {
					//console.log(self.editorElements.input[field]);
					if (typeof self.editorElements.input[field] !== "undefined") {
						self.editorElements.input[field].value = value; 
					}
				}

				function sortStringsLikeNumbers(a, b) {
					return parseInt(a) - parseInt(b);
				}
				
				for (var radio in this.editorElements.types) {
					this.editorElements.types[radio].checked = false;
				}

				for (var field in this.editorNewAnnotation) {
					var value = this.editorNewAnnotation[field];
					var it = '';
					value = (field === 'terms') ? value.sort().join(', ') : value;
					value = (field === 'pages') ? value.sort(sortStringsLikeNumbers).join(', ') : value;
					if (value  && (field === 'coordinates')) {
						updateInput('longitude', value[0]);
						updateInput('latitude', value[1]);
					} else {
						updateInput(field, value);
					}
					if (field === 'type') {
						if (typeof this.editorElements.types[value] !== "undefined") {
							this.editorElements.types[value].checked = true;
							this.selectNewAnnoType(value);
						} else {
							console.log('type not done', type);
						}

					}
				}
				
				
			},
			
			viewNewAnnotation: function() {
				this.displayAnnotationInEditor();
				this.editorElements.result.textContent = JSON.stringify(this.editorNewAnnotation, null, "\t");
			},

			/**
			 * @private
			 */
			_addEventListeners: function annoViewer_addEventListeners() {
				this.eventBus.on('annotationEvent::editAnnotations', function(e) {
					if (e.type == 'click') {
						this.clickAnnotation(e.annotation, e.target);
					}
				}.bind(this));
				this.eventBus.on('textmarker::editAnnotations', function(e) {
					this.onTextmarker(e.text, e.pageIdx);
				}.bind(this));
			}
		}
		return AnnoEditor;
	})();

	exports.AnnoEditor = AnnoEditor;
}));