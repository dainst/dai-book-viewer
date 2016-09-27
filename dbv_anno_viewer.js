'use strict';
/**
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * @param root
 * @param factory
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbv_anno_viewer', ['exports', 'pdfjs-dbv/pdfjs', 'pdfjs-dbv/ui_utils'], factory);
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
			this.pdfViewer = options.pdfViewer;
			this.annoRegistry = options.annoRegistry;
			this.$ = options.annoSidebar;
			this.$.parent = this;
			
		}
		
		AnnoViewer.prototype = {
			
			/* registry for content blocks in the sidebar */
			blocks: {}, 
			
			/* map */
			map: false,
			
			/**
			 * 
			 * @param file
			 */
			load: function AnnoViewerLoad(file) { // @ TODO move to registry!? 
				var self = this;		
				this.annoRegistry.onGetAnnotations(function(data) {return self.buildBlocks(data)});
				this.annoRegistry.errorFn 		= function(e) {return self.$.displayError(e)};
				this.annoRegistry.setFilename(file);
				this.annoRegistry.getAnnotations(['testdata', 'digest_' + this.annoRegistry.filename + '.json'],'http://195.37.232.186/DAIbookViewer');
				
				this.$.clear();
				
				this.annotationPopup = document.getElementById('dbv-ao'); // @ TODO do better blah
				document.getElementsByTagName('html')[0].addEventListener('click', function(e) {
					self.annotationPopup.classList.add('hidden');
				}, true);
				
			},
			
			/**
			 * 
			 * @param viewer
			 */
			setViewer: function(viewer) {
				this.pdfViewer = viewer;
			},
			
			/**
			 * 
			 * @param data
			 */
			buildBlocks: function(data) {
				this.block('keyterms', 'Keyterms', 'tags', data.keyterms);
				this.block('places', 'Places', 'map-marker', data.locations);
				this.block('map', 'Map', 'map-marker', data.locations, 'populateMap', false);
				this.block('persons', 'Persons', 'user', data.persons);
			},
			

			block: function(id, title, glyphicon, data, populationFn, loadMore) {
				var block = this.$.block(id, title, glyphicon, true);
				
				var populationFn = populationFn || 'populate';
				
				if (data && data.items) {
					this[populationFn](block, data.items);	
				}

				if (loadMore !== false && data.more) {
					var loadMoreBtn = this.$.htmlElement('div', {'classes': ['btn', 'btn-default', 'dbv-load-more']}, "Load More");// @ TODO  l10n					
					loadMoreBtn.addEventListener('click', function(e) {return self.loadMore(id);});
					block.appendChild(loadMoreBtn); 
				}
			},
			
			
			
			/**
			 * 
			 * default population function
			 * 
			 * @param block
			 * @param units
			 */
			populate: function(block, units) {
				self = this;
				
				if (typeof units === "undefined") {
					return;
				}
				
				for(var k = 0; k < units.length; k++) {
					var unit = units[k];
					var entry = this.$.htmlElement('div', {'classes': ['dbv-av-block-entry']});
					var caption = this.$.htmlElement('span', {'classes': ['dbv-av-block-entry-caption'], 'data': {'id': unit.id}}, unit.lemma);
					
					caption.addEventListener('click', function(e) {return self.eventHandler(e);})
					caption.addEventListener('mouseover', function(e) {return self.eventHandler(e);})
					caption.addEventListener('mouseout', function(e) {return self.eventHandler(e);})
					
					entry.appendChild(caption);
					entry.appendChild(this.$.htmlElement('span', {'classes': ['badge', 'pull-right']}, unit.count || 1));
					
					this.references(entry, unit.references);		
					//console.log(k, unit, entry);

					block.appendChild(entry);
				}			
			},
			
			/**
			 * 
			 * population function for the map 
			 * 
			 */
			populateMap: function(block, units) {
				var self = this;
				var mapDiv = this.$.htmlElement('div',{'id':'dbv-av-map', 'style': 'height: 300px'});	
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
						
						var count = unit.count || 1;
						var radius = (isNaN(b.max) || b.max == b.min) ? 9 : (count - b.min) / (b.max - b.min) * 8 + 4;
						
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

				var refbox = this.$.htmlElement('span', {'classes': ['dbv-av-references']});
				block.appendChild(refbox);
				
				for(var i = 0; i < data.length; i++) {
					
					var ref = data[i];
					
					if (typeof ref.url === 'undefined') {
						continue;
					} 
					
					var refurl = ref.url;
					var reftag = ref.type || 'link';
					
					var link = this.$.htmlElement('a', {'classes': ['dbv-av-reference', 'btn', 'btn-xs', 'btn-default'], target:"_blank", href: refurl}, reftag);
					refbox.appendChild(link);
					
				};
			},
			

			
			
			/* annotation popup  */
			
			annotationPopup: false,

			
			/**
			 * shows the annotationPopup with content of the annotations (reference links and text)
			 * 
			 * @param annotation
			 * @param pageX
			 * @param pageY
			 */
			renderAnnotationPopup: function(annotation, pageX, pageY) {
								
				var box = this.annotationPopup;
				
				var text = annotation.text || '';
				var refs = annotation.references || {};
				
				if ((Object.keys(refs).length === 0) && (text == '')) {
					return;
				}
				
				box.innerHTML = '';
				
				if (annotation.text) {
					box.appendChild(this.$.htmlElement('div', {}, annotation.text));	
				}
				
				if (typeof annotation.references !== "undefined" && (annotation.references.length != 0)) {
					for (var i = 0; i < annotation.references.length; i++) {
						var ref = annotation.references[i];
						var d = this.$.htmlElement('div');
						d.appendChild(this.$.htmlElement('a', {"target": "_blank", "href": ref.url || ""}, ref.name || ref.type || ref.url));
						box.appendChild(d);
					}
				}
				
		    	box.style.left = pageX + 'px';
		    	box.style.top = pageY + 'px';				
				box.classList.remove('hidden');
			},
			
			hoverAnnotationPopup: function(annotation, pageX, pageY) {
		    	if (typeof annotation.coordinates !== "undefined") {
		    		this.mapCenter(annotation);
		    	}
			},
			
			/**
			 * toggle the annotation
			 * 
			 */
			toggleAnnotationPopup: function() {
				if (!this.annotationPopupDontHide) {
					this.annotationPopup.classList.add('hidden');
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
					maxOccurance = Math.max(maxOccurance, unit.count || 1);
					minOccurance = Math.min(minOccurance, unit.count || 1);
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
			
		    /* render control */
		    
		    showAnnotation: function(annotation) {
		    	//console.log('GG:', annotation);
		    	var annotation = PDFViewerApplication.annoRegistry.registerAnnotation(annotation);
		    	//console.log('GG:', annotation);
		    	PDFViewerApplication.findController.pSetAnnotation(annotation);
		    	for (var i; i < annotation.pages.length; i++) {
			    	PDFViewerApplication.findController.reloadPageTextLayer(annotation.pages[i]);
		    	}
		    },
		    
		    annotationsVisible: true,
		    toggleAnnotations: function(to) {
		    	console.log('toggle annotations to ' , to);
		    	
		    	this.annotationsVisible = to || !this.annotationsVisible;
		    	if (!this.annotationsVisible) {
		    		this.pdfViewer.container.classList.add('dbv-annotations-hidden');
		    	} else {
		    		this.pdfViewer.container.classList.remove('dbv-annotations-hidden');
		    	}
		    	
		    },
		    
		    redrawAnnotations: function() {
		    	console.log('FUNCTION HAS TO BE IMPLEMENTED');
		    	
		    	PDFViewerApplication.findController.reloadAllTextLayers();
		    	this.pdfViewer.container.classList.remove('dbv-annotations-hidden');
		    	
		    	// this function shall redraw all annotations! afterwards serach should be working perfectly
		    	
		    }
		    
		    
		    

		
		}
		
		return AnnoViewer;
	})();
	
	exports.AnnoViewer = AnnoViewer;
}));