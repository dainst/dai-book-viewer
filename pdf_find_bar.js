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
    define('pdfjs-dbv/pdf_find_bar', ['exports',
      'pdfjs-dbv/ui_utils', 'pdfjs-dbv/pdf_find_controller'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'),
      require('./pdf_find_controller.js'));
  } else {
    factory((root.pdfjsWebPDFFindBar = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebPDFFindController);
  }
}(this, function (exports, uiUtils, pdfFindController) {

var mozL10n = uiUtils.mozL10n;
var FindStates = pdfFindController.FindStates;

/**
 * Creates a "search bar" given a set of DOM elements that act as controls
 * for searching or for setting search preferences in the UI. This object
 * also sets up the appropriate events for the controls. Actual searching
 * is done by PDFFindController.
 */
var PDFFindBar = (function PDFFindBarClosure() {
  function PDFFindBar(options) {
    this.opened = false;
    
    //elements
    this.bar = options.elements.bar || null;
    this.findField = options.elements.findField || null;
    this.phraseSearch = options.elements.phraseSearchCheckbox || null;
    this.caseSensitive = options.elements.caseSensitiveCheckbox || null;
    this.regex = options.elements.regexCheckbox || null;
    this.findMsg = options.elements.findMsg || null;
    this.findResultsCount = options.elements.findResultsCount || null;
    this.findStatusIcon = options.elements.findStatusIcon || null;
    this.findPreviousButton = options.elements.findPreviousButton || null;
    this.findNextButton = options.elements.findNextButton || null;
    this.findDeleteButton = options.elements.findDeleteButton || null;
    this.findController = options.elements.findController || null;
    
    // controller
    this.findController = options.findController;
    this.pdfSidebar = options.pdfSidebar;
    this.eventBus = options.eventBus;
    this.$ = options.annoSidebar;
    console.log(this.$);
    this.$.parent = this;
    
    if (this.findController === null) {
      throw new Error('PDFFindBar cannot be used without a ' +
                      'PDFFindController instance.');
    }

    // Add event listeners to the DOM elements.
    var self = this;

    this.findField.addEventListener('input', function() {
      self.dispatchEvent('');
    });

    this.bar.addEventListener('keyup', function(evt) {
      switch (evt.keyCode) {
        case 13: // Enter
          if (evt.target === self.findField) {
            self.dispatchEvent('again', evt.shiftKey);
          }
          break;
        case 27: // Escape
        	self.findField.value = '';
        	self.dispatchEvent('instant');
          break;
      }
    });

    this.findPreviousButton.addEventListener('click', function() {
      self.dispatchEvent('again', true);
    });

    this.findNextButton.addEventListener('click', function() {
      self.dispatchEvent('again', false);
    });

    this.findDeleteButton.addEventListener('click', function() {
    	self.findField.value = '';
        self.dispatchEvent('instant');
    });
    
    this.caseSensitive.addEventListener('click', function() {
      self.dispatchEvent('casesensitivitychange');
    });
    
    this.phraseSearch.addEventListener('click', function() {
        self.dispatchEvent('phrasesearchchange');
    });
    
    this.regex.addEventListener('click', function() {
    	self.dispatchEvent('regexchange');
    });
    
    this.$.block('findHistory', 'Previous Searches', 'search', true, true);
    
  }

  PDFFindBar.prototype = {
    reset: function PDFFindBar_reset() {
      this.updateUIState();
    },

    dispatchEvent: function PDFFindBar_dispatchEvent(type, findPrev) { 	
      this.eventBus.dispatch('find', {
        source: this,
        type: type,
        query: this.findField.value,
        caseSensitive: this.caseSensitive.checked,
        phraseSearch: !this.phraseSearch.checked,
        regex: this.regex.checked, 
        findPrevious: findPrev
      });
    },

    updateUIState: function PDFFindBar_updateUIState(state, previous, matchCount) {
      var notFound = false;
      var findMsg = '';
      var status = '';

      switch (state) {
        case FindStates.FIND_FOUND:
          break;

        case FindStates.FIND_PENDING:
          status = 'pending';
          break;

        case FindStates.FIND_NOTFOUND:
          findMsg = mozL10n.get('find_not_found', null, 'Phrase not found');
          notFound = true;
          break;

        case FindStates.FIND_WRAPPED:
          if (previous) {
            findMsg = mozL10n.get('find_reached_top', null,
              'Reached top of document, continued from bottom');
          } else {
            findMsg = mozL10n.get('find_reached_bottom', null,
              'Reached end of document, continued from top');
          }
          break;
      }

      if (notFound) {
        this.findField.classList.add('notFound');
      } else {
        this.findField.classList.remove('notFound');
      }

      this.findField.setAttribute('data-status', status);
      this.findMsg.textContent = findMsg;

      this.updateResultsCount(matchCount);
    },

    updateResultsCount: function(matchCount) {
      if (!this.findResultsCount) {
        return; // no UI control is provided
      }

      // If there are no matches, hide the counter
      if (!matchCount) {
        this.findResultsCount.classList.add('hidden');
        return;
      }

      // Create the match counter
      this.findResultsCount.textContent = matchCount.toLocaleString();

      // Show the counter
      this.findResultsCount.classList.remove('hidden');
    },

    open: function PDFFindBar_open() {
      this.pdfSidebar.switchView('find');
    	
      this.findField.select();
      this.findField.focus();
    },
    
    addToHistory: function(searchId) {
    	if (searchId == 0) {
    		return;
    	}
    	
    	console.log('ATH: ' , searchId, this.findController.searchHistory);
    	var search = this.findController.searchHistory[searchId - 1];
    	if (search == null || search.query == '') {
    		return;
    	}
    	
		var entry = this.$.htmlElement('div', {'classes': ['dbv-av-block-entry']});
		var caption = this.$.htmlElement('span', {'classes': ['dbv-av-block-entry-caption']}, search.query, {'click': ['revertSearch', search.id]});
		entry.appendChild(caption);
		entry.appendChild(this.$.htmlElement('span', {'classes': ['badge', 'pull-right']}, search.results));
    	
    	this.$.blocks.findHistory.body.appendChild(entry);
    	
    	
    	
    },
    
    revertSearch: function(event, searchId) {
    	console.log('TBI',event, searchId);

    	var search = this.findController.searchHistory[searchId];
    	
    	//this.updateUIState(search, false, search.results);
    	this.findField.value = search.query;
        this.caseSensitive.checked = search.caseSensitive;
        this.phraseSearch.checked = !search.phraseSearch;
        this.regex.checked = search.regex; 
    	
        this.eventBus.dispatch('find', {
            source: this,
            type: 'old',
            query: search.query,
            caseSensitive: search.caseSensitive,
            phraseSearch: search.phraseSearch,
            regex: search.regex,
            findPrevious: false
        });
    }

  };
  return PDFFindBar;
})();

exports.PDFFindBar = PDFFindBar;
}));
