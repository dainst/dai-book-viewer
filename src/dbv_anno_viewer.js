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

			/* controllers */
			this.pdfViewer = options.pdfViewer;
			this.annoRegistry = options.annoRegistry;
			this.eventBus = options.eventBus;

			/* elements */
			this.toggleAnnotationButton = options.toggleAnnotationButton;
			this.yayBox = options.yayBox;
			this.intextPopup = options.intextPopup;
			this.intextPopupInner = options.intextPopupInner;

			/* sidebar components */
			this.$ = options.annoSidebar;
			this.$.parent = this;

			/* Add event listeners */
			this._addEventListeners();

		}

		AnnoViewer.prototype = {

			/* registry for content blocks in the sidebar */
			blocks: {},
			entries: {}, // all entries of all blocks

			/* map */
			map: false,
			markers: {},
			mapover: null,

			/* in-text annotations */
			annotationsVisible: {
				all: true
			},
			currentFilter: '',

			/* information about sidebar, is set by pdf_sidebar controller */
			 sidebarState: {
				 tab: '',
				 open: ''
			 },

			/**
			 * prepares the anno viewer controller
			 *
			 *
			 * @param file
			 */
			load: function AnnoViewerLoad() {
				var self = this;

				this.toggleAnnotations(false);

				this.annoRegistry.onGetAnnotations(
					function(data) 	{
						console.log(data);
						self.enableAnnotations();
						self.buildBlocks(data)
					},
					function(e) 	{
						return self.$.displayError(e)
					}
				);

				// reset 'em
				this.$.clear();
				this.entries = {};
				this.markers = {};

				this.$.block('annotations_wait', 'Waiting for Annotations', 'tags');

				this.intextPopup.classList.add('hidden');

			},

			/**
			 *
			 * @param viewer
			 */
			/*
			setViewer: function(viewer) {
				console.log("DO WE NEED THIS?!");
				this.pdfViewer = viewer;
			},*/

			/**
			 *
			 * @param data
			 */
			buildBlocks: function(data) {
				this.$.clear();


				this.$.block('tools', 'Annotations', '', true, false, {
					'filter': {
						type: 'text',
						placeholder: 'Filter',
						eventListeners: {
							'type': 'blockCtrlFilter'
						}
					}
				}).appendChild(this.$.htmlElement('p',{data: {'l10n-id': 'dbv-info-annotions_info'}}));
				//this.$.message('dbv-info-annotions_info', false, false, false);

				this.block('map', 'Map', 'map-marker', data.locations, 'populateMap', false, {
					"zoomout": {
						icon: 'zoom-out',
						eventListeners: {'click': 'mapZoomOut'},
						caption: 'zoom out',
						hide: 'closed'
					},
					"zoomin": {
						icon: 'zoom-in',
						eventListeners: {'click': 'mapZoomIn'},
						caption: 'zoom in',
						hide: 'closed'
					}
				});
				this.block('places', 'Places', 'map-marker', data.locations);
				this.block('persons', 'Persons', 'user', data.persons);
				this.block('keyterms', 'Keyterms', 'tags', data.keyterms);

			},

			/**
			 * creates a block in the sidebar in annotations tab
			 * @param id
			 * @param title
			 * @param glyphicon
			 * @param data
			 * @param populationFn
			 * @param <bool> loadMore
			 * @param <bool> controls
			 */
			block: function(id, title, glyphicon, data, populationFn, loadMore, controls) {
				if (!data) {
					return;
				}

				var hasData = (data.items && (data.items.length > 0));
				var hasMore = (loadMore !== false && data.more);
				var controls = (typeof controls  !== "undefined") ? controls : true;

				if (!hasData && !hasMore) {
					return;
				}

				// default controls
				if (controls === true) {
					controls = {}
				}

				var block = this.$.block(id, title, glyphicon, true, false, controls);

				var populationFn = populationFn || 'populate';

				if (hasData) {
					this[populationFn](block, data.items) === false;
				}

				if (hasMore) {
					var loadMoreBtn = this.$.htmlElement('div', {'classes': ['btn', 'btn-default', 'dbv-load-more']}, "Load More");// @ TODO  l10n
					loadMoreBtn.addEventListener('click', function(e) {return self.loadMore(id);});
					block.appendChild(loadMoreBtn);
				}
			},

			/**
			 * hides / shows a block and corresponding in-text annotations
			 *
			 * @param e
			 * @param blockId
			 */
			toggleBlock: function(e, blockId) {
				// hide/show corresponding in-text annotations
				this.toggleAnnotationsType(undefined, blockId);
				// hide/show block
				this.$.toggleBlock(e, blockId)
			},


			/**
			 * filters some annotation elements in sidebar, text, map
			 * get's called by filter tool control textbox
			 *
			 * @param e
			 * @param blockId
			 */
			blockCtrlFilter: function(e,  blockId) {
				this.currentFilter = e.target.value.toUpperCase();
				this.filterApply();
			},


			/**
			 *
			 * default population function
			 *
			 * @param block
			 * @param units
			 */
			populate: function(block, units) {
				var self = this;

				if (typeof units === "undefined") {
					return;
				}

				for(var k = 0; k < units.length; k++) {
					var unit = units[k];
					var entry = this.$.htmlElement('div', {'classes': ['dbv-av-block-entry']});
					var caption = this.$.htmlElement('span', {'classes': ['dbv-av-block-entry-caption'], 'data': {'id': unit.id}}, unit.lemma);

					caption.annotationId = unit.id; // is this ok?
					caption.addEventListener('click', 		function(e) {return this.entryClick(e)}.bind(this));
					caption.addEventListener('mouseover', 	function(e) {return this.entryMouseover(e)}.bind(this));
					caption.addEventListener('mouseout', 	function(e) {return this.entryMouseout(e)}.bind(this));

					entry.appendChild(caption);
					entry.appendChild(this.$.htmlElement('span', {'classes': ['badge', 'pull-right']}, unit.count || 1));

					this.references(entry, unit.references);
					//console.log(k, unit, entry);

					this.entries[unit.id] = entry;
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
				var mapDiv = this.$.htmlElement('div',{'id':'dbv-av-map'});
				block.appendChild(mapDiv);
				var b = this.unitBoundaries(units);

				// prepare maps ..
				this.markers = {};
				try {
					var map = new L.Map('dbv-av-map', {
						"zoomControl": false
					});
				} catch (err) {
					console.log(err);
					return;
				}
				var osmUrl='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'; // @ TODO save in config
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
						var depth = (isNaN(b.max) || b.max == b.min) ? 0.8 : (count - b.min) / (b.max - b.min) * 0.4 + 0.3;

						//var marker = L.marker([parseFloat(unit.coordinates[0]), parseFloat(unit.coordinates[1])]).addTo(map);
						var marker = L.circleMarker(
							[parseFloat(unit.coordinates[0]), parseFloat(unit.coordinates[1])],
							{
								radius:			6,
								fillOpacity:	depth,
								opacity:		depth,
								className:		'marker-' + unit.type
							}
						).addTo(map);

						marker.annotationId = unit.id;

						marker.on('click', 		function(e) {this.mapMarkerClick(e)}.bind(this));
						marker.on('mouseover', 	function(e) {this.mapMarkerMouseover(e)}.bind(this));
						marker.on('mouseout', 	function(e) {this.mapMarkerMouseout(e)}.bind(this));

						this.markers[unit.id] = marker;
						markers.push(marker);

						//marker.bindPopup(unit.lemma);


						//marker.bindPopup(unit.lemma + '<span class="badge">' +  unit.count + "</span>");
						//window.XXX = this.markers;
						this.map = map;
					} catch (err) {
						console.log('MAP:ERR', err);
					}
				}

				// if adding markers failed in every case and we don't have markers
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
				//this.annoRegistry.getAnnotations(['testdata', 'more.' + blockId + '_' + this.annoRegistry.filename + '.json'],'http://195.37.232.186/DAIbookViewer');
				// @ TODO implement
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

			/**
			 * shows the annotationPopup with content of the annotations (reference links and text)
			 *
			 * @param annotations - list of clicked annotations
			 * @param target (a div!)
			 */
			clickAnnotation: function(annotations, target) {

				if (!annotations.length) {
					return;
				}

				var boxWrapper = this.intextPopup;
				var annotation, text, refs, box, bullet, i, ref, d, referenceList;

				var inTextPopUpEntries = document.createDocumentFragment();

				for (var ii = 0; ii < annotations.length; ii++) {
					annotation = annotations[ii];
					text = annotation.text || '';
					refs = annotation.references || {};

					box = this.$.htmlElement('div', {'class': 'intext-popup-entry'});
					bullet = this.$.htmlElement('span', {'classes': ['intext-popup-bullet']});
					bullet.appendChild(this.$.htmlElement('span', {'classes': ['dbv-colors-' + annotation.type], 'title': annotation.type}, ''));
					box.appendChild(bullet);
					box.appendChild(this.$.htmlElement('h5', {}, annotation.lemma, {
						'mouseover':['inTextPopUpAction', annotation],
						'click':['inTextPopUpAction', annotation]
					}));

					if (typeof annotation.references !== "undefined" && (annotation.references.length != 0)) {
						referenceList = this.$.htmlElement('div', {"class": "intext-popup-references"});
						for (i = 0; i < annotation.references.length; i++) {
							ref = annotation.references[i];

							box.appendChild(this.$.htmlElement('a', {"target": "_blank", "href": ref.url || ""}, ref.name || ref.type || ref.url));

						}
						//box.appendChild(referenceList);
					}

					if (annotation.text) {
						box.appendChild(this.$.htmlElement('p', {}, annotation.text));
					}
					inTextPopUpEntries.appendChild(box);
				}


				this.intextPopupInner.innerHTML = '';
				this.intextPopupInner.appendChild(inTextPopUpEntries);
				boxWrapper.classList.remove('hidden');
				var el1 = target.getBoundingClientRect();
				var el2 = boxWrapper.getBoundingClientRect();
				var pos = {
					left: el1.left + window.scrollX + (el1.width/2) - (el2.width/2),
					top: el1.top + window.scrollY - el2.height + 10
				}

				boxWrapper.style.left = pos.left + 'px';
				boxWrapper.style.top = pos.top + 'px';

			},

			/**
			 * get triggered when user clicks on the annotation in the in-text popup. don't triggers itself because
			 * annotation*s* is null, but triggers everything else  ...
			 * @param e
			 * @param annotation
			 */
			inTextPopUpAction: function(e, annotation) {
				this.eventBus.dispatch('annotationEvent', {
					annotation: annotation,
					pageNumber: '<unknown>', // @ TODO fixme
					target: e.target,
					type: e.type,
					annotations: []
				});
			},

			hoverAnnotation: function(annotation) {
				this.mapCenter(annotation);
			},


			hideInTextPopup: function() {
				this.intextPopup.classList.add('hidden');
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
			 * click events for markers and list entries
			 *
			 * @param annotationId <int>
			 * @param entry | marker <elem>
			 * @param event <event>
			 */
			entryClick: function(event) {
				var annotation = this.annoRegistry.registry[event.originalTarget.annotationId];
				this.jumpToNextMatchingPage(annotation);
			},

			entryMouseover: function(event) {
				var annotation = this.annoRegistry.registry[event.originalTarget.annotationId];
				this.highlightsShow(annotation);
				this.mapCenter(annotation);
			},

			entryMouseout: function(event) {
				var annotation = this.annoRegistry.registry[event.originalTarget.annotationId];
				this.highlightsHide(annotation);
			},

			mapMarkerClick: function(event) {
				this.jumpToNextMatchingPage(this.annoRegistry.registry[event.target.annotationId]);
			},

			mapMarkerMouseover: function(event) {
				var annotation = this.annoRegistry.registry[event.target.annotationId];
				var marker = event.target;
				this.highlightsShow(annotation);
				this.mapover = L.popup({
					closeButton: false,
					closeOnClick: true,
					offset: new L.Point(0, -1)
				}).setLatLng(event.target._latlng).setContent(annotation.lemma).openOn(this.map);
			},

			mapMarkerMouseout: function(event) {
				var annotation = this.annoRegistry.registry[event.target.annotationId];
				this.highlightsHide(annotation);
				if (this.map && this.mapover) {
					this.map.closePopup();
					this.mapover = false;
				}
			},

			/**
			 * center map on annotation
			 */
			mapCenter: function(annotation) {
				if (typeof annotation === "undefined") {
					return;
				}
				if (annotation.coordinates && annotation.coordinates.length == 2) {
					if (!annotation.coordinates[0] !== "" && annotation.coordinates[1] !== "") {
						this.map.panTo(new L.LatLng(annotation.coordinates[0], annotation.coordinates[1]));
					}
				}

			},

			mapZoomIn: function() {
				this.map.zoomIn();
			},

			mapZoomOut: function() {
				this.map.zoomOut();
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
			 * @param annotation
			 */
			highlightsHide:  function(annotation) {
			    var spans = document.querySelectorAll('.dbv-annotation[data-id="' + annotation.id + '"]');
		    	for (var i = 0; i < spans.length; i++) {
		    		spans[i].classList.remove('blink');
		    	}
			},

			filterApply: function() {
				var filter = this.currentFilter;
				var entry, annotation;
				for (var annotationId in this.entries) {
					entry = this.entries[annotationId];
					annotation = this.annoRegistry.registry[annotationId];
					if (annotation.lemma.toUpperCase().indexOf(filter) > -1) {
						entry.classList.remove('dbv-hidden');
						this.filterShow(annotation)
					} else {
						entry.classList.add('dbv-hidden');
						this.filterHide(annotation)
					}
				}
			},


			filterHide: function(annotation) {
				// hide in-text annotations
				var spans = document.querySelectorAll('.dbv-annotation[data-id="' + annotation.id + '"]');
				for (var i = 0; i < spans.length; i++) {
					spans[i].classList.add('filtered');
				}
				// hide map markers
				if (typeof this.markers[annotation.id] !== "undefined") {
					//console.log(this.markers[annotation.id]._path);
					this.markers[annotation.id]._path.classList.add('marker-hidden')
				}
			},

			filterShow: function(annotation) {
				var spans = document.querySelectorAll('.dbv-annotation[data-id="' + annotation.id + '"]');
				for (var i = 0; i < spans.length; i++) {
					spans[i].classList.remove('filtered');
				}
				// show map markers
				if (typeof this.markers[annotation.id] !== "undefined") {
					this.markers[annotation.id]._path.classList.remove('marker-hidden')
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



			/**
			 * hides / shows ALL annotations
			 *
			 * gets called from the feature button in the main toolbar,

			 *
			 * @param to
			 */
        	toggleAnnotations: function(to) {
		    	this.annotationsVisible['all'] = (typeof to === "undefined") ? !this.annotationsVisible['all'] : to;

		    	if (this.annotationsVisible['all']) {
					this.yayboxHide();
					this.pdfViewer.container.classList.remove('dbv-annotations-hidden');
		    	} else { // hide annotations
					this.pdfViewer.container.classList.add('dbv-annotations-hidden');
				}
		    },

			/**
			 * hides shows a single type of annotation
			 *
			 * @param to
			 * @param type
			 */
			toggleAnnotationsType: function(to, type) {
				this.annotationsVisible[type] = (typeof this.annotationsVisible[type] === "undefined") ? true : this.annotationsVisible[type];
				this.annotationsVisible[type] =	to || !this.annotationsVisible[type];
				if (!this.annotationsVisible[type]) {
					this.pdfViewer.container.classList.add('dbv-annotations-hidden-' + type);
				} else {
					this.pdfViewer.container.classList.remove('dbv-annotations-hidden-' + type);
				}
			},

			/**
			 * gets triggered, when annotations are found
			 */
		    enableAnnotations: function() {
				if (!this.sidebarState.tab in ['annotations', 'editAnnotations'] || !this.sidebarState.open) {
					this.yayboxShow();
				}
		    },


		    /* yay box */


		    yayboxClick: function() {
		    	this.yayboxHide();
		    },

		    yayboxHide: function() {
		    	this.yayBox.classList.add('hiddenBox');
		    	this.toggleAnnotationButton.classList.remove('blinkButton');
		    },

		    yayboxShow: function() {
		    	this.yayBox.classList.remove('hiddenBox');
		    	this.toggleAnnotationButton.classList.add('blinkButton');
		    	setTimeout(function() {this.yayboxHide()}.bind(this), 50000);
		    },


			onTextLayerRendered: function(page) {
		    	this.filterApply();
			},

			/**
			 * @private
			 */
			_addEventListeners: function annoViewer_addEventListeners() {
				this.eventBus.on('annotationEvent', function(e) {
					if (e.type == 'click') {
						this.clickAnnotation(e.annotations, e.target);
					}
					if (e.type == 'mouseover') {
						this.hoverAnnotation(e.annotation);
					}
				}.bind(this));

				this.eventBus.on('windowClicked', function(e) {
					this.hideInTextPopup();

				}.bind(this));

			}


		}

		return AnnoViewer;
	})();

	exports.AnnoViewer = AnnoViewer;
}));
