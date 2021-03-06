/* Copyright 2014 Mozilla Foundation
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
    define('pdfjs-dbv/annotation_layer_builder', ['exports',
      'pdfjs-dbv/ui_utils', 'pdfjs-dbv/pdf_link_service',
      'pdfjs-dbv/pdfjs'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./ui_utils.js'),
      require('./pdf_link_service.js'), require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebAnnotationLayerBuilder = {}), root.pdfjsWebUIUtils,
      root.pdfjsWebPDFLinkService, root.pdfjsWebPDFJS);
  }
}(this, function (exports, uiUtils, pdfLinkService, pdfjsLib) {

var mozL10n = uiUtils.mozL10n;
var SimpleLinkService = pdfLinkService.SimpleLinkService;

/**
 * @typedef {Object} AnnotationLayerBuilderOptions
 * @property {HTMLDivElement} pageDiv
 * @property {PDFPage} pdfPage
 * @property {IPDFLinkService} linkService
 * @property {DownloadManager} downloadManager
 */

/**
 * @class
 */
var AnnotationLayerBuilder = (function AnnotationLayerBuilderClosure() {
  /**
   * @param {AnnotationLayerBuilderOptions} options
   * @constructs AnnotationLayerBuilder
   */
  function AnnotationLayerBuilder(options) {
    this.pageDiv = options.pageDiv;
    this.pdfPage = options.pdfPage;
    this.linkService = options.linkService;
    this.downloadManager = options.downloadManager;

    this.div = null;
  }

  AnnotationLayerBuilder.prototype =
      /** @lends AnnotationLayerBuilder.prototype */ {

    /**
     * @param {PageViewport} viewport
     * @param {string} intent (default value is 'display')
     */
    render: function AnnotationLayerBuilder_render(viewport, intent) {
      var self = this;
      var parameters = {
        intent: (intent === undefined ? 'display' : intent),
      };

      this.pdfPage.getAnnotations(parameters).then(function (annotations) {
        viewport = viewport.clone({ dontFlip: true });
        parameters = {
          viewport: viewport,
          div: self.div,
          annotations: annotations,
          page: self.pdfPage,
          linkService: self.linkService,
          downloadManager: self.downloadManager
        };

        if (self.div) {
          // If an annotationLayer already exists, refresh its children's
          // transformation matrices.
          pdfjsLib.AnnotationLayer.update(parameters);
        } else {
          // Create an annotation layer div and render the annotations
          // if there is at least one annotation.
          if (annotations.length === 0) {
            return;
          }

          self.div = document.createElement('div');
          self.div.className = 'annotationLayer';
          self.pageDiv.appendChild(self.div);
          parameters.div = self.div;

          pdfjsLib.AnnotationLayer.render(parameters);
          //this.renderAnnotations(annotations); <- paf Baustelle

          if (typeof mozL10n !== 'undefined') {
            mozL10n.translate(self.div);
          }
        }
      }.bind(this));
    },

    renderAnnotations: function(annotations) {
      for (var i = 0; i < annotations.length; i++) {
        this.renderAnnotation(annotations[i]);
      }
    },

	  /**
       * test function by paf to test fo rendering of anntoations can be made better
	   * @param data
	   */
	  renderAnnotation: function(data) {
      console.log('RENDER!', data);
      var container = document.createElement('div');
      container.setAttribute('data-annotation-id', data.id);

      // Do *not* modify `data.rect`, since that will corrupt the annotation
      // position on subsequent calls to `_createContainer` (see issue 6804).
      var rect = Util.normalizeRect([
          data.rect[0],
          page.view[3] - data.rect[1] + page.view[1],
          data.rect[2],
          page.view[3] - data.rect[3] + page.view[1]
      ]);

      CustomStyle.setProp('transform', container, 'matrix(' + viewport.transform.join(',') + ')');
      CustomStyle.setProp('transformOrigin', container, -rect[0] + 'px ' + -rect[1] + 'px');
      container.appendChild(
		  document.createTextNode('HALLO')
      );

      this.div.appendChild(conatiner);
    },


    hide: function AnnotationLayerBuilder_hide() {
      if (!this.div) {
        return;
      }
      this.div.setAttribute('hidden', 'true');
    }
  };

  return AnnotationLayerBuilder;
})();

/**
 * @constructor
 * @implements IPDFAnnotationLayerFactory
 */
function DefaultAnnotationLayerFactory() {}
DefaultAnnotationLayerFactory.prototype = {
  /**
   * @param {HTMLDivElement} pageDiv
   * @param {PDFPage} pdfPage
   * @returns {AnnotationLayerBuilder}
   */
  createAnnotationLayerBuilder: function (pageDiv, pdfPage) {
    return new AnnotationLayerBuilder({
      pageDiv: pageDiv,
      pdfPage: pdfPage,
      linkService: new SimpleLinkService(),
    });
  }
};

exports.AnnotationLayerBuilder = AnnotationLayerBuilder;
exports.DefaultAnnotationLayerFactory = DefaultAnnotationLayerFactory;
}));
