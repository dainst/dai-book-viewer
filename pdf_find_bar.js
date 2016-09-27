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
    this.bar = options.elements.bar || null;
    this.findField = options.elements.findField || null;
    this.highlightAll = options.elements.highlightAllCheckbox || null;
    this.caseSensitive = options.elements.caseSensitiveCheckbox || null;
    this.findMsg = options.elements.findMsg || null;
    this.findResultsCount = options.elements.findResultsCount || null;
    this.findStatusIcon = options.elements.findStatusIcon || null;
    this.findPreviousButton = options.elements.findPreviousButton || null;
    this.findNextButton = options.elements.findNextButton || null;
    this.findController = options.elements.findController || null;
    this.eventBus = options.elements.eventBus;

    this.findController = options.findController;
    this.pdfSidebar = options.pdfSidebar;
    this.eventBus = options.eventBus;
    
    if (this.findController === null) {
      throw new Error('PDFFindBar cannot be used without a ' +
                      'PDFFindController instance.');
    }

    // Add event listeners to the DOM elements.
    var self = this;
/*    this.toggleButton.addEventListener('click', function() {
      self.toggle();
    });*/

    this.findField.addEventListener('input', function() {
      self.dispatchEvent('');
    });

    this.bar.addEventListener('keydown', function(evt) {
      switch (evt.keyCode) {
        case 13: // Enter
          if (evt.target === self.findField) {
            self.dispatchEvent('again', evt.shiftKey);
          }
          break;
        case 27: // Escape
          self.close();
          break;
      }
    });

    this.findPreviousButton.addEventListener('click', function() {
      self.dispatchEvent('again', true);
    });

    this.findNextButton.addEventListener('click', function() {
      self.dispatchEvent('again', false);
    });

    this.highlightAll.addEventListener('click', function() {
      self.dispatchEvent('highlightallchange');
    });

    this.caseSensitive.addEventListener('click', function() {
      self.dispatchEvent('casesensitivitychange');
    });
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
        phraseSearch: true,
        highlightAll: this.highlightAll.checked,
        findPrevious: findPrev
      });
    },

    updateUIState:
        function PDFFindBar_updateUIState(state, previous, matchCount) {
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

    close: function PDFFindBar_close() {
      if (!this.opened) {
    	// show annotation text layer
        return;
      }

      this.findController.active = false;
    },

/*    toggle: function PDFFindBar_toggle() {
      if (this.opened) {
        this.close();
      } else {
        this.open();
      }
    }*/
  };
  return PDFFindBar;
})();

exports.PDFFindBar = PDFFindBar;
}));
