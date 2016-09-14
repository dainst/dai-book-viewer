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
    this.divContentDone = false;
    this.pageIdx = options.pageIndex;
    this.pageNumber = this.pageIdx + 1;
    this.matches = [];
    this.viewport = options.viewport;
    this.textDivs = [];
    this.findController = options.findController || null;
    this.textLayerRenderTask = null;
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
      this.textLayerRenderTask.promise.then(function () {
        this.textLayerDiv.appendChild(textLayerFrag);
        this._finishRendering();
        this.updateMatches();
        this.pUpdateAnnotations(); //paf
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
    	  console.log('THE error we should haved to fixed', this.textContent, matches, matchesLength);
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
    		//console.log('UUUU ', JSON.stringify(annotations[i].position));
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
   
    
    // paf
    pHighlight: function TextLayerBuilder_pHighlight(annotations) {
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
          var content = bidiTexts[divIdx].str.substring(fromOffset, toOffset);//console.trace();console.log(content);
          
          var node = document.createTextNode(content);
          if (className) {
            var span = document.createElement('span');
            if (typeof annotation === "object") {
           		span.dataset.id = annotation.id; 
            	/**
            	 * mouse click / hover of annotation
            	 */
            	if (typeof annotation.references !== "undefined" && typeof annotation.references[0] !== undefined) {
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
        
        /**
         * unfortunately we have to sort this stuff, even it's expensive
         * @TODO we could implement our own sort and merge / skip overlapping items of same id!
         * (it is NOT possible to just skip them in the next step) 
         * 
         */
        var t1 = performance.now();
        annotations.sort(function(a, b) {
        	return ((a.position.divIdx * 10000 + a.position.begin) - (b.position.divIdx * 10000 + b.position.begin));
        });
        var t2 = performance.now();
        var dur = t2 - t1;
        //console.log('PERF:' + dur);
        //console.log(annotations);
        
        
        var ann = null;
        var prev = null;
        var next = null;
        var position = null;
        var end = 0;
        var begin = 0;
        var tEnd = 0;
        
        var highlightSuffix = 'dbv-annotation highlight ';
        var behindTxtLength = 0;
        
        function nextAnnoSameRow(i) {      	         	
        	if (i + 1 == annotations.length) {return false;}
        	return (annotations[i].position.divIdx == annotations[i+1].position.divIdx) ? annotations[i+1] : false;
        }
        function prevAnnoSameRow(i) {      	         	
        	if (i == 0) {return false;}
        	return (annotations[i].position.divIdx == annotations[i-1].position.divIdx) ? annotations[i-1] : false;
        }
        
        for (var i = 0; i < annotations.length; i++) {
        	
          ann = annotations[i];
          position = ann.position;
          next = nextAnnoSameRow(i);
          prev = prevAnnoSameRow(i);
          highlightSuffix = 'dbv-annotation highlight ' + ann.base.type + ' ';
          highlightSuffix += ((Object.keys(ann.base.references || {}).length === 0) && ((ann.base.text || '') == '')) ? '' : 'clickable '; 
          end = position.end == 1000000 ? infinity.offset : position.end;
          begin = position.begin == -1 ? 0 : position.begin;
          tEnd = next ? next.position.begin : infinity.offset;
          
         // console.log('coords: ' + position.divIdx + '/' + position.begin + ' - ' + position.divIdx + '/' + position.end/*, 'for', JSON.stringify(ann.base)*/);
          //console.log(prev,ann,next);
                 
          
          // first annotation or first annotation in new row
          if (!prev) {
        	  textDivs[position.divIdx].textContent = '';
        	  appendTextToDiv(position.divIdx, 0, position.begin);
          }
          
          if (prev && ((position.begin < prev.position.end) && (prev.base.id != ann.base.id))) {
        	  highlightSuffix += ' overlap ';
          }
          
          if (next && ((position.end > next.position.begin) && (next.base.id != ann.base.id))) {
        	  highlightSuffix += ' overlap ';
          }

          // add the annotation div
          appendTextToDiv(position.divIdx, begin, end, highlightSuffix, ann.base);

          // add text again because annotation is position:absolute now!        
          appendTextToDiv(position.divIdx, begin, tEnd);
          
          
          
        }


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
    
    renderMatches: function TextLayerBuilder_renderMatches(matches) {
      // Early exit if there is nothing to render.
      if (matches.length === 0) {
        return;
      }

      var bidiTexts = this.textContent.items;
      var textDivs = this.textDivs;
      var prevEnd = null;
      var pageIdx = this.pageIdx;
      var isSelectedPage = (this.findController === null ?
        false : (pageIdx === this.findController.selected.pageIdx));
      var selectedMatchIdx = (this.findController === null ?
                              -1 : this.findController.selected.matchIdx);
      var highlightAll = (this.findController === null ?
                          false : this.findController.state.highlightAll);
      var infinity = {
        divIdx: -1,
        offset: undefined
      };

      function beginText(begin, className) {
        var divIdx = begin.divIdx;
        textDivs[divIdx].textContent = '';
        appendTextToDiv(divIdx, 0, 5, className);
      }

      function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
        var div = textDivs[divIdx];
        var content = bidiTexts[divIdx].str.substring(fromOffset, toOffset);
        var node = document.createTextNode(content);
        if (className) {
          var span = document.createElement('span');
          span.className = className;
          span.appendChild(node);
          div.appendChild(span);
          return;
        }
        div.appendChild(node);
      }

      var i0 = selectedMatchIdx, i1 = i0 + 1;
      if (highlightAll) {
        i0 = 0;
        i1 = matches.length;
      } else if (!isSelectedPage) {
        // Not highlighting all and this isn't the selected page, so do nothing.
        return;
      }

      for (var i = i0; i < i1; i++) {
        var match = matches[i];
        var begin = match.begin;
        var end = match.end;
        var isSelected = (isSelectedPage && i === selectedMatchIdx);
        var highlightSuffix = (isSelected ? ' selected' : '');

        if (this.findController) {
          this.findController.updateMatchPosition(pageIdx, i, textDivs,
                                                  begin.divIdx);
        }

        // Match inside new div.
        if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
          // If there was a previous div, then add the text at the end.
          if (prevEnd !== null) {
            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
          }
          // Clear the divs and set the content until the starting point.
          beginText(begin);
        } else {
          appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
        }

        if (begin.divIdx === end.divIdx) {
          appendTextToDiv(begin.divIdx, begin.offset, end.offset,
                          'highlight' + highlightSuffix);
        } else {
          appendTextToDiv(begin.divIdx, begin.offset, infinity.offset,
                          'highlight begin' + highlightSuffix);
          for (var n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
            textDivs[n0].className = 'highlight middle' + highlightSuffix;
          }
          beginText(end, 'highlight end' + highlightSuffix);
        }
        prevEnd = end;
      }

      if (prevEnd) {
        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
      }
    },

    updateMatches: function TextLayerBuilder_updateMatches() {
      // Only show matches when all rendering is done.
      if (!this.renderingDone) {
        return;
      }

      // Clear all matches.
      var matches = this.matches;
      var textDivs = this.textDivs;
      var bidiTexts = this.textContent.items;
      var clearedUntilDivIdx = -1;

      // Clear all current matches.
      for (var i = 0, len = matches.length; i < len; i++) {
        var match = matches[i];
        var begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
        for (var n = begin, end = match.end.divIdx; n <= end; n++) {
          var div = textDivs[n];
          div.textContent = bidiTexts[n].str;
          div.className = '';
        }
        clearedUntilDivIdx = match.end.divIdx + 1;
      }

      if (this.findController === null || !this.findController.active) {
        return;
      }

      // Convert the matches on the page controller into the match format
      // used for the textLayer.
      var pageMatches, pageMatchesLength;
      if (this.findController !== null) {
        pageMatches = this.findController.pageMatches[this.pageIdx] || null;
        pageMatchesLength = (this.findController.pageMatchesLength) ?
          this.findController.pageMatchesLength[this.pageIdx] || null : null;
      }

      
      this.matches = this.convertMatches(pageMatches, pageMatchesLength);
      this.renderMatches(this.matches);
      
    },
    
    /**
     * extension to show DAI computer generated annotations
     * 
     */
    pUpdateAnnotations: function TextLayerBuilder_pUpdateAnnotations() {
               
        if (this.findController === null) {
        	console.log('no findcontroller');
        	return;
        }
        
        var dbvAnnotations = this.findController.dbvAnnoMatchesReady[this.pageIdx] || null;
        //console.log(this.findController.dbvAnnoMatchesReady);
        
        if (dbvAnnotations === null) {
        	//console.log('no annotations for page ' + this.pageIdx);
        	return;
        }
        //console.log('page ' + this.pageIdx , dbvAnnotations);
        
        this.dbvAnnoMatchesReady = this.pConvertAnnotations(dbvAnnotations);      
        this.pHighlight(this.dbvAnnoMatchesReady);
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
