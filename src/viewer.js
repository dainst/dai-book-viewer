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
/*globals require, chrome */

'use strict';

var DEFAULT_URL = 'images/no_file.pdf';

//#if PRODUCTION
//var pdfjsWebLibs = {
//  pdfjsWebPDFJS: window.pdfjsDistBuildPdf
//};
//console.log(pdfjsWebLibs);

//(function () {
//#expand __BUNDLE__
//}).call(pdfjsWebLibs);
//#endif

function getViewerConfiguration() {
  return {
    appContainer: document.body,
    mainContainer: document.getElementById('viewerContainer'),
    viewerContainer:  document.getElementById('viewer'),
    eventBus: null, // using global event bus with DOM events
    toolbar: {
      container: document.getElementById('toolbarViewer'),
      numPages: document.getElementById('numPages'),
      pageNumber: document.getElementById('pageNumber'),
      scaleSelectContainer: document.getElementById('scaleSelectContainer'),
      scaleSelect: document.getElementById('scaleSelect'),
      customScaleOption: document.getElementById('customScaleOption'),
      previous: document.getElementById('previous'),
      next: document.getElementById('next'),
      firstPage: document.getElementById('firstPage'),
      lastPage: document.getElementById('lastPage'),
      zoomIn: document.getElementById('zoomIn'),
      zoomOut: document.getElementById('zoomOut'),
      viewFind: document.getElementById('viewFind'),
      openFile: document.getElementById('openFile'),
      print: document.getElementById('print'),
      download: document.getElementById('download'),
      toggleAnnotations: document.getElementById('toggleAnnotations'),
      yayBox: document.getElementById('yayBox')
    },
    secondaryToolbar: {
      toolbar: document.getElementById('secondaryToolbar'),
      toggleButton: document.getElementById('secondaryToolbarToggle'),
      presentationModeButton:
        document.getElementById('secondaryPresentationMode'),
      openFileButton: document.getElementById('secondaryOpenFile'),
      printButton: document.getElementById('secondaryPrint'),
      downloadButton: document.getElementById('secondaryDownload'),
      viewBookmarkButton: document.getElementById('secondaryViewBookmark'),
      firstPageButton: document.getElementById('firstPage'),
      lastPageButton: document.getElementById('lastPage'),
      pageRotateCwButton: document.getElementById('pageRotateCw'),
      pageRotateCcwButton: document.getElementById('pageRotateCcw'),
      toggleHandToolButton: document.getElementById('toggleHandTool'),
      viewNativeButton: document.getElementById('viewNative')
    },
    fullscreen: {
      contextFirstPage: document.getElementById('contextFirstPage'),
      contextLastPage: document.getElementById('contextLastPage'),
      contextPageRotateCw: document.getElementById('contextPageRotateCw'),
      contextPageRotateCcw: document.getElementById('contextPageRotateCcw'),
    },
    sidebar: {
      // Divs (and sidebar button)
      mainContainer: document.getElementById('mainContainer'),
      outerContainer: document.getElementById('outerContainer'),
      toggleButton: document.getElementById('sidebarToggle'),
      // Buttons
      thumbnailButton: document.getElementById('viewThumbnail'),
      outlineButton: document.getElementById('viewOutline'),
      attachmentsButton: document.getElementById('viewAttachments'),
      annotationsButton: document.getElementById('dbv-viewAnnotations'), 
      findButton: document.getElementById('dbv-viewFind'),
      editAnnotationsButton: document.getElementById('dbv-editAnnotations'), 
      infoButton: document.getElementById('dbv-info'), 
      // Views
      thumbnailView: document.getElementById('thumbnailView'),
      outlineView: document.getElementById('outlineView'),
      attachmentsView: document.getElementById('attachmentsView'),
      annotationsView: document.getElementById('dbv-annotationsView'),
      findView: document.getElementById('dbv-findView'),
      editAnnotationsView: document.getElementById('dbv-editAnnotationsView'),
      infoView: document.getElementById('dbv-infoView'),
    },
    findBar: {
      bar: document.getElementById('findbar'),
      toggleButton: document.getElementById('viewFind'),
      findField: document.getElementById('findInput'),
      phraseSearchCheckbox: document.getElementById('findPhraseSearch'),
      caseSensitiveCheckbox: document.getElementById('findMatchCase'),
      regexCheckbox: document.getElementById('findRegex'),
      findMsg: document.getElementById('findMsg'),
      findResultsCount: document.getElementById('findResultsCount'),
      findStatusIcon: document.getElementById('findStatusIcon'),
      findPreviousButton: document.getElementById('findPrevious'),
      findNextButton: document.getElementById('findNext'),
      findDeleteButton: document.getElementById('findDelete')
    },
    passwordOverlay: {
      overlayName: 'passwordOverlay',
      container: document.getElementById('passwordOverlay'),
      label: document.getElementById('passwordText'),
      input: document.getElementById('password'),
      submitButton: document.getElementById('passwordSubmit'),
      cancelButton: document.getElementById('passwordCancel')
    },
    documentProperties: {
      fields: {
        'fileName': document.getElementById('fileNameField'),
        'fileSize': document.getElementById('fileSizeField'),
        'title': document.getElementById('titleField'),
        'author': document.getElementById('authorField'),
        'subject': document.getElementById('subjectField'),
        'keywords': document.getElementById('keywordsField'),
        'creationDate': document.getElementById('creationDateField'),
        'modificationDate': document.getElementById('modificationDateField'),
        'creator': document.getElementById('creatorField'),
        'producer': document.getElementById('producerField'),
        'version': document.getElementById('versionField'),
        'pageCount': document.getElementById('pageCountField'),
        'daiPubId': document.getElementById('daiPubIdField'),
        'zenonId': document.getElementById('zenonIdField'),
        'description': document.getElementById('descriptionField')
      }
    },
    errorWrapper: {
      container: document.getElementById('errorWrapper'),
      errorMessage: document.getElementById('errorMessage'),
      closeButton: document.getElementById('errorClose'),
      errorMoreInfo: document.getElementById('errorMoreInfo'),
      moreInfoButton: document.getElementById('errorShowMore'),
      lessInfoButton: document.getElementById('errorShowLess'),
    },
    dbvInfo: {
    	annoInfoTable: document.getElementById('dbv-info-annoInfoTable'),
    	dlAnnotationsJson: document.getElementById('dbv-info-dlAnnotationsJson'),
    	dlAnnotationsPdf: document.getElementById('dbv-info-dlAnnotationsPdf'),
    	openAnnotationsFile: document.getElementById('dbv-info-loadAnnotationFile'),
    	version: document.getElementById('dbv-info-version'),
    	pdfjsVersion: document.getElementById('dbv-info-pdfjsVersion'),
    	/*blockAnnotationInfo: document.getElementById('dbv-av-block-annotation_info'),
    	blockProductInfo: document.getElementById('dbv-av-block-product_info'),
    	blockFileInfo: document.getElementById('dbv-av-block-file_info')*/
    },
    printContainer: document.getElementById('printContainer'),
    openFileInputName: 'fileInput',
    debuggerScriptPath: './debugger.js',
    intextPopup: document.getElementById('intext-popup'),
    intextPopupInner: document.getElementById('intext-popup-inner')
  };
}

function webViewerLoad() {
  var config = getViewerConfiguration();
//#if !PRODUCTION
  require.config({
	  paths: {
		 'pdfjs': '../pdf.js/src',
		 'pdfjs-dbv': '.'
	  }
  });
  require(['pdfjs-dbv/app', 'mozPrintCallback_polyfill.js'], function (web) {
    window.PDFViewerApplication = web.PDFViewerApplication;
    web.PDFViewerApplication.run(config);
  });
//#else
//window.PDFViewerApplication = pdfjsWebLibs.pdfjsWebApp.PDFViewerApplication;
//pdfjsWebLibs.pdfjsWebApp.PDFViewerApplication.run(config);
//#endif
}

document.addEventListener('DOMContentLoaded', webViewerLoad, true);
