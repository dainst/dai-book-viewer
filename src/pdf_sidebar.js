/* Copyright 2016 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/pdf_sidebar', ['exports',
      'pdfjs-dbv/pdf_rendering_queue'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdf_rendering_queue.js'));
  } else {
    factory((root.pdfjsWebPDFSidebar = {}), root.pdfjsWebPDFRenderingQueue);
  }
}(this, function (exports, pdfRenderingQueue) {

var RenderingStates = pdfRenderingQueue.RenderingStates;



/**
 * @typedef {Object} PDFSidebarOptions
 * @property {PDFViewer} pdfViewer - The document viewer.
 * @property {PDFThumbnailViewer} pdfThumbnailViewer - The thumbnail viewer.
 * @property {PDFOutlineViewer} pdfOutlineViewer - The outline viewer.
 * @property {HTMLDivElement} mainContainer - The main container
 *   (in which the viewer element is placed).
 * @property {HTMLDivElement} outerContainer - The outer container
 *   (encasing both the viewer and sidebar elements).
 * @property {EventBus} eventBus - The application event bus.
 * @property {HTMLButtonElement} toggleButton - The button used for
 *   opening/closing the sidebar.
 * @property {HTMLButtonElement} thumbnailButton - The button used to show
 *   the thumbnail view.
 * @property {HTMLButtonElement} outlineButton - The button used to show
 *   the outline view.
 * @property {HTMLButtonElement} attachmentsButton - The button used to show
 *   the attachments view.
 * @property {HTMLDivElement} thumbnailView - The container in which
 *   the thumbnails are placed.
 * @property {HTMLDivElement} outlineView - The container in which
 *   the outline is placed.
 * @property {HTMLDivElement} attachmentsView - The container in which
 *   the attachments are placed.
 */

/**
 * @class
 */
var PDFSidebar = (function PDFSidebarClosure() {
  /**
   * @constructs PDFSidebar
   * @param {PDFSidebarOptions} options
   */
  function PDFSidebar(options) {
    this.isOpen = false;
    this.active = 'thumbnail';
    this.isInitialViewSet = false;

    /**
     * Callback used when the sidebar has been opened/closed, to ensure that
     * the viewers (PDFViewer/PDFThumbnailViewer) are updated correctly.
     */
    this.onToggled = null;
    
    // controllers
    this.pdfViewer 				= options.pdfViewer;
    this.pdfThumbnailViewer 	= options.pdfThumbnailViewer;
    this.pdfOutlineViewer 		= options.pdfOutlineViewer;
    this.annoViewer 			= options.annoViewer;
    this.annoRegistry 			= options.annoRegistry;
    this.eventBus 				= options.eventBus;

    // containers
    this.mainContainer 			= options.mainContainer;
    this.outerContainer 		= options.outerContainer;
    
    // buttons
    this.toggleButton 			= options.toggleButton;
    this.thumbnailButton 		= options.thumbnailButton;
    this.outlineButton 			= options.outlineButton;
    this.attachmentsButton 		= options.attachmentsButton;
    this.annotationsButton 		= options.annotationsButton;
    this.findButton 			= options.findButton;
    this.editAnnotationsButton 	= options.editAnnotationsButton;
    this.infoButton 			= options.infoButton;

    // views
    this.thumbnailView 			= options.thumbnailView;
    this.outlineView 			= options.outlineView;
    this.attachmentsView 		= options.attachmentsView;
    this.annotationsView 		= options.annotationsView;
    this.findView 				= options.findView;
    this.editAnnotationsView 	= options.editAnnotationsView;
    this.infoView 				= options.infoView;
    
    // mode
    this.editorMode 			= options.editorMode;

    this._addEventListeners();
    
    options.annoRegistry.onGetAnnotations(function pdfSidebarCheckAnnotationFeatures(e, x) {this.checkAnnotationFeatures()}.bind(this), function pdfSidebarCheckAnnotationFeatures(e, x) {this.checkAnnotationFeatures()}.bind(this));
  }

  PDFSidebar.prototype = {
    reset: function PDFSidebar_reset() {
      this.isInitialViewSet = false;

      this.close();
      this.switchView('thumbnail');

      this.outlineButton.disabled = false;
      this.attachmentsButton.disabled = false;

    },

	tabs: [
		'thumbnail',
		'outline',
		'attachments',
		'annotations',
		'find',
		'editAnnotations',
		'info'
	],

    /**
     * @returns {number} One of the values in {SidebarView}.
	 *
	 * @ TODO do we need theese 4 ?
     */
    get visibleView() {
      return (this.isOpen ? this.active : 'none');
    },

    get isThumbnailViewVisible() {
      return (this.isOpen && this.active === 'thumbnail');
    },

    get isOutlineViewVisible() {
      return (this.isOpen && this.active === 'outline');
    },

    get isAttachmentsViewVisible() {
      return (this.isOpen && this.active === 'attachments');
    },



    /**
     * @param {number} view - The sidebar view that should become visible,
     *                        must be one of the values in {SidebarView}.
     */
    setInitialView: function PDFSidebar_setInitialView(view) {
      if (this.isInitialViewSet) {
        return;
      }
      this.isInitialViewSet = true;

      if (this.editorMode) {
    	  this.editAnnotationsButton.classList.remove('hidden');
      }
      
      if (this.isOpen && view === 'none') {
        this._dispatchEvent();
        // If the user has already manually opened the sidebar,
        // immediately closing it would be bad UX.
        return;
      }
      var isViewPreserved = (view === this.visibleView);
      this.switchView(view, /* forceOpen */ true);
      
      if (isViewPreserved) {
        // Prevent dispatching two back-to-back `sidebarviewchanged` events,
        // since `this.switchView` dispatched the event if the view changed.
        this._dispatchEvent();
      }

      this.annoViewer.sidebarState.tab = this.active;
      this.annoViewer.sidebarState.open = this.isOpen;
           
    },

    /**
     * @param {number} view - The sidebar view that should be switched to,
     *                        must be one of the values in {SidebarView}.
     * @param {boolean} forceOpen - (optional) Ensure that the sidebar is open.
     *                              The default value is false.
     */
    switchView: function PDFSidebar_switchView(view, forceOpen) {
    	
    	console.log('Switch to view: ' + view);
      
    	if (view === 'none') {
    		this.close();
    		return;
    	}
    	
		var isViewChanged = (view !== this.active);
		var shouldForceRendering = false;
	
		var tabs = this.tabs;

		
		if ((typeof this[view + 'Button'] === "undefined") || (this[view + 'Button'].disabled)) {
			return;
		}
		
		for (var i = 0; i < tabs.length; i++) {
			this[tabs[i] + 'Button'].classList.remove('toggled');
			this[tabs[i] + 'View'].classList.add('hidden');
		}

		this[view + 'Button'].classList.add('toggled');
		this[view + 'View'].classList.remove('hidden');


		/* Update the active view *after* it has been validated above */
		this.active = view || 'none';
		this.annoViewer.sidebarState.tab = this.active;
		this.annoViewer.sidebarState.open = this.isOpen;

		/* special bahaviour after in some tabs */
		if (view == 'thumbnail') {
			if (this.isOpen && isViewChanged) {
				this._updateThumbnailViewer();
				shouldForceRendering = true;
			}
		}

		if (view == 'annotations') {
			this.annoViewer.refreshMap();
		}

		this.annoViewer.toggleAnnotations(['annotations', 'editAnnotations'].indexOf(view) > -1);

		if (forceOpen && !this.isOpen) {
			this.open();
			// NOTE: `this.open` will trigger rendering, and dispatch the event.
			return;
		}
		if (shouldForceRendering) {
			this._forceRendering();
		}
		if (isViewChanged) {
			this._dispatchEvent();
		}



    },
    checkAnnotationFeatures: function() {
    	this.toggleAnnotationFeatures(this.editorMode || this.annoRegistry.count() > 0);
    },
    
    toggleAnnotationFeatures:  function(to) {
    	this.annotationsButton.disabled = !to; 	
    	if (to === false) {
    		if ((this.active === 'annotations') || (this.active === 'editAnnotations')) {
    			this.switchView('thumbnail');
    		}
    	}
    	
    },



    open: function PDFSidebar_open() {
      if (this.isOpen) {
        return;
      }
      this.isOpen = true;
      this.toggleButton.classList.add('toggled');

      this.outerContainer.classList.add('sidebarMoving');
      this.outerContainer.classList.add('sidebarOpen');

      if (this.active === 'thumbnail') {
        this._updateThumbnailViewer();
      }
      this._forceRendering();
      this._dispatchEvent();

      this.annoViewer.sidebarState.open = this.isOpen;
    },

    close: function PDFSidebar_close() {
      if (!this.isOpen) {
        return;
      }
      this.isOpen = false;
      this.toggleButton.classList.remove('toggled');

      this.outerContainer.classList.add('sidebarMoving');
      this.outerContainer.classList.remove('sidebarOpen');

      this._forceRendering();
      this._dispatchEvent();

      this.annoViewer.sidebarState.open = this.isOpen;
    },

    toggle: function PDFSidebar_toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    },

	  /* for annoViewer */
	  getSidebarState: function() {
		  return {
			  tab: this.active,
			  open: this.isOpen
		  }
	  },

    /**
     * @private
     */
    _dispatchEvent: function PDFSidebar_dispatchEvent() {
      this.eventBus.dispatch('sidebarviewchanged', {
        source: this,
        view: this.visibleView
      });
    },

    /**
     * @private
     */
    _forceRendering: function PDFSidebar_forceRendering() {
      if (this.onToggled) {
        this.onToggled();
      } else { // Fallback
        this.pdfViewer.forceRendering();
        this.pdfThumbnailViewer.forceRendering();
      }
    },

    /**
     * @private
     */
    _updateThumbnailViewer: function PDFSidebar_updateThumbnailViewer() {
      var pdfViewer = this.pdfViewer;
      var thumbnailViewer = this.pdfThumbnailViewer;

      // Use the rendered pages to set the corresponding thumbnail images.
      var pagesCount = pdfViewer.pagesCount;
      for (var pageIndex = 0; pageIndex < pagesCount; pageIndex++) {
        var pageView = pdfViewer.getPageView(pageIndex);
        if (pageView && pageView.renderingState === RenderingStates.FINISHED) {
          var thumbnailView = thumbnailViewer.getThumbnail(pageIndex);
          thumbnailView.setImage(pageView);
        }
      }
      thumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber);
    },

    /**
     * @private
     */
    _addEventListeners: function PDFSidebar_addEventListeners() {
      var self = this;

      self.mainContainer.addEventListener('transitionend', function(evt) {
        if (evt.target === /* mainContainer */ this) {
          self.outerContainer.classList.remove('sidebarMoving');
        }
      });

      // Buttons for switching views.
      self.thumbnailButton.addEventListener('click', function() {
        self.switchView('thumbnail');
      });

      self.outlineButton.addEventListener('click', function() {
        self.switchView('outline');
      });
      self.outlineButton.addEventListener('dblclick', function() {
        self.pdfOutlineViewer.toggleOutlineTree();
      });

      self.attachmentsButton.addEventListener('click', function() {
        self.switchView('attachments');
      });

      self.annotationsButton.addEventListener('click', function() { // paf dai
          self.switchView('annotations');
      });
      
      self.findButton.addEventListener('click', function() { // paf dai
          self.switchView('find');
      });
      
      self.editAnnotationsButton.addEventListener('click', function() { // paf dai
          self.switchView('editAnnotations');
      });
      
      self.infoButton.addEventListener('click', function() { // paf dai
          self.switchView('info');
      });
      
      // Disable/enable views.
      self.eventBus.on('outlineloaded', function(e) {
        var outlineCount = e.outlineCount;

        self.outlineButton.disabled = !outlineCount;
        if (!outlineCount && self.active === 'outline') {
          self.switchView('thumbnail');
        }
      });

      self.eventBus.on('attachmentsloaded', function(e) {
        var attachmentsCount = e.attachmentsCount;

        self.attachmentsButton.disabled = !attachmentsCount;
        if (!attachmentsCount && self.active === 'attachments') {
          self.switchView('thumbnail');
        }
      });

      // Update the thumbnailViewer, if visible, when exiting presentation mode.
      self.eventBus.on('presentationmodechanged', function(e) {
        if (!e.active && !e.switchInProgress && self.isThumbnailViewVisible) {
          self._updateThumbnailViewer();
        }
      });
    },
  };

  return PDFSidebar;
})();


exports.PDFSidebar = PDFSidebar;
}));
