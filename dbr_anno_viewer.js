'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-web/dbr_anno_viewer', ['exports', 'pdfjs-web/pdfjs', 'pdfjs-web/ui_utils'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'), require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebAnnoViewer = {}), root.pdfjsWebPDFJS, root.uiUtils);
  }
}(this, function (exports, pdfjsLib, uiUtils) {
	
	var scrollIntoView = uiUtils.scrollIntoView;

	/**
	 * @class
	 */
	var AnnoViewer = (function AnnoViewerClosure() {

		function AnnoViewer(options) {
			this.container = options.container;
			this.eventBus = options.eventBus;
			this.annoRegistry = options.annotationRegistry;
		}
		
		AnnoViewer.prototype = {

			
			/* registry for content blocks in the sidebar */
			blocks: {}, 
			
			/* map */
			map: null,
		
			load: function AnnoViewerLoad(file) { // @ TODO move to registry!? 
				var self = this;		
				this.annoRegistry.successFn 	= function(data) {return self.buildBlocks(data)};
				this.annoRegistry.errorFn 		= function(e) {return self.displayError(e)};
				this.annoRegistry.setFilename(file);
				this.annoRegistry.getAnnotations(['testdata', 'digest_' + this.annoRegistry.filename + '.json'],'http://195.37.232.186/DAIbookViewer');
			},
			
			setViewer: function(viewer) {
				this.pdfViewer = viewer;
			},
			
			buildBlocks: function(data) {
				this.block('keyterms', 'Keyterms', 'tags', data.keyterms);
				this.block('places', 'Places', 'map-marker', data.locations);
				this.block('map', 'Map', 'map-marker', data.locations, 'populateMap', false);
				this.block('persons', 'Persons', 'user', data.persons);
			},
			
			
			/**
			 * @param id -			<string>		id
			 * @param title 		<string>		headline @ TODO i10n
			 * @param glyphicon 	<string> 		icon code
			 * @param data			<object>
			 * @param populationFn 	<string> 		name of population function (method of this)
			 * @param loadMoreFn  	<function> 		name of loadMore function (method of this) or (explicitly!) false
			 * 
			 */
			block: function(id, title, glyphicon, data, populationFn, loadMoreFn) {
				var self = this;
				
				
				if (typeof data === "undefined" || data.length == 0) {
					return; // @ TODO what if a category has units, but no digest-important ones?
				}
				
				var block		= this.htmlElement('div', {'id': 'dbv-av-block-' + id, 'classes': ['dbv-av-block', 'panel', 'panel-default']});
				var blocktitle	= this.htmlElement('div',{'classes': ["panel-heading"]});
				var blockh3		= this.htmlElement('h3', {'classes': ['panel-title'], 'data': {'dbv-toggle': id}}, title);
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
				
				blockh3.addEventListener('click', function (e) {return self.toggleBlock(e)});

				this.container.appendChild(block);
						
				populationFn = populationFn || 'populate';
				this[populationFn](blockbody, data);
				
				if (loadMoreFn !== false) {
					loadMoreFn = loadMoreFn || 'loadMore'
					var loadMoreBtn = this.htmlElement('div', {'classes': ['btn', 'btn-default', 'dbv-load-more']}, "Load More");// @ TODO  l10n					
					loadMoreBtn.addEventListener('click', function(e) {return self[loadMoreFn](id);});
					blockbody.appendChild(loadMoreBtn); 
				}
				
			},
			
			toggleBlock: function(e) {
				e.stopPropagation();
				var id = e.target.getAttribute('data-dbv-toggle');				
				
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
					entry.appendChild(this.htmlElement('span', {'classes': ['badge', 'pull-right']}, unit.count));
					
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
						
						var radius = (b.max == b.min) ? 10 : (unit.count - b.min) / (b.max - b.min) * (8 - 2) + 2;
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
				
				window.addEventListener('load', function(e) {// does not work!
					console.log('MAP:READY');
					map.invalidateSize();
				}, false);
				window.XXX = map; // @ TODO map bug
			},
			
			
			loadMore: function(blockId) {
				console.log(blockId);
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
				this.block('error', 'Error getting Annotations', 'alert', e, 'displayErrorText', false);
			},
			
			displayErrorText: function(block, e) {
				block.appendChild(this.htmlElement('p', {'classes': ['alert', 'alert-danger']}, e));
			},
			
			
			/**
			 * I miss jQuery so much... this creates an HTML element
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
			 * @return el the element
			 */
			htmlElement: function(type, attr, content) {
				var el = document.createElement(type);
				if (typeof attr.id !== "undefined") {
					el.id = attr.id;
				}
				if (typeof attr.classes === "object" && typeof attr.classes.join === "function") {
					el.className = attr.classes.join(" ");
				}
				var allowedAttrs = ['href', 'src', 'alt', 'target', 'style'];
				for (var key in attr) {
					if (allowedAttrs.indexOf(key) !== -1) {
						el[key] = attr[key];
					}
				}
				for (var key in attr.data) {
					el.setAttribute('data-' + key, attr.data[key]);
				} 
				if (typeof content !== "undefined") {
					el.appendChild(document.createTextNode(content));
				}
				return el;
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
			 * @param event:			event
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
				this.map.panTo(new L.LatLng(annotation.coordinates[0], annotation.coordinates[1]));
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
		    scrollTo: function PDFFindController_updateMatchPosition(pageIndex) {
		    	var nr = parseInt(pageIndex) + 1; 
		    	var spans = document.querySelectorAll('#pageContainer' + nr);
		    	scrollIntoView(spans[0], {top: -50, left: -400}, true);
		    },
			

		
		
		}
		
		return AnnoViewer;
	})();
	
	exports.AnnoViewer = AnnoViewer;
}));
