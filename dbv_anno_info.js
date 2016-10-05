'use strict';
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbv_anno_info', ['exports', 'pdfjs-dbv/pdfjs'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'));
  } else {
    factory((root.pdfjsWebAnnoInfo = {}), root.pdfjsWebPDFJS);
  }
}(this, function (exports, pdfjsLib) {

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
		}
	
		AnnoInfo.prototype = {
				
			load: function() {
				this.showInfoFile();				
				this.showInfoProduct();				
				this.annoRegistry.onGetAnnotations(function showInfoAnnotations(data){return this.showInfoAnnotations(data)}.bind(this));
				this.elements.dlAnnotationsJson.addEventListener('click', this.dlAnnotationsJson.bind(this));
				this.elements.openAnnotationsFile.addEventListener('click', this.openAnnotationsFile.bind(this));
				this.elements.dlAnnotationsJson.classList.add('MORCHEEBA');
			},
		
			showInfoProduct: function() {
				this.elements.version.textContent = this.version.dbv;
				this.elements.pdfjsVersion.textContent = this.version.pdfjs;
			},
			
			showInfoAnnotations: function() {					
				this.elements.annoInfoTable.innerHTML = '';				
				for (var row in this.annoRegistry.metadata) {
					this.elements.annoInfoTable.appendChild(this.$.htmlTableRow([row, this.annoRegistry.metadata[row]]));	
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
			}
		
		}


		return AnnoInfo;
	})();

	exports.AnnoInfo = AnnoInfo;
}));