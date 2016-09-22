'use strict';
/**
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * @param root
 * @param factory
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define('pdfjs-dbv/dbv_anno_sidebar', ['exports', 'pdfjs-dbv/pdfjs', 'pdfjs-dbv/ui_utils'], factory);
  } else if (typeof exports !== 'undefined') {
    factory(exports, require('./pdfjs.js'), require('./ui_utils.js'));
  } else {
    factory((root.pdfjsWebAnnoSidebar = {}), root.pdfjsWebPDFJS, root.pdfjsWebUIUtils);
  }
}(this, function (exports, pdfjsLib, uiUtils) {

	/**
	 * @class
	 */
	var AnnoSidebar = (function AnnoSidebarClosure() {
		
		function AnnoSidebar(options) {
			this.container = options.container;
			this.parent = options.parent;
		}
		
		AnnoSidebar.prototype = {
				
			/* registry for content blocks in the sidebar */
			blocks: {}, 
				
			/**
			 * 
			 * renders a block in the viewer's sidebar
			 * 
			 * 
			 * @param id -			<string>		id
			 * @param title 		<string>		headline @ TODO i10n
			 * @param glyphicon 	<string> 		icon code
			 * @param minimizable 	<boolean> 		is minimizable
			 * 
			 */
			block: function(id, title, glyphicon, minimizable) {
				var self = this;
				
				var block = document.getElementById('dbv-av-block-' + id);
				if (block) {
					block.innerHTML = '';
				} else {
					block		= this.htmlElement('div', {'id': 'dbv-av-block-' + id, 'classes': ['dbv-av-block', 'panel', 'panel-default']});
					this.container.appendChild(block);
				}
				
				var blocktitle	= this.htmlElement('div',{'classes': ["panel-heading"]});
				var blockh3		= this.htmlElement('h3', {'classes': ['panel-title', 'dbv-colors-' + id]}, title, minimizable  ? {'click': ['toggleBlock', id]} : {});
				var icon		= this.htmlElement('span', {'classes': ['glyphicon', 'glyphicon-' + glyphicon, 'pull-right']});
				var blockbody	= this.htmlElement('div', {'classes':["panel-body"]});
				
				blockh3.appendChild(icon);
				blocktitle.appendChild(blockh3);
				block.appendChild(blocktitle);
				block.appendChild(blockbody);
				
				this.blocks[id] = {
					opened: true,
					block: block
				}
				
				return blockbody;
				
			},
			
			/**
			 * 
			 * click event: click "load more button"
			 * @param e
			 * @param id
			 */
			toggleBlock: function(e, id) {
				e.stopPropagation();				
				
				this.blocks[id].opened = !this.blocks[id].opened; 
				
				if (this.blocks[id].opened) {
					this.blocks[id].block.classList.remove('dbv-hidden');	
				} else {
					this.blocks[id].block.classList.add('dbv-hidden');
				}

			},
				
			/* errör */
			
			displayError: function(e) {
				this.block('error', 'Error getting Annotations', 'alert', {'items': e})
				.appendChild(this.htmlElement('p', {'classes': ['alert', 'alert-danger']}, e));
			},
			
			
			/**
			 * This creates an HTML element
			 * @param type
			 * @param attributes - can have the following parts: 
			 * 	classes 	[<string>, <string>, ...]
			 * 	id			<string>
			 * 	href		<string>
			 * 	alt			<string>
			 * 	src			<string>
			 *  target		<string>
			 *  style 		<string>
			 *  data 		{<key>: <value>, <key2>: <value2>, ...}
			 * @param content - creates a textnode inside
			 * @param eventListeners - obejct in the form: {
			 *  {<eventname>: [<functionname>, <parameter>] (functionname = method of this class)
			 * @return el the element
			 */
			htmlElement: function(type, attr, content, eventListeners) {
				var self = this;				
				var el = document.createElement(type);
				attr = attr || {};
				if (typeof attr.classes === "object" && typeof attr.classes.join === "function") {
					el.className = attr.classes.join(" ");
				}
				var skipAttrs = ['classes', 'data'];
				var transAttrs = {'class': 'className', 'for': 'htmlFor'};
				for (var key in attr) {
					if (skipAttrs.indexOf(key) !== -1) {
						continue;
					}
					
					if (typeof transAttrs[key] !== "undefined") {
						el[transAttrs[key]] = attr[key];
					} else {
						el[key] = attr[key];
					}
				}
				for (var key in attr.data) {
					el.setAttribute('data-' + key, attr.data[key]);
				} 
				if (typeof content !== "undefined") {
					el.appendChild(document.createTextNode(content));
				}

				if (typeof eventListeners === "object") {
					var isActive = false;
					for (var event in eventListeners) {						
						var fun = (typeof eventListeners[event] === 'object') ? eventListeners[event][0] : eventListeners[event];
						var param = (typeof eventListeners[event] === 'object') ? eventListeners[event][1] : null;
						if (typeof self.parent[fun] === 'function') {
							el.addEventListener(event, function(e) {							
								return self.parent[fun](e, param);
							});
							isActive = true;
						} else  if (typeof self[fun] === 'function') {
							el.addEventListener(event, function(e) {							
								return self[fun](e, param);
							});	
							isActive = true;
						} else {
							console.log('function not found: ', fun);
						}
					}
					if (isActive) {
						el.classList.add('active');
					}
				}
				return el;
			},
			
			htmlInput: function(attr, label, eventListeners, appendTo) {
				var box = document.createDocumentFragment();				
				attr.id = attr.id || 'input.' + Math.random();				
				attr.type = attr.type || 'text';
				attr.data = attr.data || {};
				var label = this.htmlElement('label', {'classes':['a'], 'for': attr.id, 'data': attr.data}, label, eventListeners); //@ TODO l10n
				var input = this.htmlElement('input', attr, '', eventListeners);	
				
				if ((attr.type == 'checkbox') || (attr.type == 'radio')) {
					box.appendChild(input);
					box.appendChild(label);
				} else {
					box.appendChild(label);
					box.appendChild(input);					
				}
				
				if (typeof appendTo !== "undefined") {
					appendTo.appendChild(box);
					return input;
				} else {
					return box;
				}
				
				
			},
			
			htmlTableRow: function(content, rowdata, coldata, appendTo) {
				
				if (typeof content !== "object") {
					return;
				}
								
				var tr = this.htmlElement('tr', rowdata);
				
				for (var i = 0; i < content.length; i++) {
					tr.appendChild(this.htmlElement('td', coldata, content[i]));
				}
				
				if (typeof appendTo !== "undefined") {
					appendTo.appendChild(tr);
				} 
				
				return tr;
			},
			
			clear: function() {
				this.container.innerHTML = '';
				this.blocks = {};
			}
			
		};
		
		return AnnoSidebar;
	})();
	
	exports.AnnoSidebar = AnnoSidebar;
}));