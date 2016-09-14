'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbr_anno_viewer', ['exports', 'pdfjs-dbv/pdfjs', 'pdfjs-dbv/ui_utils'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'), require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebAnnoViewer = {}), root.pdfjsWebPDFJS, root.pdfjsWebUIUtils);
  }
}(this, function (exports, pdfjsLib, uiUtils) {
	
	var scrollIntoView = uiUtils.scrollIntoView;

	/**
	 * @class
	 */
	var AnnoViewer = (function AnnoViewerClosure() {

		function AnnoViewer(options) {
			this.container = options.container;
			this.editContainer = options.editContainer;
			this.eventBus = options.eventBus;
			this.annoRegistry = options.annotationRegistry;
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
		
		AnnoViewer.prototype = {

			
			/* registry for content blocks in the sidebar */
			blocks: {}, 
			
			/* map */
			map: false,
		
			load: function AnnoViewerLoad(file) { // @ TODO move to registry!? 
				var self = this;		
				this.annoRegistry.successFn 	= function(data) {return self.buildBlocks(data)};
				this.annoRegistry.errorFn 		= function(e) {return self.displayError(e)};
				this.annoRegistry.setFilename(file);
				this.annoRegistry.getAnnotations(['testdata', 'digest_' + this.annoRegistry.filename + '.json'],'http://195.37.232.186/DAIbookViewer');
				this.displayEditor();
			},
			
			setViewer: function(viewer) {
				this.pdfViewer = viewer;
			},
			
			buildBlocks: function(data) {				
				this.block('keyterms', 'Keyterms', 'tags', data.keyterms);
				this.block('places', 'Places', 'map-marker', data.locations);
				this.block('map', 'Map', 'map-marker', data.locations, false, 'populateMap');
				this.block('persons', 'Persons', 'user', data.persons);
			},
			

				
			
			/**
			 * @param id -			<string>		id
			 * @param title 		<string>		headline @ TODO i10n
			 * @param glyphicon 	<string> 		icon code
			 * @param data			<object>
			 * @param loadMore  	<bool> 			show loadMOre button if more results exists? (default:true)
			 * @param populationFn 	<string> 		name of population function (method of this)
			 * 
			 */
			block: function(id, title, glyphicon, data, loadMore, populationFn, editContainer) {
				var self = this;
				
				if (typeof data === "undefined" || typeof data.items === "undefined") {
					return; // @ TODO what if a category has units, but no digest-important ones?
				}
				
				var container = (editContainer === true) ? this.editContainer : this. container;
				
				var block = document.getElementById('dbv-av-block-' + id);
				if (block) {
					block.innerHTML = '';
				} else {
					block		= this.htmlElement('div', {'id': 'dbv-av-block-' + id, 'classes': ['dbv-av-block', 'panel', 'panel-default']});
					container.appendChild(block);
				}
				
				var blocktitle	= this.htmlElement('div',{'classes': ["panel-heading"]});
				var blockh3		= this.htmlElement('h3', {'classes': ['panel-title'], 'data': {'dbv-toggle': id}}, title, {'click': ['toggleBlock', id]});
				var icon		= this.htmlElement('span', {'classes': ['glyphicon', 'glyphicon-' + glyphicon, 'pull-right']});
				var blockbody	= this.htmlElement('div', {'classes':["panel-body"]});
				
				blockh3.appendChild(icon);
				blocktitle.appendChild(blockh3);
				block.appendChild(blocktitle);
				block.appendChild(blockbody);
				
				this.blocks[id] = {
					opened: true,
					block: block
				}
										
				populationFn = populationFn || 'populate';
				this[populationFn](blockbody, data.items);
				
				if ((loadMore !== false) && data.more) {
					var loadMoreBtn = this.htmlElement('div', {'classes': ['btn', 'btn-default', 'dbv-load-more']}, "Load More");// @ TODO  l10n					
					loadMoreBtn.addEventListener('click', function(e) {return self.loadMore(id);});
					blockbody.appendChild(loadMoreBtn); 
				}
				
			},
			
			toggleBlock: function(e, id) {
				e.stopPropagation();				
				
				this.blocks[id].opened = !this.blocks[id].opened; 
				
				if (this.blocks[id].opened) {
					this.blocks[id].block.classList.remove('dbv-hidden');	
				} else {
					this.blocks[id].block.classList.add('dbv-hidden');
				}

			},
			
			/**
			 * default population function
			 */
			populate: function(block, units) {
				self = this;
				
				if (typeof units === "undefined") {
					return;
				}
				
				for(var k = 0; k < units.length; k++) {
					var unit = units[k];
					var entry = this.htmlElement('div', {'classes': ['dbv-av-block-entry']});
					var caption = this.htmlElement('span', {'classes': ['dbv-av-block-entry-caption'], 'data': {'id': unit.id}}, unit.lemma);
					
					caption.addEventListener('click', function(e) {return self.eventHandler(e);})
					caption.addEventListener('mouseover', function(e) {return self.eventHandler(e);})
					caption.addEventListener('mouseout', function(e) {return self.eventHandler(e);})
					
					entry.appendChild(caption);
					entry.appendChild(this.htmlElement('span', {'classes': ['badge', 'pull-right']}, unit.count || 1));
					
					this.references(entry, unit.references);		
					//console.log(k, unit, entry);

					block.appendChild(entry);
				}			
			},
			
			/**
			 * population function for the map
			 * 
			 * 
			 */
			populateMap: function(block, units) {
				var self = this;
				var mapDiv = this.htmlElement('div',{'id':'dbv-av-map', 'style': 'height: 300px'});	
				block.appendChild(mapDiv);
				var b = this.unitBoundaries(units);
				
				// prepare maps
				try {
					var map = new L.Map('dbv-av-map');
				} catch (err) {
					console.log(err);
					return;
				}
				var osmUrl='http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
				var osmAttrib='Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
				var osm = new L.TileLayer(osmUrl, {minZoom: 2, maxZoom: 16, attribution: osmAttrib});		
				var markers = [];
				
				// add them markers
				for (var k = 0; k < units.length; k++) {
					var unit = units[k];
					//console.log(unit);
					try {
						if ((typeof unit.coordinates === "undefined") || (typeof unit.coordinates[0] === "undefined") || (unit.coordinates[0] == "")) {
							continue;
						}
						
						var radius = (isNaN(b.max) || b.max == b.min) ? 10 : (unit.count - b.min) / (b.max - b.min) * (8 - 2) + 2;
						console.log('MM: ' , radius, b);
						
						//var marker = L.marker([parseFloat(unit.coordinates[0]), parseFloat(unit.coordinates[1])]).addTo(map);
						var marker = L.circleMarker(
							[parseFloat(unit.coordinates[0]), parseFloat(unit.coordinates[1])], 
							{	radius:			radius,
								fillColor: 		'#006B00',
								fillOpacity:	0.2,
								color:			'#006B00',
								className:		unit.id // abuse of classname for our sinister goals								
							}
						).addTo(map);						
						
						marker.on('click', function(e) {
							//console.log('MAP:CLICK ', e);
							self.eventHandler(e, 'marker');
						});
						marker.on('mouseover', function(e) {
							//console.log('MAP:mouseover ', e);
							self.eventHandler(e, 'marker');
						});
						marker.on('mouseout', function(e) {
							//console.log('MAP:mouseout ', e);
							self.eventHandler(e, 'marker');
						});
						//marker.bindPopup(unit.lemma + '<span class="badge">' +  unit.count + "</span>");
						
						markers.push(marker);
						this.map = map;
					} catch (err) {
						console.log('MAP:ERR', err);
					}
				}
				
				// if adding markers failed in every  case and we don't have markers
				if (markers.length == 0) {
					mapDiv.parentNode.removeChild(mapDiv);					
					return;
				}
				
				// finish map and add to sidebar
				map.addLayer(osm);
				var markergroup = new L.featureGroup(markers);				
				map.fitBounds(markergroup.getBounds());
				
			},
			
			refreshMap: function() {
				if (this.map) {
					this.map.invalidateSize();	
				}
			},
			
			
			loadMore: function(blockId) {
				console.log('load more ' + blockId);
				this.annoRegistry.getAnnotations(['testdata', 'more.' + blockId + '_' + this.annoRegistry.filename + '.json'],'http://195.37.232.186/DAIbookViewer');
			},
			
			/**
			 * renders the references
			 *
			 * @param block
			 * @param data
			 */
			references: function(block, data) {
				if ((typeof data === "undefined") || (data.length == 0)) {
					return;
				}

				var refbox = this.htmlElement('span', {'classes': ['dbv-av-references']});
				block.appendChild(refbox);
				
				for(var i = 0; i < data.length; i++) {
					
					var ref = data[i];
					
					if (typeof ref.url === 'undefined') {
						continue;
					} 
					
					var refurl = ref.url;
					var reftag = ref.type || 'link';
					var link = this.htmlElement('a', {'classes': ['dbv-av-reference', 'btn', 'btn-xs', 'btn-default'], target:"_blank", href: refurl}, reftag);
					refbox.appendChild(link);
					
				};
			},
			
			displayError: function(e) {
				this.block('error', 'Error getting Annotations', 'alert', {'items': e}, false, 'displayErrorText');
			},
			
			displayErrorText: function(block, e) {
				block.appendChild(this.htmlElement('p', {'classes': ['alert', 'alert-danger']}, e));
			},
			
			
			
			/* annotation editor */
						
			editorElements: {
				input: {},
				types: {}
			},
			
			editorNewAnnotation: new annotation(),
			editorNewCollection: {},
			
			displayEditor: function() {
				var self = this;				
				this.block('edit', 'Annotation Editor', 'pencil', {'items': ''}, false, 'editorContentEditor', true);	
				this.block('overview', 'Saved Annotations', 'pencil', {'items': ''}, false, 'editorContentOverview', true);	
				document.getElementById('viewer').addEventListener('mouseup', function(e) {return self.getSelection(e)});				
			},
			
			editorContentEditor: function(block, c) {
				var typesList = block.appendChild(this.htmlElement('div', {'classes': ['dbv-edit-types-list']}, ''));
				
				for (var field in annotationBase) {
					var attr = annotationBase[field];
					attr.type = attr.type || 'text';
					attr.id = 'dbv-edit-annotation-input-' + field;
					this.editorElements.input[field] = this.htmlInput(attr, field, {'keyup': ['editNewAnnotation', field]}, typesList);
				}
				
				for (var type in annotationTypes) {
					var tab = typesList.appendChild(this.htmlElement('div', {'id': 'dbv-edit-annotation-type-' + type, 'classes': ['dbv-edit-annotation-type']}));
					this.editorElements.types[type] = this.htmlInput({'type':'radio'}, type, {'click': ['selectNewAnnoType', type]}, tab);
					var tob = tab.appendChild(this.htmlElement('div', {'classes': ['dbv-edit-annotation-tab', 'hidden']}))
					for (var field in annotationTypes[type]) {
						var fieldset = annotationTypes[type][field];
						fieldset.id = 'dbv-edit-annotation-input-' + field;
						fieldset.data = {'id': field};
						this.editorElements.input[field] = this.htmlInput(fieldset, field, {'keyup': ['editNewAnnotation', field]}, tob);
					}
					this.editorNewCollection[type] = {'items': []};
				}
				block.appendChild(typesList);
				this.editorElements.result = block.appendChild(this.htmlElement('pre', {id: 'dbv-edit-annotation-result'}));
				this.editorElements.submit = block.appendChild(this.htmlElement('a', {}, 'Save Annotation', {'click': 'saveAnnotation'}));
				console.log(this.editorElements);
				
			},
			
			editorContentOverview: function(block, c) {
				this.editorElements.overview = block.appendChild(this.htmlElement('pre', {id: 'dbv-edit-annotation-overview'}));
			},
			
			getSelection: function(e) {
			    var text = "";
			    if (window.getSelection) {
			        text = window.getSelection().toString();
			    } else if (document.selection && document.selection.type != "Control") {
			        text = document.selection.createRange().text;
			    }

			    if (text != '') {
				    this.updateNewAnnotation('terms', text);
				    this.updateNewAnnotation('lemma', text);
			    }

				
				// find page number
				function hasClass(el, className) {return (el.classList) ? el.classList.contains(className): new RegExp('(^| )' + className + '( |$)', 'gi').test(el.className);}
				var parent = e.target.parentNode;
				while (!hasClass(parent, 'page')) {parent = parent.parentNode;}
				var page = parseInt(parent.dataset.pageNumber) - 1;
				
				if (this.editorNewAnnotation.pages.indexOf(page) === -1) {
					this.editorNewAnnotation.pages.push(page);
				}
				
				this.viewNewAnnotation();
			},
			
			saveAnnotation: function() {
				console.log(this.editorNewCollection);
				
				this.editorNewCollection[this.editorNewAnnotation.type].items.push(this.editorNewAnnotation);
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
				this.editorNewAnnotation.type = at;
				this.viewNewAnnotation();
			},
			
			editNewAnnotation: function(e, field) {
				this.updateNewAnnotation(field, ((typeof e.target.validity  === "undefined") || (e.target.validity.valid)) ? e.target.value : '');
			},
			
			updateNewAnnotation: function(field, value) {
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
			},
			
			/**
			 * This creates an HTML element
			 * @param type
			 * @param attributes - can have the following parts: 
			 * 	classes 	[<string>, <string>, ...]
			 * 	id			<string>
			 * 	href		<string>
			 * 	alt			<string>
			 * 	src			<string>
			 *  target		<string>
			 *  style 		<string>
			 *  data 		{<key>: <value>, <key2>: <value2>, ...}
			 * @param content - creates a textnode inside
			 * @param eventListeners - obejct in the form: {
			 *  {<eventname>: [<functionname>, <parameter>] (functionname = method of this class)
			 * @return el the element
			 */
			htmlElement: function(type, attr, content, eventListeners) {
				var self = this;				
				var el = document.createElement(type);
				attr = attr || {};
				if (typeof attr.classes === "object" && typeof attr.classes.join === "function") {
					el.className = attr.classes.join(" ");
				}
				var skipAttrs = ['classes', 'data'];
				var transAttrs = {'class': 'className', 'for': 'htmlFor'};
				for (var key in attr) {
					if (skipAttrs.indexOf(key) !== -1) {
						continue;
					}
					
					if (typeof transAttrs[key] !== "undefined") {
						el[transAttrs[key]] = attr[key];
					} else {
						el[key] = attr[key];
					}
				}
				for (var key in attr.data) {
					el.setAttribute('data-' + key, attr.data[key]);
				} 
				if (typeof content !== "undefined") {
					el.appendChild(document.createTextNode(content));
				}

				if (typeof eventListeners === "object") {
					for (var event in eventListeners) {						
						var fun = (typeof eventListeners[event] === 'object') ? eventListeners[event][0] : eventListeners[event];
						var param = (typeof eventListeners[event] === 'object') ? eventListeners[event][1] : null;						
						el.addEventListener(event, function(e) {
							if (typeof self[fun] === 'function') {
								return self[fun](e, param);
							} else {
								console.log('function not found: ', fun);
								return null;
							} 
						});
					}
				}
				return el;
			},
			
			htmlInput: function(attr, label, eventListeners, appendTo) {
				var box = document.createDocumentFragment();				
				attr.id = attr.id || 'input.' + Math.random();				
				attr.type = attr.type || 'text';
				attr.data = attr.data || {};
				var label = this.htmlElement('label', {'classes':['a'], 'for': attr.id, 'data': attr.data}, label, eventListeners); //@ TODO l10n
				var input = this.htmlElement('input', attr, '', eventListeners);	
				
				if ((attr.type == 'checkbox') || (attr.type == 'radio')) {
					box.appendChild(input);
					box.appendChild(label);
				} else {
					box.appendChild(label);
					box.appendChild(input);					
				}
				
				if (typeof appendTo !== "undefined") {
					appendTo.appendChild(box);
					return input;
				} else {
					return box;
				}
				
				
			},
			
			/**
			 * takes uniqueUnits - array and counts the max and min occuance in one set of units
			 * @param units - an array of "units" - annotations of one type
			 * @return {max: <int>, min: <int>}
			 */
			unitBoundaries: function(units) {

				var maxOccurance = 1;
				var minOccurance = 1000;
				for (var k = 0; k < units.length; k++) {
					var unit = units[k]; 
					maxOccurance = Math.max(maxOccurance, unit.count);
					minOccurance = Math.min(minOccurance, unit.count);
				}
				
				//console.log("maxmin: " + minOccurance + '-' + maxOccurance);
				return {
					max: maxOccurance,
					min: minOccurance
				}
			},
			
			/**
			 * Event handler for clicking items in the annotation list or markers on the map etc.
			 * 
			 * 
			 * @param event:		event
			 * @param basetype:		string: entry*, marker, ...
			 */
			eventHandler: function(event, basetype) {
				
				basetype = basetype ||  'entry';
				var annotationId = (basetype == 'marker') ? event.target.options.className : event.target.dataset.id;
				var annotation = this.annoRegistry.registry[annotationId];
				
				//console.log(event, basetype, annotation);
				
				if (event.type == 'click') {
					this.jumpToNextMatchingPage(annotation);
				}
				
				if (event.type == 'mouseover') {
					this.highlightsShow(annotation);
					if ((basetype !== 'marker') && (typeof annotation.coordinates !== 'undefined')) {
						this.mapCenter(annotation);
					}
				}
				
				if (event.type == 'mouseout') {
					this.highlightsHide(annotation);
				}
				
			},
			
			/**
			 * center map on annotation
			 */
			mapCenter: function(annotation) {
				if (annotation.coordinates.length == 2) {
					this.map.panTo(new L.LatLng(annotation.coordinates[0], annotation.coordinates[1]));
				}
				
			},
			
			/**
			 * Shows all occurances of annotation in text
			 * @param annotation
			 */
			highlightsShow:  function(annotation) {
		    	var spans = document.querySelectorAll('.dbv-annotation[data-id="' + annotation.id + '"]');
		    	for (var i = 0; i < spans.length; i++) {
		    		spans[i].classList.add('blink');
		    	}
			},
			
			/**
			 * Don't show any highlighted annotations in text
			 * @param e Event
			 */
			highlightsHide:  function(annotation) {
			    var spans = document.querySelectorAll('.dbv-annotation[data-id="' + annotation.id + '"]');
		    	for (var i = 0; i < spans.length; i++) {
		    		spans[i].classList.remove('blink');
		    	}
			},
			
			/**
			 * scrolls the pdf to the next page conatinaing the annotation
			 * 
			 * @param annotation
			 */
			jumpToNextMatchingPage:  function(annotation) {
		    	var currentPageIndex = this.pdfViewer.currentPageNumber - 1;
		    	var indexOfPageinPagesList = annotation.pages.indexOf(currentPageIndex);
		    	var jumpToPage;
		    	
		    	function getNextMatchedPage(nlist, x) {

		    		if (nlist[nlist.length -1] <= x) {
		    			return nlist[0];
		    		}

		    		var i = 0;
		    		while (nlist[i] <= x && i < nlist.length) {
		    			i++;
		    		}
		    		return nlist[i]
		    	}
		    	
		    	var jumpToPage = getNextMatchedPage(annotation.pages, currentPageIndex);
		    	this.scrollTo(jumpToPage, annotation);
			},
			
			/**
			 * scroll to the top of page pageIndex
			 * @param pageIndex integer
			 */
		    scrollTo: function(pageIndex) {
		    	var nr = parseInt(pageIndex) + 1; 
		    	var spans = document.querySelectorAll('#pageContainer' + nr);
		    	scrollIntoView(spans[0], {top: -50, left: -400}, true);
		    },
			

		
		}
		
		return AnnoViewer;
	})();
	
	exports.AnnoViewer = AnnoViewer;
}));
