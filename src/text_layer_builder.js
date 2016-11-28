/* Copyright 2012 Mozilla Foundation
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
    define('pdfjs-dbv/text_layer_builder', ['exports', 'pdfjs-dbv/dom_events',
        'pdfjs-dbv/pdfjs'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./dom_events.js'), require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebTextLayerBuilder = {}), root.pdfjsWebDOMEvents,
      root.pdfjsWebPDFJS);
  }
}(this, function (exports, domEvents, pdfjsLib) {

/**
 * @typedef {Object} TextLayerBuilderOptions
 * @property {HTMLDivElement} textLayerDiv - The text layer container.
 * @property {EventBus} eventBus - The application event bus.
 * @property {number} pageIndex - The page index.
 * @property {PageViewport} viewport - The viewport of the text layer.
 * @property {PDFFindController} findController
 */

/**
 * TextLayerBuilder provides text-selection functionality for the PDF.
 * It does this by creating overlay divs over the PDF text. These divs
 * contain text that matches the PDF text they are overlaying. This object
 * also provides a way to highlight text that is being searched for.
 * @class
 */
var TextLayerBuilder = (function TextLayerBuilderClosure() {
  function TextLayerBuilder(options) {
    this.textLayerDiv = options.textLayerDiv;
    this.eventBus = options.eventBus || domEvents.getGlobalEventBus();
    this.renderingDone = false;
    
    this.renderingPromise = false; // Promise gets resolved when page is renderes
    this.renderingPromiseResolve = false;
    
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = options.viewport;
    this.textDivs = [];
    this.findController = options.findController || null;
    this.textLayerRenderTask = null; // gets resolved when text context is there
    this._bindMouse();
    
    this.annoRegistry = options.annoRegistry;
    this.annoViewer = options.annoViewer;
    
  }

  TextLayerBuilder.prototype = {
    _finishRendering: function TextLayerBuilder_finishRendering() {
      this.renderingDone = true;

      var endOfContent = document.createElement('div');
      endOfContent.className = 'endOfContent';
      this.textLayerDiv.appendChild(endOfContent);
      
      this.eventBus.dispatch('textlayerrendered', {
        source: this,
        pageNumber: this.pageNumber
      });
    },

    /**
     * Renders the text layer.
     * @param {number} timeout (optional) if specified, the rendering waits
     *   for specified amount of ms.
     */
    render: function TextLayerBuilder_render(timeout) {
    	
      if (!this.divContentDone || this.renderingDone) {
        return;
      }
      
      //console.log('RENDER PAGE ' + this.pageIdx, !this.divContentDone, this.renderingDone);

      if (this.textLayerRenderTask) {
        this.textLayerRenderTask.cancel();
        this.textLayerRenderTask = null;
      }

      this.textDivs = [];
      var textLayerFrag = document.createDocumentFragment();
      this.textLayerRenderTask = pdfjsLib.renderTextLayer({
        textContent: this.textContent,
        container: textLayerFrag,
        viewport: this.viewport,
        textDivs: this.textDivs,
        timeout: timeout
      });

      Promise.all([this.textLayerRenderTask.promise, this.annoRegistry.loadingPromiseAlways])      
      .then(function textLayerRenderTaskPromiseThen() {
        this.textLayerDiv.appendChild(textLayerFrag);
        this.pUpdateAnnotations();
        this._finishRendering();
      }.bind(this), function (reason) {
        // canceled or failed to render text layer -- skipping errors
      });
    },

    setTextContent: function TextLayerBuilder_setTextContent(textContent) {
      if (this.textLayerRenderTask) {
        this.textLayerRenderTask.cancel();
        this.textLayerRenderTask = null;
      }
      this.textContent = textContent;
      this.divContentDone = true;
    },

    convertMatches: function TextLayerBuilder_convertMatches(matches, matchesLength) {
      var i = 0;
      var iIndex = 0;
      if (typeof this.textContent === "undefined") {
    	  //console.warn("convertMatches not possible, this.textContent empty");
    	  return;
      }
      
      var bidiTexts = this.textContent.items;
      var end = bidiTexts.length - 1;
      var queryLen = ((this.findController === null || this.findController.state === null) ? 0 : this.findController.state.query.length); // paf
      var ret = [];
      if (!matches) {
        return ret;
      }
      for (var m = 0, len = matches.length; m < len; m++) {
        // Calculate the start position.
        var matchIdx = matches[m];

        // if match has no begin (in case of dbvAnnotation)
        if (typeof matches[m] === "undefined") {       	
        	console.log('match not found');
	        return ret;
        }
        
        // Loop over the divIdxs.
        while (i !== end && matchIdx >= (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        if (i === bidiTexts.length) {
          console.error('Could not find a matching mapping');
        }

        var match = {
          begin: {
            divIdx: i,
            offset: matchIdx - iIndex
          }
        };

        // Calculate the end position.
        if (matchesLength) { // multiterm search
          matchIdx += matchesLength[m];
        } else { // phrase search
          matchIdx += queryLen;
        }

        // Somewhat the same array as above, but use > instead of >= to get
        // the end position right.
        while (i !== end && matchIdx > (iIndex + bidiTexts[i].str.length)) {
          iIndex += bidiTexts[i].str.length;
          i++;
        }

        match.end = {
          divIdx: i,
          offset: matchIdx - iIndex
        };
        ret.push(match);
        //console.log(match);
      }

      return ret;
    },
    
    pConvertAnnotations: function TextLayerBuilder_pConvertAnnotations(annotations) {
    	var ret = [];
    	var conv;
    	for (var i = 0; i < annotations.length; i++) {   		
	        conv = this.convertMatches([annotations[i].position.begin], [annotations[i].position.length]);
    		if ((typeof conv !== "undefined") && (typeof conv[0] !== "undefined")) {
    			
    			for (var row = conv[0].begin.divIdx; row <= conv[0].end.divIdx; row++) {
        			ret.push({
        				base: annotations[i].base,
        				position: {
       						divIdx: row,
        					begin: 	(row == conv[0].begin.divIdx) 	? conv[0].begin.offset	: -1,
        					end: 	(row == conv[0].end.divIdx) 	? conv[0].end.offset	: 1000000       					
        				}
        			});
    			}

    		}
    	}
    	
    	return ret;
    },
   
    /**
     * clears all textlayers
     */
    clearRows: function() {
    	//console.log('CLEAR CANVAS PAGE ' + this.pageIdx);
    	for(var i = 0; i < this.textDivs.length; i++) {
      	  this.textDivs[i].textContent = '';
    	}
    },
    
    /**
     * fills all empty rows with hidden text
     * 
     * @param true* - if set true, it will fill even filled rows
     */
    fillRows: function(force) {
    	for(var i = 0; i < this.textDivs.length; i++) {
      	  if ((this.textDivs[i].textContent == '') || (force === true)) {
              var div = this.textDivs[i];
              var content = this.textContent.items[i].str; // .substring(0, undefined)
              var node = document.createTextNode(content);
              div.appendChild(node);
      	  }
    	}
    },
    
    /**
     * 
     * rendering function for annotations
     * 
     * parallels renderMatches for matches
     * 
     * 
     * @param annotations
     */
    pRenderAnnotations: function TextLayerBuilder_pRenderAnnotations(annotations) {
    	
    	//console.log('RENDER: ', annotations);
    	
    	this.clearRows();
    	
    	// Early exit if there is nothing to render.
        if (annotations.length === 0) {
          return;
        }

        var self = this;
        var popupFn = function(e) {return self.popupEventHandler(e)};
        
        var bidiTexts = this.textContent.items;
        var textDivs = this.textDivs;
        var pageIdx = this.pageIdx;

        var infinity = {
          divIdx: -1,
          offset: undefined
        };

        /**
         * divIdx - row
         * 
         * 
         * 
         * className - if given, a span will be created (for an annotation for example)
         */
        function appendTextToDiv(divIdx, fromOffset, toOffset, className, annotation) {
        	if (toOffset <= 0) {
        		return;
        	}
        	
        	
          var div = textDivs[divIdx];
          var content = bidiTexts[divIdx].str.substring(fromOffset, toOffset);        
          var node = document.createTextNode(content);
          if (className) {
            var span = document.createElement('span');
            if (typeof annotation === "object") {
           		span.dataset.id = annotation.id; 
            	
            	// mouse click / hover of annotation
            	if (!((Object.keys(annotation.references || {}).length === 0) && ((annotation.text || '') == ''))) {
            		span.addEventListener('mouseover', popupFn);
            		//span.addEventListener('mouseout', popupHideFn);
            		span.addEventListener('click', popupFn);
            		className += ' active';
            	}
            }
            
            span.className = className;
            span.appendChild(node);
            
            div.appendChild(span);
            return;
          }
          div.appendChild(node);
        }
        
        // unfortunately we have to sort this stuff twice and iterate a lot over it, although it's expensive
        //var t = [];t.push(performance.now()); 
        
        // step 1: sort by divIdx, id, begin
        annotations.sort(function(a, b) {
            if (a.position.divIdx < b.position.divIdx) 	{return -1}
            if (a.position.divIdx > b.position.divIdx) 	{return 1}
            if (a.base.id < b.base.id) 					{return -1}
            if (a.base.id > b.base.id) 					{return 1}
            if (a.position.begin < b.position.begin) 	{return -1}
            if (a.position.begin > b.position.begin) 	{return 1}
            return 0;
        });
        //t.push(performance.now()); 

        // step 2: eliminate annotations wich overlap with themselves
        var i = 0;
        var a,b;
        while(i < annotations.length - 1) {
          a = annotations[i];
          b = annotations[i + 1];
             
          if ((a.position.divIdx != b.position.divIdx) || (a.base.id != b.base.id)) {
        	  i++; 
        	  continue;
          }
          
          if (a.position.end < b.position.begin) {
        	  i++;
        	  continue;
          }
          
          if (a.position.end >= b.position.end) {
        	  annotations.splice(i + 1, 1);
        	  //annotations[i + 1].skip = true;
          } else if (a.position.begin < b.position.begin) {
        	  annotations[i].position = {
	              begin:	a.position.begin,
	              end:		b.position.end,
	              divIdx:	a.position.divIdx
        	  }
        	  annotations.splice(i + 1, 1);
        	  //annotations[i + 1].skip = true;
          } else {
        	  annotations.splice(i, 1);
        	  //annotations[i].skip = true;
          }
        }
        //t.push(performance.now()); 

        // step 3: sort by divIdx, begin  
        annotations.sort(function(a, b) {
        	if (a.position.divIdx < b.position.divIdx) 		{return -1}
            if (a.position.divIdx > b.position.divIdx) 		{return 1}
            if (a.position.begin < b.position.begin) 		{return -1}
            if (a.position.begin > b.position.begin) 		{return 1}
            return 0;
        });
        //t.push(performance.now()); 

        /*
        for (var ttt = 1; ttt < t.length; ttt++) {
        	var d = t[ttt] - t[ttt - 1];
        	console.log('PERF Step ' + ttt + ' took ' + d);
        }
        var d = t[ttt-1] - t[0];
    	console.log('PERF Alltt ' + ttt + ' took ' + d);
        */
        
        // step 4 draw
        
        var ann = null; 
        var prev = null;
        var next = null;
        var position = null;
        var end = 0;
        var begin = 0;
        var tEnd = 0;
        
        var highlightSuffix = '';
        var behindTxtLength = 0;
        
        function nextAnnoSameRow(i) {      	         	
        	if (i + 1 == annotations.length) {return false;}
        	return (annotations[i].position.divIdx == annotations[i+1].position.divIdx) ? annotations[i+1] : false;
        }
        function prevAnnoSameRow(i) {      	         	
        	if (i == 0) {return false;}
        	return (annotations[i].position.divIdx == annotations[i-1].position.divIdx) ? annotations[i-1] : false;
        }
        
        var selectedMatch = (this.findController.selected.pageIdx == this.pageIdx) ? this.findController.selected.matchIdx : -1;
        
        
        for (var i = 0; i < annotations.length; i++) {
          ann = annotations[i];
          position = ann.position;
          next = nextAnnoSameRow(i);
          prev = prevAnnoSameRow(i);
          highlightSuffix = 'dbv-annotation ' + ann.base.type + ' ';
          end = position.end == 1000000 ? infinity.offset : position.end;
          begin = position.begin == -1 ? 0 : position.begin;
          tEnd = next ? next.position.begin : infinity.offset;
          
          // console.log('coords: ' + position.divIdx + '/' + position.begin + ' - ' + position.divIdx + '/' + position.end/*, 'for', JSON.stringify(ann.base)*/);
          //console.log(prev,ann,next);

			if ((selectedMatch > -1) && (ann.base.type == "_search") && (ann.base.id == "_searchresult_" + selectedMatch)) {				
				highlightSuffix += ' blink ';
			} 

			if (prev && ((position.begin < prev.position.end))) {
				highlightSuffix += ' overlap ';
			}
			
			if (next && ((position.end > next.position.begin))) {
				highlightSuffix += ' overlap ';
			}
			
			if (position.end == 1000000) {
				highlightSuffix += ' nr ';
			}
			
			if (position.begin == -1) {
				highlightSuffix += ' nl ';
			}
          
			// first annotation or first annotation in new row
			if (!prev) {
				appendTextToDiv(position.divIdx, 0, position.begin);
			}
          


          // add the annotation div
          appendTextToDiv(position.divIdx, begin, end, highlightSuffix, ann.base);

          // add text again because annotation is position:absolute now!        
          appendTextToDiv(position.divIdx, begin, tEnd);
          
        }
        
        
        // fill remaining text layers
        this.fillRows();
        

    },

    /**
     * show the popup
     */
    
    popupEventHandler: function(event) {
    	var annotation = this.findController.annoRegistry.registry[event.target.dataset.id]; 	
    	   	
    	if (event.type == 'click') {
    		this.annoViewer.renderAnnotationPopup(annotation, event.pageX, event.pageY);
    	}

    	if (event.type == 'mouseover') {
    		this.annoViewer.hoverAnnotationPopup(annotation, event.pageX, event.pageY);
    	}
    	
    	
    },
    
    /**
     * highlights one search match on this page
     * @param matchIdx
     * 
     * @return the row div with this match
     */
    highlightMatch: function(matchIdx, then) {
    	if (typeof this.renderingPromise.then !== "function") {
    		then(this.pageIdx, this.showHighlight(matchIdx));
    	} else {
    		this.renderingPromise.then(function() {
    			then(this.pageIdx, this.showHighlight(matchIdx));
    		}.bind(this))
    	}
    	
    },
    
	showHighlight: function(matchIdx) {
    	var spans = this.textLayerDiv.querySelectorAll('.dbv-annotation');
    	for (var i = 0; i < spans.length; i++) {
    		spans[i].classList.remove('blink');
    	}
    	var spans = this.textLayerDiv.querySelectorAll('.dbv-annotation[data-id="_searchresult_' + matchIdx + '"]');
    	//console.log('highlight ' + matchIdx, this.textLayerDiv,spans.length);
    	for (var i = 0; i < spans.length; i++) {
    		spans[i].classList.add('blink');	
    	}
    	if (spans.length > 0) {
    		return spans[0].parentNode;	
    	}
	},
    
    /**
     * dbv extension to show DAI computer generated annotations
     * 
     */
    pUpdateAnnotations: function TextLayerBuilder_pUpdateAnnotations() {
    	
        this.renderingPromise = new Promise(function(resolver) {// <-- womöglich woanders hin, 
      	  this.renderingPromiseResolve = resolver;
        }.bind(this));
    	
    	//var c = this.findController.dbvAnnoMatchesReady[this.pageIdx] ? this.findController.dbvAnnoMatchesReady[this.pageIdx].length : 'NONE';
    	//console.log('UPDATE ANNOS PAGE ' + this.pageIdx, c);
        
    	if (this.findController === null) { console.log('no findcontroller');  return; }
        var dbvAnnotations = this.findController.dbvAnnoMatchesReady[this.pageIdx] || null;
        if (dbvAnnotations === null) {  console.log('no annotations for page ' + this.pageIdx);  return;  }
        this.dbvAnnoMatchesReady = this.pConvertAnnotations(dbvAnnotations); // dontRecalculate ? this.dbvAnnoMatchesReady : 
        if (this.dbvAnnoMatchesReady && (this.dbvAnnoMatchesReady.length > 0)) {
        	//console.log("RENDER THEM ON PAGE " + this.pageIdx, this.dbvAnnoMatchesReady.length, this.dbvAnnoMatchesReady);
            this.pRenderAnnotations(this.dbvAnnoMatchesReady);
        } else {
        	//console.log('NOTHING TO RENDER ON PAGE ' + this.pageIdx, this.dbvAnnoMatchesReady.length);
        	this.clearRows();
        	this.fillRows(true);
        }
        
        this.renderingPromiseResolve();
    },

    /**
     * Fixes text selection: adds additional div where mouse was clicked.
     * This reduces flickering of the content if mouse slowly dragged down/up.
     * @private
     */
    _bindMouse: function TextLayerBuilder_bindMouse() {
      var div = this.textLayerDiv;
      div.addEventListener('mousedown', function (e) {
        var end = div.querySelector('.endOfContent');
        if (!end) {
          return;
        }
//#if !(MOZCENTRAL || FIREFOX)
        // On non-Firefox browsers, the selection will feel better if the height
        // of the endOfContent div will be adjusted to start at mouse click
        // location -- this will avoid flickering when selections moves up.
        // However it does not work when selection started on empty space.
        var adjustTop = e.target !== div;
//#if GENERIC
        adjustTop = adjustTop && window.getComputedStyle(end).
          getPropertyValue('-moz-user-select') !== 'none';
//#endif
        if (adjustTop) {
          var divBounds = div.getBoundingClientRect();
          var r = Math.max(0, (e.pageY - divBounds.top) / divBounds.height);
          end.style.top = (r * 100).toFixed(2) + '%';
        }
//#endif
        end.classList.add('active');
      });
      div.addEventListener('mouseup', function (e) {
        var end = div.querySelector('.endOfContent');
        if (!end) {
          return;
        }
//#if !(MOZCENTRAL || FIREFOX)
        end.style.top = '';
//#endif
        end.classList.remove('active');
      });
    },
  };
  return TextLayerBuilder;
})();

/**
 * @constructor
 * @implements IPDFTextLayerFactory
 */
function DefaultTextLayerFactory() {}
DefaultTextLayerFactory.prototype = {
  /**
   * @param {HTMLDivElement} textLayerDiv
   * @param {number} pageIndex
   * @param {PageViewport} viewport
   * @returns {TextLayerBuilder}
   */
  createTextLayerBuilder: function (textLayerDiv, pageIndex, viewport) {
    return new TextLayerBuilder({
      textLayerDiv: textLayerDiv,
      pageIndex: pageIndex,
      viewport: viewport,
      annoViewer: this.annoViewer,
      annoRegistry: this.annoRegistry
    });
  }
};

exports.TextLayerBuilder = TextLayerBuilder;
exports.DefaultTextLayerFactory = DefaultTextLayerFactory;
}));
