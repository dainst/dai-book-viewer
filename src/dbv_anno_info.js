'use strict';
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbv_anno_info', ['exports', 'pdfjs-dbv/pdfjs', 'pdfjs-dbv/ui_utils'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'), require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebAnnoInfo = {}), root.pdfjsWebPDFJS, root.pdfjsWebUIUtils);
  }
}(this, function (exports, pdfjsLib, uiUtils) {

	var mozL10n = uiUtils.mozL10n;
	
	var AnnoInfo = (function AnnoInfoClosure() {
	
		function AnnoInfo(options) {
			this.annoRegistry = options.annoRegistry;
			this.pdfDocumentProperties = options.pdfDocumentProperties;
			this.$ = options.annoSidebar;
			this.$.parent = this;
			this.elements = options.elements;
			this.version = {
				"dbv": options.dbvVersion,
				"pdfjs": options.pdfjsVersion,
			}
			this.annoRegistry.onGetAnnotations(function annoInfoCheckAnnotationFeatures(e, x) {this.checkAnnotationFeatures(e, x)}.bind(this), function annoInfoCheckAnnotationFeatures(e, x) {this.checkAnnotationFeatures(e, x)}.bind(this));
		}
	
		AnnoInfo.prototype = {
				
			load: function() {
				this.showInfoFile();				
				this.showInfoProduct();				
				this.annoRegistry.onGetAnnotations(function showInfoAnnotations(data){return this.showInfoAnnotations(data)}.bind(this));
				this.elements.dlAnnotationsJson.addEventListener('click', this.dlAnnotationsJson.bind(this));
				this.elements.openAnnotationsFile.addEventListener('click', this.openAnnotationsFile.bind(this));
				this.$.block('annotation_info');
			},
		
			showInfoProduct: function() {
				this.elements.version.textContent = this.version.dbv;
				this.elements.pdfjsVersion.textContent = this.version.pdfjs;
			},
			
			showInfoAnnotations: function() {					
				this.elements.annoInfoTable.innerHTML = '';				
				for (var row in this.annoRegistry.metadata) {
					var name = mozL10n.get(row, false, row);
					this.elements.annoInfoTable.appendChild(this.$.htmlTableRow([name + ':', this.annoRegistry.metadata[row]]));	
				}
					
			},
			
			showInfoFile: function() {
				this.pdfDocumentProperties.refresh();
			},
			
			dlAnnotationsJson: function() {
				
				var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.annoRegistry.dump()));
				var dlAnchorElem = document.createElement('a');
				dlAnchorElem.setAttribute("href",     dataStr     );
				dlAnchorElem.setAttribute("download", "annotations_" + this.annoRegistry.filename  + ".json");
				this.$.container.appendChild(dlAnchorElem);
				dlAnchorElem.click();
				console.log(dlAnchorElem);
			},
			
			openAnnotationsFile: function() {
				console.log("load annotations");
				this.annoRegistry.getFromLocalFile();
			},
			
			checkAnnotationFeatures: function() {
				if (this.annoRegistry.count() == 0) {
					this.$.blocks.annotation_info.block.classList.add('dbv-noAnnotations');
				} else {
					this.$.blocks.annotation_info.block.classList.remove('dbv-noAnnotations');
				}
				

			}
		
		}


		return AnnoInfo;
	})();

	exports.AnnoInfo = AnnoInfo;
}));