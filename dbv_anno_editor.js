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
			this.$ = options.annoSidebar;
			this.$.parent = this;
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
				id: 'id#' + Math.random()
			}
		};
		
		var annotationBase = {
			terms: {},
			lemma: {},
			pages: {},
			text:  {}
		}
		
		var annotationTypes = {
	        'locations': {
	        	'longitude': 	{'type': 'number', 'min': '-180', 'max': '180', 'step': '0.00000000000001'},
	        	'latitude': 	{'type': 'number', 'min': '-90', 'max': '90', 'step': '0.00000000000001'},
	        },
	        'keyterms': {}, 
	        'persons': {},
	        'other': {}
		}
	
		AnnoEditor.prototype = {
				
			editorElements: {
				input: {},
				types: {}
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
				var block = this.$.block('edit', 'Annotation Editor', 'pencil', {'items': ''});	
				
				var typesList = block.appendChild(this.$.htmlElement('div', {'classes': ['dbv-edit-types-list']}, ''));
				
				for (var field in annotationBase) {
					var attr = annotationBase[field];
					attr.type = attr.type || 'text';
					attr.id = 'dbv-edit-annotation-input-' + field;
					this.editorElements.input[field] = this.$.htmlInput(attr, field, {'keyup': ['editNewAnnotation', field]}, typesList);
				}
				
				for (var type in annotationTypes) {
					var tab = typesList.appendChild(this.$.htmlElement('div', {'id': 'dbv-edit-annotation-type-' + type, 'classes': ['dbv-edit-annotation-type']}));
					this.editorElements.types[type] = this.$.htmlInput({'type':'radio'}, type, {'click': ['selectNewAnnoType', type]}, tab);
					var tob = tab.appendChild(this.$.htmlElement('div', {'classes': ['dbv-edit-annotation-tab', 'hidden']}))
					for (var field in annotationTypes[type]) {
						var fieldset = annotationTypes[type][field];
						fieldset.id = 'dbv-edit-annotation-input-' + field;
						fieldset.data = {'id': field};
						this.editorElements.input[field] = this.$.htmlInput(fieldset, field, {'keyup': ['editNewAnnotation', field]}, tob);
					}
					this.editorNewCollection[type] = {'items': []};
				}
				block.appendChild(typesList);
				this.editorElements.result = block.appendChild(this.$.htmlElement('pre', {id: 'dbv-edit-annotation-result'}));
				this.editorElements.submit = block.appendChild(this.$.htmlElement('a', {}, 'Save Annotation', {'click': 'saveAnnotation'}));
				
			},
			
			editorContentOverview: function() {
				var block = this.$.block('overview', 'Saved Annotations', 'pencil', {'items': ''});
				this.editorElements.overview = block.appendChild(this.$.htmlElement('pre', {id: 'dbv-edit-annotation-overview'}));
			},
			
			onTextmarker: function(text) {

	
			    if (text != '') {
				    this.updateNewAnnotation('terms', text);
				    this.updateNewAnnotation('lemma', text);
			    }
	
				
				// find page number
				function hasClass(el, className) {
					return el ? ((el.classList) ? el.classList.contains(className): new RegExp('(^| )' + className + '( |$)', 'gi').test(el.className)) : false;
				}
				var parent = e.target.parentNode;
				while (parent && !hasClass(parent, 'page')) {parent = parent.parentNode;}
				if (parent) {
					var page = parseInt(parent.dataset.pageNumber) - 1;
					if (this.editorNewAnnotation.pages.indexOf(page) === -1) {
						this.editorNewAnnotation.pages.push(page);
					}
				}
					
				this.viewNewAnnotation();
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
			
			selectNewAnnoType: function(e, at) {
				var tabs = document.getElementsByClassName('dbv-edit-annotation-tab');
				for (var i = 0; i < tabs.length; i++) {
					tabs[i].classList.add('hidden');
				}
				e.target.parentNode.querySelector('.dbv-edit-annotation-tab').classList.remove('hidden');
				
				this.$.blocks.edit.block.querySelector('h3.panel-title ').className = 'panel-title dbv-colors-' + at;
				this.editorNewAnnotation.type = at;
				this.viewNewAnnotation();
			},
			
			editNewAnnotation: function(e, field) {
				this.updateNewAnnotation(field, ((typeof e.target.validity  === "undefined") || (e.target.validity.valid)) ? e.target.value : '');
			},
			
			updateNewAnnotation: function(field, value) {
				value = value.replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1');
				if (field == 'terms') {
					this.editorNewAnnotation[field] = [value];
				} else if (field == 'pages') {
					this.editorNewAnnotation[field] = value.split(',').map(function(a){return parseInt(a)}).filter(function(a){return !isNaN(a)});
				} else if (field == 'longitude') {
					this.editorNewAnnotation['coordinates'][0] = value;
				} else if (field == 'latitude') {
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
				
				for (var radio in this.editorElements.types) {
					this.editorElements.types[radio].checked = false;
				}
				
				for (var field in this.editorNewAnnotation) {
					var value = this.editorNewAnnotation[field];
					var it = '';
					
					value = (field == 'terms') ? value.join(', ') : value;					
					value = (field == 'pages') ? value.join(', ') : value;
					if (field == 'coordinates') {
						updateInput('longitude', value[0]);
						updateInput('latitude', value[1]);
					} else {
						updateInput(field, value);
					}
					if (field == 'type') {
						this.editorElements.types[value].checked = true;
					}
				}
				
				
			},
			
			viewNewAnnotation: function() {
				this.displayAnnotationInEditor();
				this.editorElements.result.textContent = JSON.stringify(this.editorNewAnnotation, null, "\t");
			}
		}
		return AnnoEditor;
	})();

	exports.AnnoEditor = AnnoEditor;
}));