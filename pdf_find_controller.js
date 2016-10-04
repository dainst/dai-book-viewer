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
    
    this.eventBus = options.eventBus;

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
      
      this.searchHistory = [];
      this.lastSearch = null;
      
      this.dbvAnnoMatchesReady = {}; // list of annotation already found on page, in the form {position: {begin:<begin>; length:<length>}, base: <annotation obj>}(paf)
      this.dbvAnnoMatchesPending = {}; // list of annotations waiting to be resolved if the corresponding page is loaded - ordered by page (paf)
      this.searchId = 0;
      this.pageLastRenderedSearchId = [];
      
      this.firstPagePromise = new Promise(function (resolve) {
        this.resolveFirstPage = resolve;
      }.bind(this));
      
      
      this.annoRegistry.onGetAnnotations(function onGetAnnotations_pSetAnnotations() {
    	  return this.pSetAnnotations();
      }.bind(this));
      
    },

    normalize: function PDFFindController_normalize(text, isQuery) {  
    	if (typeof text === 'object') { // paf
    		var ret = [];
    		for (var i = 0; i < text.length; i++) {
    			ret.push(this.normalize(text[i]))
    		}
    		return ret;
    	}
    	
    	
      var normalized = text.replace(this.normalizationRegex, function (ch) {
        return CHARACTERS_TO_NORMALIZE[ch];
      });
      
      
      if (isQuery) {
    	  // if it's a query, then 
    	  // 1. escape regex cahracters
    	  // 2. normalize groups of white spaces
    	  normalized = normalized.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\s+/g, '\\s+')
      }
      
      return normalized; 
      
    },  
    
    /**
     * (dbv function)
     * 
     * start the finding process of all registered annotations
     * 
     * finds begin and length for the term using find functions
     * 
     * (gets called by app.js)
	 * 
     */
    pSetAnnotations: function PDFFindController_pSetAnntotations() {
		for (var id in this.annoRegistry.registry) {			
			this.pSetAnnotation(this.annoRegistry.registry[id]);
		}
    },
        
    /**
     * find every term from an annotation: these are different annotations from the perspective of
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
    	 * 
    	 * search term which is connection with annotation on page pageIndex
    	 */
    	function searchOnPage(annotation, pageIndex, term) {
    		//console.log('SOP search on page ' + pageIndex + ' for: ' + term, annotation);

        	var matches = self.calcFind(term, pageIndex, {'phraseSearch': false, 'caseSensitive': false, 'regex': false});     	
        	
        	if (!matches) {
        		//console.log('SOP no Matches for ', term, matches, annotation, ' on page ', pageIndex);
        		return;
        	}
        	
	        //console.log('SOP and found:', matches);
	        for (var i = 0; i < matches.length; i++) {
	        	var termLength = ((typeof term === "object") ? term[1].length : term.length);
	    		//console.log('MM:X ', termLength, term);
	        	
	    		if (typeof self.dbvAnnoMatchesReady[pageIndex] === 'undefined') self.dbvAnnoMatchesReady[pageIndex] = [];
	    		
	    		self.dbvAnnoMatchesReady[pageIndex].push({
	    			position: matches[i],
	    			base: annotation
	    		});
				
	        }		    
    	}
 	

    	// fetch page content if necessary and search

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
    		    
    		    self.dbvAnnoMatchesPending[pageIndex] = [];
    		    
    		    var page = self.pdfViewer.getPageView(pageIndex);
    		    //var hasTextLayer = page.textLayer ? 'YES' : 'NO';
    		    //console.log("FINISHED WITH PAGE " + pageIndex + " HAS TEXTLAYER? " + hasTextLayer);
    		    if (page.textLayer) {
    		    	page.textLayer.pUpdateAnnotations();
    		    }
    		    
    		    
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
    calcFindWholeWordMatch: function PDFFindController_calcFindWholeWordMatch(query, pageIndex, pageContent, settings) {
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
        
        var ci = settings.caseSensitive ? '' : 'i';
        
        var regexp = new RegExp('(' + predecessor + ')\\b([\\W\\d]*)(' + term + ')[\\W\\d]*\\b(' + successor + ')', 'g' + ci);
    	//console.log('MM:' + regexp);

        while ((match = regexp.exec(pageContent)) !== null) {
        	// match: 0: all 1: predecessor 2: trailing non-word-characters 3: term 4: successor
        	//console.log('MM:' + match.index + ' | ' + match[1] + ' (' + match[1].length + ') | ' + match[2] + ' (' + match[2].length + ')');
        	matches.push({
        		'begin': match.index + match[1].length + match[2].length,
        		'length': term.length 
        	});
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
    calcFindPhraseMatch: function PDFFindController_calcFindPhraseMatch(query, pageIndex, pageContent, settings) {
        var matches = [];
        var match;
    	
        if ((typeof query === "object") && (typeof query.length !== "undefined")) {
        	query = query.join('\\s+');
        }
        
        var ci = settings.caseSensitive ? '' : 'i';
        //
        
        
        var regexp = new RegExp(query, 'g' + ci);
        //console.log('MM: ', regexp);
        
        while ((match = regexp.exec(pageContent)) !== null) {
        	//console.log('MM:', match );
        	matches.push({
        		'begin': match.index,
        		'length': match[0].length
        	});
        }
        return matches;
    },
    
    /**
     * 
     * generic search function, used by find function, as well as by the dbv annotation system,
     * and could be used for other search purposes as well 
     * 
     * 
     * 
     * 
     * @param query			- <string> or <array> (s. a.)
     * @param pageIndex		- <int>
     * @param settings 		- <object> {
     * 							caseSensitive: 	<bool>: false*,
     * 							phraseSearch:	<bool>: true*
     * 							regex:			<bool>: false*
     * 						}
     * @returns <array> of <position>
     */
    calcFind: function (query, pageIndex, settings) {
    	//console.log('calcFind', query, pageIndex, settings);
        
    	// is there something to search?
        if (query.length === 0) {
            // Do nothing: the matches should be wiped out already.
            return [];
        }
    	
    	// apply default settings
        var searchsettings = {};
    	var defaults = {
    		caseSensitive: 	false,
    		phraseSearch: 	true,
    		regex:			false
    	};
    	for (var setting in defaults) {
    		searchsettings[setting] = (typeof settings[setting] === "undefined") ? defaults[setting] : settings[setting];
    	}
    	
    	// normalize page content and query
    	var pageContent = this.normalize(this.pageContents[pageIndex], false);
        query = (settings.regex) ? query : this.normalize(query, true);
        
        //console.log('FIND ', query, pageIndex, searchsettings);
             
        if (settings.phraseSearch) {
        	return this.calcFindPhraseMatch(query, pageIndex, pageContent, searchsettings);
        } else {
        	return this.calcFindWholeWordMatch(query, pageIndex, pageContent, searchsettings);
        }
    },
    
    /**
     * search function
     * 
     * @param pageIndex
     */
    calcFindMatch: function PDFFindController_calcFindMatch(pageIndex) {
    	//console.log('calcFindMatch', pageIndex);
    	
    	var method = 'phraseSearch';// this.state.phraseSearch ? 'phraseSearch': 'wordMatch';
    	
    	this.pageMatches[pageIndex] = this.calcFind(this.state.query, pageIndex, this.state);

    	if (!this.pageMatches[pageIndex]) {
    		return;
    	}
    	
    	if (typeof this.dbvAnnoMatchesReady[pageIndex] === 'undefined') this.dbvAnnoMatchesReady[pageIndex] = [];
    	for (var i = 0; i < this.pageMatches[pageIndex].length; i++) {
    		this.dbvAnnoMatchesReady[pageIndex].push({
    			position: this.pageMatches[pageIndex][i],
    			base: {
    				type: '_search',
    				id: '_searchresult_' + i,
    				search: '_search_' + this.searchId,
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
      console.log('WHAT ', cmd, state, this.matchCount);
      
      if (this.state === null || cmd !== 'findagain') {
      	this.dirtyMatch = true;
      }

      this.state = state;
      this.updateUIState(FindStates.FIND_PENDING);
      
      var newSearch = this.isNewSearch()  ? this.matchCount : -1; // because dirtyMatch can be changed in the 2500ms
      console.log('PLZ ' + newSearch + ' | ' + cmd);
      var oldSearch = (cmd == 'findold');

      this.firstPagePromise.then(function() {
        this.extractText();
                
        clearTimeout(this.findTimeout);
        if (cmd === 'find') {         
          this.findTimeout = setTimeout(function() { // Only trigger the find action after 2500ms of silence.
        	  this.nextMatch(newSearch, oldSearch);       	  
          }.bind(this), 2500);
        } else {
          this.nextMatch(newSearch, oldSearch);
        }
      }.bind(this));
    },
    
    stateToSearch: function(id, state, results) {   	
    	return {
			id: id,
			results: results,
            query: state.query,
            caseSensitive: state.caseSensitive,
            phraseSearch: state.phraseSearch,
            regex: state.regex
		};
    },
    
    isNewSearch: function() {
    	console.log(this.searchHistory.length > 0 ? 'PLZ compare ' + this.state.query + ' vs ' + this.searchHistory[this.searchHistory.length -1].query : 'PLZ 10829');

    	if (this.searchHistory.length == 0) {
    		return true;
    	}
    	var lastSearch = this.searchHistory[this.searchHistory.length -1]
    	return (
			(this.state.query != lastSearch.query) ||
			(this.state.caseSensitive != lastSearch.caseSensitive) ||
			(this.state.phraseSearch != lastSearch.phraseSearch) || 
			(this.state.regex != lastSearch.regex)
    	);
    },
    
    /**
     * updated a page
     * 
     * 
     * @param index
     */
    updatePage: function PDFFindController_updatePage(index) {
    	//console.log('UPDATE PAGE ' + index + ' (selected is ' + this.selected.pageIdx + ') [match nr: ' + this.selected.matchIdx  + ']');
      
    	if (this.selected.pageIdx === index) {
	        this.pdfViewer.scrollPageIntoView(index + 1);
    	}

    	// highlight current match if given and show
    	var page = this.pdfViewer.getPageView(index);
    	if (page.textLayer && this.selected.matchIdx !== -1 && this.selected.pageIdx == index) {
    		var textDiv = page.textLayer.highlightMatch(this.selected.matchIdx);
    		this.updateMatchPosition(index, textDiv);
    	}
    	
    	// stop if not new search
    	if (this.pageLastRenderedSearchId[index] >= this.searchId) {
    		//console.log('DONT RENDER PAGE ' + index + ' AGAIN, was last rendered with ' + this.pageLastRenderedSearchId[index] + ' | current search is '  + this.searchId);
    		return;
    	}
       
    	// filter old search results
    	var self = this;
    	this.dbvAnnoMatchesReady[index] = this.dbvAnnoMatchesReady[index].filter(function(x) {
    		return (!((x.base.type == '_search') && (x.base.search != '_search_' + self.searchId)));
    	});
      
    	// re-render textlayer
    	var page = this.pdfViewer.getPageView(index);
    	if (page.textLayer) {
    		page.textLayer.pUpdateAnnotations();
    		this.pageLastRenderedSearchId[index] = this.searchId;
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
    	//console.log('reload all text layerz', this.pdfViewer.pdfDocument.numPages);
    	/*
    	for (var i = 0; i < this.pdfViewer.pdfDocument.numPages; i++) {
    		var page = this.pdfViewer.getPageView(i);
    		if (page.textLayer) {
    			page.textLayer.doRerender = true;
    		}
    	}
    	 */
    	
    },

    /**
     * the next to be shown
     * 
     * @param newSearch - is this the first match of a newly entered query / number of matches of the search before
     * @param oldSearch - is this search reverted from search history? 
     */
    nextMatch: function PDFFindController_nextMatch(newSearch, oldSearch) {

      var previous = this.state.findPrevious;
      var currentPageIndex = this.pdfViewer.currentPageNumber - 1;
      var numPages = this.pdfViewer.pagesCount;

      this.active = true;
    
      if (newSearch !== -1) {

        this.searchId++;  	
  	 	console.log('NEW SEARCH ' + oldSearch + ' | ' + newSearch);
  	 	
  	 	if (typeof this.searchHistory[this.searchId -1] !== "undefined") {
  	 		console.log("update match cunt");
  	 		this.searchHistory[this.searchId -1].results = newSearch;
  	 	}
  	 	
  	 	if (!oldSearch) {
  		  	var s = this.stateToSearch(this.searchId, this.state, '?'); //
  	    	this.searchHistory[s.id] = s;
  			this.eventBus.dispatch('newsearch');
  			console.log('NEW SEARCH DISPATCHED', s);
  	 	}
  	 	
      }
      
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
	        this.extractTextPromises[i].then(function(pageIdx) {
	          self.calcFindMatch(pageIdx);
	        });
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
        
        if ((!previous && offset.matchIdx + 1 < numPageMatches) || (previous && offset.matchIdx > 0)) {
          // The simple case; we just have advance the matchIdx to select
          // the next match on the page.
          this.hadMatch = true;
          offset.matchIdx = (previous ? offset.matchIdx - 1 : offset.matchIdx + 1);
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
     * @param {textDiv} beginIdx - start index of the div array for the match.
     */
    updateMatchPosition: function PDFFindController_updateMatchPosition(pageIndex, textDiv) {    	
		var spot = {
				top: FIND_SCROLL_OFFSET_TOP,
				left: FIND_SCROLL_OFFSET_LEFT
		};
		//console.log("updateMatchPosition page " + pageIndex, textDiv, spot);		
		scrollIntoView(textDiv, spot, /* skipOverflowHiddenElements = */ true);
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
