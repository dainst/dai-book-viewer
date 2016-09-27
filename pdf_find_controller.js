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
    define('pdfjs-dbv/pdf_find_controller', ['exports', 'pdfjs-dbv/ui_utils'],
      factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebPDFFindController = {}), root.pdfjsWebUIUtils);
  }
}(this, function (exports, uiUtils) {

var scrollIntoView = uiUtils.scrollIntoView;

var FindStates = {
  FIND_FOUND: 0,
  FIND_NOTFOUND: 1,
  FIND_WRAPPED: 2,
  FIND_PENDING: 3
};

var FIND_SCROLL_OFFSET_TOP = -50;
var FIND_SCROLL_OFFSET_LEFT = -400;

var CHARACTERS_TO_NORMALIZE = {
  '\u2018': '\'', // Left single quotation mark
  '\u2019': '\'', // Right single quotation mark
  '\u201A': '\'', // Single low-9 quotation mark
  '\u201B': '\'', // Single high-reversed-9 quotation mark
  '\u201C': '"', // Left double quotation mark
  '\u201D': '"', // Right double quotation mark
  '\u201E': '"', // Double low-9 quotation mark
  '\u201F': '"', // Double high-reversed-9 quotation mark
  '\u00BC': '1/4', // Vulgar fraction one quarter
  '\u00BD': '1/2', // Vulgar fraction one half
  '\u00BE': '3/4', // Vulgar fraction three quarters
};

/**
 * Provides "search" or "find" functionality for the PDF.
 * This object actually performs the search for a given string.
 */
var PDFFindController = (function PDFFindControllerClosure() {
  function PDFFindController(options) {
    this.pdfViewer = options.pdfViewer || null;
    this.annoRegistry = options.annoRegistry || null;

    this.onUpdateResultsCount = null;
    this.onUpdateState = null;

    this.reset();

    // Compile the regular expression for text normalization once.
    var replace = Object.keys(CHARACTERS_TO_NORMALIZE).join('');
    this.normalizationRegex = new RegExp('[' + replace + ']', 'g');
  }

  PDFFindController.prototype = {
    reset: function PDFFindController_reset() {
      this.startedTextExtraction = false;
      this.extractTextPromises = [];
      this.pendingFindMatches = Object.create(null);
      this.active = false; // If active, find results will be highlighted.
      this.pageContents = []; // Stores the text for each page.
      this.pageMatches = [];
      this.pageMatchesLength = null;
      this.matchCount = 0;
      this.selected = { // Currently selected match.
        pageIdx: -1,
        matchIdx: -1
      };
      this.offset = { // Where the find algorithm currently is in the document.
        pageIdx: null,
        matchIdx: null
      };
      this.pagesToSearch = null;
      this.resumePageIdx = null;
      this.state = null;
      this.dirtyMatch = false;
      this.findTimeout = null;
      
      this.dbvAnnoMatchesReady = {}; // list of annotation allready found on page, in the form {position: {begin:<begin>; length:<length>}, base: <annotation obj>}(paf)
      this.dbvAnnoMatchesPending = {}; // list of annotations waiting to be resolved if the corresponding page is loaded - ordered by page (paf)
      this.searchId = 0;
      
      this.firstPagePromise = new Promise(function (resolve) {
        this.resolveFirstPage = resolve;
      }.bind(this));
    },

    normalize: function PDFFindController_normalize(text) {  
    	if (typeof text === 'object') { // paf
    		var ret = [];
    		for (var i = 0; i < text.length; i++) {
    			ret.push(this.normalize(text[i]))
    		}
    		return ret;
    	}
    	
    	
      return text.replace(this.normalizationRegex, function (ch) {
        return CHARACTERS_TO_NORMALIZE[ch];
      });
    },

    // Helper for multiple search - fills matchesWithLength array
    // and takes into account cases when one search term
    // include another search term (for example, "tamed tame" or "this is").
    // Looking for intersecting terms in the 'matches' and
    // leave elements with a longer match-length.

    _prepareMatches: function PDFFindController_prepareMatches(
        matchesWithLength, matches, matchesLength) {

      function isSubTerm(matchesWithLength, currentIndex) {
        var currentElem, prevElem, nextElem;
        currentElem = matchesWithLength[currentIndex];
        nextElem = matchesWithLength[currentIndex + 1];
        // checking for cases like "TAMEd TAME"
        if (currentIndex < matchesWithLength.length - 1 &&
            currentElem.match === nextElem.match) {
          currentElem.skipped = true;
          return true;
        }
        // checking for cases like "thIS IS"
        for (var i = currentIndex - 1; i >= 0; i--) {
          prevElem = matchesWithLength[i];
          if (prevElem.skipped) {
            continue;
          }
          if (prevElem.match + prevElem.matchLength < currentElem.match) {
            break;
          }
          if (prevElem.match + prevElem.matchLength >=
              currentElem.match + currentElem.matchLength) {
            currentElem.skipped = true;
            return true;
          }
        }
        return false;
      }

      var i, len;
      // Sorting array of objects { match: <match>, matchLength: <matchLength> }
      // in increasing index first and then the lengths.
      matchesWithLength.sort(function(a, b) {
        return a.match === b.match ?
        a.matchLength - b.matchLength : a.match - b.match;
      });
      for (i = 0, len = matchesWithLength.length; i < len; i++) {
        if (isSubTerm(matchesWithLength, i)) {
          continue;
        }
        matches.push(matchesWithLength[i].match);
        matchesLength.push(matchesWithLength[i].matchLength);
      }
    },
    
    
    /**
     * (dbv function)
     * 
     * start the finding process of all registered annotations
     * 
     * finds begin and length for the term using find functions
	 * 
     */
    pSetAnnotations: function PDFFindController_pSetAnntotations() {
		for (var id in this.annoRegistry.registry) {			
			this.pSetAnnotation(this.annoRegistry.registry[id]);
		}
    },
        
    /**
     * find every term from an annotation: theese are different annotations from the perspective of
     * find-controller / text-layer-builder, but have the same id
     * 
     * @param annotation
     */
    pSetAnnotation: function(annotation) {
    	if (typeof annotation.terms === "undefined" || annotation.terms.length == 0) {
    		console.log('no terms for ', annotation);
    		return;
    	}
    	if (typeof annotation.pages === "undefined" || annotation.pages.length == 0) { // TODO interpretate as all pages
    		console.log('no pages for ', annotation);
    		return;
    	}
		
		for (var j = 0; j < annotation.terms.length; j++) {
			for (var k = 0; k < annotation.pages.length; k++) {
				var term = annotation.terms[j];
				var page = annotation.pages[k];
				this.pFindAnnotation(annotation, term, page);
			}
		}
    },
    
    /**
     * (dbv function)
     * 
     * finds a annotation term on a page
     * @param annotation
     * @param term
     * @param page
     */   
    pFindAnnotation: function PDFFindController_pFindAnnotation(annotation, term, page) {

    	var pageIndex = parseInt(page);
    	var self = this;
    	
    	//console.log('find: ' + term + ' on page ' + pageIndex, annotation);
      	
    	/**
    	 * after annotation was found on the page call:
    	 */
    	function resolveAnnotation(annotation, pageIndex, begin, length) {  		    		
    		//console.log('resolving Annotation', annotation, pageIndex, begin, length);
    		    		
    		// put the annotation in a collection, which is ready to be displayed
    		if (typeof self.dbvAnnoMatchesReady[pageIndex] === 'undefined') self.dbvAnnoMatchesReady[pageIndex] = [];
    		
    		
    		self.dbvAnnoMatchesReady[pageIndex].push({
    			position: {
    				begin: begin,
    				length: length
    			},
    			base: annotation
    		});
    		
    		
		    
    	}
    	
    	/**
    	 * 
    	 * search term which is connection with annotation on page pageIndex
    	 */
    	function searchOnPage(annotation, pageIndex, term) { // @ XXX searchOnPage
    		//console.log('SOP search on page ' + pageIndex + ' for: ' + term, annotation);

        	var matches = self.calcFind(term, pageIndex, 'wholeWord');     	
        	
        	if (!matches) {
        		//console.log('SOP no Matches for ', term, matches, annotation, ' on page ', pageIndex);
        		return;
        	}
        	
	        //console.log('SOP and found:', matches);
	        for (var i = 0; i < matches.length; i++) {
	        	var termLength = ((typeof term === "object") ? term[1].length : term.length);
	    		//console.log('MM:X ', termLength, term);
				resolveAnnotation(annotation, pageIndex, matches[i], termLength);
	        }		    
    	}

    	// annotation has position already (may occur in hardcoded tests, in the future in some cached stuff maybe or something)
    	if ((typeof annotation.begin !== "undefined") && (typeof annotation.length !== "undefined")) {
    		console.log('forward it');
    		resolveAnnotation(annotation, pageIndex, begin, length);
    		return;
    	}
    	

    	// fetch page content if necessary and search

    	//console.log('pageContent of page  ', pageIndex, ':', self.pageContents[pageIndex]);

    	// a) page content is loaded (from previous serach or whatever)
    	if (typeof self.pageContents[pageIndex] !== "undefined") {
    		//console.log('a) search directly', pageIndex, self.pageContents[pageIndex], term);
    		searchOnPage(annotation, pageIndex, term);
    		return;
    	}
    	
    	// b) page content is not loaded but is set pending for loading (because a previous annotation is on the same page)
    	if (typeof self.dbvAnnoMatchesPending[pageIndex] !== "undefined") {
    		self.dbvAnnoMatchesPending[pageIndex].push({annotation: annotation, term: term});
    		// attach annotation to pending page
    		//console.log('b) set pending', pageIndex, self.dbvAnnoMatchesPending[pageIndex], term);
    		return;
    	}
    	
    	// c) page content is not loaded and has to be
    	self.dbvAnnoMatchesPending[pageIndex] = [{annotation: annotation, term: term}];
    	// get pageTextContent
    	//console.log('c) going to resolve ', pageIndex, self.dbvAnnoMatchesPending[pageIndex], term);
    	self.pdfViewer.getPageTextContent(pageIndex).then(  /* ASYNC */
    		function textContentResolved(textContent) {
    		    
    			//console.log('resolving page '+ pageIndex + ' with ' + self.dbvAnnoMatchesPending[pageIndex].length + ' annos pending');
    			
    			// assemble pageContent as a string.
    			var textItems = textContent.items;
    		    var str = [];
    		    for (var i = 0, len = textItems.length; i < len; i++) {
    		      str.push(textItems[i].str);
    		    }
    		    self.pageContents[pageIndex] = str.join('');
    		    
    		    // resolve attached annotations
    		    for (var i = 0, len = self.dbvAnnoMatchesPending[pageIndex].length; i < len; i++) {
    		    	searchOnPage(self.dbvAnnoMatchesPending[pageIndex][i].annotation, pageIndex, self.dbvAnnoMatchesPending[pageIndex][i].term);
    		    }
    		    
    		    self.updatePage(pageIndex);
    		    self.dbvAnnoMatchesPending[pageIndex] = [];
    		    
    		}
    	); /* \ ASYNC */

    	

    },
    
    /**
     * (dbv function)
     * 
     * a find function for whole words (as annotations are usually)
     * query can have a defined successor and/or predecessor
     * 
     * 
     * @param query
     * @param pageIndex
     * @param pageContent
     */
    calcFindWholeWordMatch: function PDFFindController_calcFindWholeWordMatch(query, pageIndex, pageContent) { // @ XXX calcFindWholeWordMatch
        var matches = [];
        var match;
        var predecessor = '';
		var successor = '';
		var term = query;
        if ((typeof query === "object") && (typeof query.length !== "undefined")) {
        	if (query.length == 2) {
           		predecessor = query[0];
        		term = query[1];
        	} else if (query.length == 3) {
           		predecessor = query[0];
        		term = query[1];
        		successor = query[2];
        	} else {
        		console.log('can not handle term:', term);
        	}
        }        
        
        var regexp = new RegExp('(' + predecessor + ')\\b([\\W\\d]*)(' + term + ')[\\W\\d]*\\b(' + successor + ')', 'gi');
    	//console.log('MM:' + regexp);

        while ((match = regexp.exec(pageContent)) !== null) {
        	// match: 0: all 1: predecessor 2: trailing non-word-characters 3: term 4: successor
        	//console.log('MM:' + match.index + ' | ' + match[1] + ' (' + match[1].length + ') | ' + match[2] + ' (' + match[2].length + ')');
        	matches.push(match.index + match[1].length + match[2].length);
        }
        //console.log(matches);
        return matches;
	},

	/**
	 * * default find function for phrase match 
	 * 
	 * @param query
	 * @param pageIndex
	 * @param pageContent
	 */
    calcFindPhraseMatch: function PDFFindController_calcFindPhraseMatch(query, pageIndex, pageContent) { // @ XXX calcFindPhraseMatch
      var matches = [];
      var queryLen = query.length;
      var matchIdx = -queryLen;
      while (true) {
        matchIdx = pageContent.indexOf(query, matchIdx + queryLen);
        if (matchIdx === -1) {
          break;
        }
        matches.push(matchIdx);
      }
      //console.log(matches);
      
      
      return matches;
    },

    /**
     * default find function for word match 
     * 
     * 
     * @param query
     * @param pageIndex
     * @param pageContent
     */
    calcFindWordMatch: function PDFFindController_calcFindWordMatch(query, pageIndex, pageContent) {

      var matchesWithLength = [];
      // Divide the query into pieces and search for text on each piece.
      var queryArray = query.match(/\S+/g);
      var subquery, subqueryLen, matchIdx;
      for (var i = 0, len = queryArray.length; i < len; i++) {
        subquery = queryArray[i];
        subqueryLen = subquery.length;
        matchIdx = -subqueryLen;
        while (true) {
          matchIdx = pageContent.indexOf(subquery, matchIdx + subqueryLen);
          // console.log(subquery, matchIdx);
          if (matchIdx === -1) {
            break;
          }
          // Other searches do not, so we store the length.
          matchesWithLength.push({
            match: matchIdx,
            matchLength: subqueryLen,
            skipped: false
          });
        }
      }
      // Prepare arrays for store the matches.
      if (!this.pageMatchesLength) {
        this.pageMatchesLength = [];
      }
      this.pageMatchesLength[pageIndex] = [];
      this.pageMatches[pageIndex] = [];
      // Sort matchesWithLength, clean up intersecting terms
      // and put the result into the two arrays.
      
      //this._prepareMatches(matchesWithLength, this.pageMatches[pageIndex],this.pageMatchesLength[pageIndex]);
      console.log('TO BE IMPLEMENTED');
      
    },
    
    /**
     * 
     * calls the selected search method 
     * used for annotations and searches
     * 
     * @param query			- string or array (s. a.)
     * @param pageIndex		- <int>
     * @param method 		- 'phraseSearch', 'wordMatch'* or 'wholeWord'
     * @param caseSensitive	- <bool> true*, false
     * @returns
     */
    calcFind: function (query, pageIndex, method, caseSensitive) { // @ XXX calcFind
    	//console.log('calcFind', query, pageIndex, method, caseSensitive);
        var pageContent = this.normalize(this.pageContents[pageIndex]);
        var query = this.normalize(query);

        var queryLen = query.length;
        if (queryLen === 0) {
        	console.log('FAILlen', query);
          // Do nothing: the matches should be wiped out already.
          return [];
        }
        //console.log('calcFind 2', query);
        if (caseSensitive !== false) {
          pageContent = pageContent.toLowerCase();
          if (typeof query.toLowerCase !== "function") {
        	  console.log('FAIL', query);
        	  return [];
          }
          query = query.toLowerCase();
        }
        
        //console.log('Searching with method "' + method + '" for ', query, ' ( caseSensitive is ', caseSensitive, ')');
        
        if (method == 'wholeWord') { // @ XXX search type selector
        	return this.calcFindWholeWordMatch(query, pageIndex, pageContent);
        } else if (method == 'phraseSearch') {
      	  	return this.calcFindPhraseMatch(query, pageIndex, pageContent);
        } else {
        	return this.calcFindWordMatch(query, pageIndex, pageContent);
        }
    },
    
    /**
     * searches function
     * 
     * @param pageIndex
     */
    calcFindMatch: function PDFFindController_calcFindMatch(pageIndex) {
    	//console.log('calcFindMatch', pageIndex);
    	
    	var method = this.state.phraseSearch ? 'phraseSearch': 'wordMatch';
    	
    	this.pageMatches[pageIndex] = this.calcFind(this.state.query, pageIndex, method, this.state.caseSensitive);

    	if (!this.pageMatches[pageIndex]) {
    		return;
    	}
    	
    	if (typeof this.dbvAnnoMatchesReady[pageIndex] === 'undefined') this.dbvAnnoMatchesReady[pageIndex] = [];
    	for (var i = 0; i < this.pageMatches[pageIndex].length; i++) {
    		this.dbvAnnoMatchesReady[pageIndex].push({
    			position: {
    				begin: this.pageMatches[pageIndex][i],
    				length: this.state.query.length
    			},
    			base: {
    				type: '_search',
    				id: this.searchId,
    				lemma: this.state.query
    			}
    		});
    	}

    	this.updatePage(pageIndex);

		if (this.resumePageIdx === pageIndex) {
			this.resumePageIdx = null;
			this.nextPageMatch();
		}
		
		// Update the matches count
		if (this.pageMatches[pageIndex].length > 0) {
			this.matchCount += this.pageMatches[pageIndex].length;
			this.updateUIResultsCount();
		}

    },

    extractText: function PDFFindController_extractText() {
      if (this.startedTextExtraction) {
        return;
      }
      this.startedTextExtraction = true;

      this.pageContents = [];
      var extractTextPromisesResolves = [];
      var numPages = this.pdfViewer.pagesCount;
      for (var i = 0; i < numPages; i++) {
        this.extractTextPromises.push(new Promise(function (resolve) {
          extractTextPromisesResolves.push(resolve);
        }));
      }

      var self = this;
      function extractPageText(pageIndex) {
        self.pdfViewer.getPageTextContent(pageIndex).then(
          function textContentResolved(textContent) {
            var textItems = textContent.items;
            var str = [];

            for (var i = 0, len = textItems.length; i < len; i++) {
              str.push(textItems[i].str);
            }

            // Store the pageContent as a string.
            self.pageContents.push(str.join(''));

            extractTextPromisesResolves[pageIndex](pageIndex);
            if ((pageIndex + 1) < self.pdfViewer.pagesCount) {
              extractPageText(pageIndex + 1);
            }
          }
        );
      }
      extractPageText(0);
    },

    executeCommand: function PDFFindController_executeCommand(cmd, state) {
      if (this.state === null || cmd !== 'findagain') {
      	this.dirtyMatch = true;
      	
    	this.searchId++;
    	console.log('NEW SEARCH', this.searchId);
      }
      this.state = state;
      this.updateUIState(FindStates.FIND_PENDING);

      this.firstPagePromise.then(function() {
        this.extractText();

        clearTimeout(this.findTimeout);
        if (cmd === 'find') {
          // Only trigger the find action after 250ms of silence.
          this.findTimeout = setTimeout(this.nextMatch.bind(this), 250);
        } else {
          this.nextMatch();
        }
      }.bind(this));
    },

    updatePage: function PDFFindController_updatePage(index) {
    	console.log('UPDATE PAGE ' + index + '( selected is ' + this.selected.pageIdx + ')');
      
    	if (this.selected.pageIdx === index) {
        // If the page is selected, scroll the page into view, which triggers
        // rendering the page, which adds the textLayer. Once the textLayer is
        // build, it will scroll onto the selected match.
        this.pdfViewer.scrollPageIntoView(index + 1);
      }
      
      // filter old search results
      
    	var c = this.dbvAnnoMatchesReady[index].length;   	
      var self = this;
      this.dbvAnnoMatchesReady[index] = this.dbvAnnoMatchesReady[index].filter(function(x) {
    	  return (!((x.base.type == '_search') && (x.base.id != self.searchId)));
      });
      var f = c - this.dbvAnnoMatchesReady[index].length;
      console.log('FILTA PAGE ' + index + ' FILTARED ' + f + ' thigs');

      var page = this.pdfViewer.getPageView(index);
      if (page.textLayer) {
    	  page.textLayer.pUpdateAnnotations(); 
      }
    },
    
    /**
     * reloads a pages text layer 
     * and DOES recalculate annotations
     * @param index
     */
    reloadPageTextLayer: function(index) {
        var page = this.pdfViewer.getPageView(index);
        if (page.textLayer) {
      	  page.textLayer.pUpdateAnnotations();
        }    	
    },
    
    /**
     *  reloads all text layers
     * and does NOT recalculate annotations
     */
    reloadAllTextLayers: function() {
    	console.log('reload all text layerz', this.pdfViewer.pdfDocument.numPages);
    	/*
    	for (var i = 0; i < this.pdfViewer.pdfDocument.numPages; i++) {
    		var page = this.pdfViewer.getPageView(i);
    		if (page.textLayer) {
    			page.textLayer.doRerender = true;
    		}
    	}
    	 */
    	
    },

    nextMatch: function PDFFindController_nextMatch() {

      var previous = this.state.findPrevious;
      var currentPageIndex = this.pdfViewer.currentPageNumber - 1;
      var numPages = this.pdfViewer.pagesCount;

      this.active = true;
 
      if (this.dirtyMatch) {
        // Need to recalculate the matches, reset everything.
        this.dirtyMatch = false;
        this.selected.pageIdx = this.selected.matchIdx = -1;
        this.offset.pageIdx = currentPageIndex;
        this.offset.matchIdx = null;
        this.hadMatch = false;
        this.resumePageIdx = null;
        this.pageMatches = [];
        this.matchCount = 0;
        this.pageMatchesLength = null;
        var self = this;

        for (var i = 0; i < numPages; i++) {
          
        	// Wipe out any previous highlighted matches.
        	

          // As soon as the text is extracted start finding the matches.
          if (!(i in this.pendingFindMatches)) {
            this.pendingFindMatches[i] = true;
            this.extractTextPromises[i].then(function(pageIdx) {
              delete self.pendingFindMatches[pageIdx];
              self.calcFindMatch(pageIdx);
            });
          }
        }
      }

      // If there's no query there's no point in searching.
      if (this.state.query === '') {
        this.updateUIState(FindStates.FIND_FOUND);
        return;
      }

      // If we're waiting on a page, we return since we can't do anything else.
      if (this.resumePageIdx) {
        return;
      }

      var offset = this.offset;
      

      
      // Keep track of how many pages we should maximally iterate through.
      this.pagesToSearch = numPages;
      // If there's already a matchIdx that means we are iterating through a
      // page's matches.
      if (offset.matchIdx !== null) {
        var numPageMatches = this.pageMatches[offset.pageIdx].length;
        if ((!previous && offset.matchIdx + 1 < numPageMatches) ||
            (previous && offset.matchIdx > 0)) {
          // The simple case; we just have advance the matchIdx to select
          // the next match on the page.
          this.hadMatch = true;
          offset.matchIdx = (previous ? offset.matchIdx - 1 :
                                        offset.matchIdx + 1);
          this.updateMatch(true);
          return;
        }
        // We went beyond the current page's matches, so we advance to
        // the next page.
        this.advanceOffsetPage(previous);
      }
      // Start searching through the page.
      this.nextPageMatch();
    },

    matchesReady: function PDFFindController_matchesReady(matches) {
      var offset = this.offset;
      var numMatches = matches.length;
      var previous = this.state.findPrevious;

      if (numMatches) {
     	  
        // There were matches for the page, so initialize the matchIdx.
        this.hadMatch = true;
        offset.matchIdx = (previous ? numMatches - 1 : 0);
        this.updateMatch(true);
        return true;
      } else {
        // No matches, so attempt to search the next page.
        this.advanceOffsetPage(previous);
        if (offset.wrapped) {
          offset.matchIdx = null;
          if (this.pagesToSearch < 0) {
            // No point in wrapping again, there were no matches.
            this.updateMatch(false);
            // while matches were not found, searching for a page
            // with matches should nevertheless halt.
            return true;
          }
        }
        // Matches were not found (and searching is not done).
        return false;
      }
    },

    /**
     * The method is called back from the text layer when match presentation
     * is updated.
     * @param {number} pageIndex - page index.
     * @param {number} index - match index.
     * @param {Array} elements - text layer div elements array.
     * @param {number} beginIdx - start index of the div array for the match.
     */
    updateMatchPosition: function PDFFindController_updateMatchPosition(
        pageIndex, index, elements, beginIdx) {
      if (this.selected.matchIdx === index &&
          this.selected.pageIdx === pageIndex) {
        var spot = {
          top: FIND_SCROLL_OFFSET_TOP,
          left: FIND_SCROLL_OFFSET_LEFT
        };
        scrollIntoView(elements[beginIdx], spot,
                       /* skipOverflowHiddenElements = */ true);
      }
    },

    nextPageMatch: function PDFFindController_nextPageMatch() {
      if (this.resumePageIdx !== null) {
        console.error('There can only be one pending page.');
      }
      do {
        var pageIdx = this.offset.pageIdx;
        var matches = this.pageMatches[pageIdx];
        if (!matches) {
          // The matches don't exist yet for processing by "matchesReady",
          // so set a resume point for when they do exist.
          this.resumePageIdx = pageIdx;
          break;
        }
      } while (!this.matchesReady(matches));
    },

    advanceOffsetPage: function PDFFindController_advanceOffsetPage(previous) {
      var offset = this.offset;
      var numPages = this.extractTextPromises.length;
      offset.pageIdx = (previous ? offset.pageIdx - 1 : offset.pageIdx + 1);
      offset.matchIdx = null;

      this.pagesToSearch--;

      if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
        offset.pageIdx = (previous ? numPages - 1 : 0);
        offset.wrapped = true;
      }
    },

    updateMatch: function PDFFindController_updateMatch(found) {
      var state = FindStates.FIND_NOTFOUND;
      var wrapped = this.offset.wrapped;
      this.offset.wrapped = false;

      if (found) {
        var previousPage = this.selected.pageIdx;
        this.selected.pageIdx = this.offset.pageIdx;
        this.selected.matchIdx = this.offset.matchIdx;
        state = (wrapped ? FindStates.FIND_WRAPPED : FindStates.FIND_FOUND);
        // Update the currently selected page to wipe out any selected matches.
        if (previousPage !== -1 && previousPage !== this.selected.pageIdx) {
          this.updatePage(previousPage);
        }
      }

      this.updateUIState(state, this.state.findPrevious);
      if (this.selected.pageIdx !== -1) {
        this.updatePage(this.selected.pageIdx);
      }
    },

    updateUIState: function PDFFindController_updateUIState(state, previous) {
        if (this.onUpdateState) {
          this.onUpdateState(state, previous, this.matchCount);
        }
    },
    
    updateUIResultsCount:
        function PDFFindController_updateUIResultsCount() {
      if (this.onUpdateResultsCount) {
        this.onUpdateResultsCount(this.matchCount);
      }
    },
    
    /* annotation control */
    
    showAnnotation: function(annotation) {
    	var annotation = this.annoRegistry.registerAnnotation(annotation);
    	this.pSetAnnotation(annotation);
    	for (var i =  0; i < annotation.pages.length; i++) {
	    	this.reloadPageTextLayer(annotation.pages[i]);
    	}
    }
    
    



  };
  return PDFFindController;
})();

exports.FindStates = FindStates;
exports.PDFFindController = PDFFindController;
}));
