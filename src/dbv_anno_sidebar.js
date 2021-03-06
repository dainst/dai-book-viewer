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

	var mozL10n = uiUtils.mozL10n;
	
	/**
	 * @class
	 */
	var AnnoSidebar = (function AnnoSidebarClosure() {
		
		function AnnoSidebar(options) {
			this.container = options.container;
			this.parent = options.parent;
			

			this.blocks = {};
			this.messageBox = null;
		}
		
		AnnoSidebar.prototype = {
				

				
			/**
			 * 
			 * renders a block in the viewer's sidebar
			 * 
			 * 
			 * @param id -			<string>		id
			 * @param title 		<string>		headline @ TODO i10n
			 * @param minimizable 	<boolean> 		is minimizable
			 * @param minimized 	<boolean> 		is minimized from da beginning
			 * 
			 */
			block: function(id, title, depricated, minimizable, minimized, controls) {
				var block = document.getElementById('dbv-av-block-' + id);
				var blockctrl, blockbody,  blocktitle, blockfooter, blockh3;
				if (!block) {
					block = this.htmlElement('div', {'id': 'dbv-av-block-' + id, 'classes': ['dbv-av-block', 'panel', 'panel-default']});

					if (minimizable) {
						controls = controls ? controls : {};
						controls['hide'] = {eventListeners: {'click': ['toggleBlock', id]}, icon: 'eye'}
					}

					blocktitle	= this.htmlElement('div',{'classes': ["panel-heading", 'dbv-colors-' + id]});
					blockh3		= this.htmlElement('h3', {'classes': ['panel-title'], 'data': {'l10n-id': 'dbv-' + id + '-heading'}}, title);
					blockbody	= this.htmlElement('div', {'classes':["panel-body"]});
					blockfooter	= this.htmlElement('div', {'classes':["panel-footer"]});

					blocktitle.appendChild(blockh3);
					blockctrl 	= this.blockControls(controls, blocktitle);
					block.appendChild(blocktitle);
					block.appendChild(blockbody);
					block.appendChild(blockfooter);
					this.container.appendChild(block);
				} else {
					blockbody = block.querySelector('.panel-body');
					blocktitle = block.querySelector('.panel-heading');
					blockfooter = block.querySelector('.panel-footer');
					blockh3 = block.querySelector('.panel-heading h3')
					blockctrl = null;
				}
				
				if (minimized) {
					block.classList.add('dbv-hidden');
					if (blockctrl && (typeof blockctrl.hide !== "undefined")) {
						blockctrl.hide.classList.add('toggled');
					}
				}

				this.blocks[id] = {
					opened: !minimized,
					block: block,
					body: blockbody,
					headline: blockh3,
					header: blocktitle,
					footer: blockfooter,
					controls: blockctrl,
					add: function(attr, content, eventListeners) {return this.blockEntry(attr, content, eventListeners, id)}.bind(this),
					clear: function() {blockbody.textContent = ''}
				};
								
				return blockbody;
			},

			blockControls: function(ctrl, appendTo) {
				if ((typeof ctrl === "undefined")) {
					return this.htmlElement('span');
				}
				var controls = this.htmlElement('div', {'classes': ['dbv-av-block-controls', 'btn-group', 'splitToolbarButton']});
				var controlsCollection = {};
				var controlEl, control, hideClass, attr;
				for (var i in ctrl) {
					control = ctrl[i];
					hideClass = (typeof control.hide !== "undefined") ? 'dbv-av-block-controls-hide-' + control.hide : '';
					if ((typeof control.type === "undefined") || (control.type === 'button')) {
						controlEl = this.htmlElement(
							'button',
							{
								'classes': ['dbv-av-block-control', 'toolbarButton', 'glyphicon-' + control.icon, hideClass],
								'title': control.caption
							},
							null, //creates an empty textnode
							control.eventListeners
						);
					} else {
						attr = {
							'classes': ['toolbarField', hideClass]
						};
						if (typeof control.placeholder !== "undefined") {
							attr.placeholder = control.placeholder
						}
						controlEl = this.htmlInput(
							attr,
							control.caption,
							control.eventListeners,
							controls
						);
					}
					controls.appendChild(controlEl);
					controlsCollection[i] = controlEl;

				}
				appendTo.appendChild(controls);
				return controlsCollection;
			},
			
			blockEntry: function(captionText, badgeText, eventListeners, blockId) {
				var entry = this.htmlElement('div', {'classes': ['dbv-av-block-entry']});
				var caption = this.htmlElement('span', {'classes': ['dbv-av-block-entry-caption']}, captionText, eventListeners);
				entry.appendChild(caption);
				entry.appendChild(this.htmlElement('span', {'classes': ['badge', 'pull-right']}, badgeText));
		    	
		    	this.blocks[blockId].body.appendChild(entry);
			},
			
			
			/**
			 * message is a "block" in a different layout above the blocks
			 * 
			 */
			
			message: function(text, warning, autohide) {
				
				warning = (typeof warning === "undefined") ? false : warning;
				autohide = (typeof autohide === "undefined") ? true : autohide;
				
				//  generate message obj if not present
				if (this.messageBox === null) {
					this.messageBox = {};
					this.messageBox.box = this.htmlElement('div', {'classes': ["alert", "message-box"], "role": "alert"}, '', {'click': ['messageHide']});
					this.container.appendChild(this.messageBox.box);
					
					this.messageBox.glyphicon = this.htmlElement('span', {'classes': ["glyphicon"]});
					this.messageBox.box.appendChild(this.messageBox.glyphicon);
					
					this.messageBox.text = this.htmlElement('span');
					this.messageBox.box.appendChild(this.messageBox.text);
				}
				
				// update message object
				this.messageBox.text.dataset.l10nId = text;
				
				if (text !== '') {
					mozL10n.translate(this.messageBox.text); 
				}
				
				if (!warning) {
					this.messageBox.box.classList.remove("dbv-colors-error");	
					this.messageBox.glyphicon.className = "glyphicon glyphicon-info";
				} else { 
					this.messageBox.box.classList.add("dbv-colors-error");
					this.messageBox.glyphicon.className = "glyphicon glyphicon-alert";
				}
				
				if (autohide) {
					this.messageBox.timeout = setTimeout(function() {this.messageHide()}.bind(this), 50000);
				}

			},
			
			messageHide: function() {
				console.log('messageHide');
				if (this.messageBox === null) {
					return;
				}
				this.messageBox.box.classList.add('hiddenBox');
				this.messageBox.timeout = setTimeout(function() {this.messageRemove()}.bind(this), 1000);
			},
			
			messageRemove: function() {
				console.log('messageRemove');
				this.messageBox.box.parentNode.removeChild(this.messageBox.box);
				this.messageBox = null;
			},
			
			/**
			 * 
			 * click event
			 * @param e <event>
			 * @param id <blockID>
			 */
			toggleBlock: function(e, id) {
								
				e.stopPropagation();				
				
				this.blocks[id].opened = !this.blocks[id].opened; 
				
				if (this.blocks[id].opened) {
					this.blocks[id].block.classList.remove('dbv-hidden');
					this.blocks[id].controls.hide.classList.remove('toggled');
				} else {
					this.blocks[id].block.classList.add('dbv-hidden');
					this.blocks[id].controls.hide.classList.add('toggled');
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
			 *  special: for textboxes you can use "type" insetad of keyup...
			 * @return el the element
			 */
			htmlElement: function(type, attr, content, eventListeners) {
				var self = this;				
				var el = document.createElement(type);
				attr = attr || {};
				if (typeof attr.classes === "object" && typeof attr.classes.join === "function") {
					el.className = attr.classes.join(" ");
				}
				var skipAttrs = ['classes', 'data', 'style'];
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
				if (typeof attr.style !== "undefined") { // Edge would complain otherwise 
					el.setAttribute('style', attr.style);
				}

				if (typeof content !== "undefined") {
					content = (content === null) ? '\u00A0' : content;
					el.appendChild(document.createTextNode(content));
				}

				if (typeof eventListeners === "object") {
					var isActive = false;
					for (var event in eventListeners) {						
						var fun = (typeof eventListeners[event] === 'object') ? eventListeners[event][0] : eventListeners[event];
						var param = (typeof eventListeners[event] === 'object') ? eventListeners[event][1] : null;
						var timer = false;

						if (event == 'type') {
							event = 'keyup';
							timer = true;
						}

						el.addEventListener(event, function(e) {

							function doIt() {
								el._hasTimer = false;
								if (typeof self.parent[fun] === 'function') {
									return self.parent[fun](e, param);
								} else  if (typeof self[fun] === 'function') {
									return self[fun](e, param);
								} else {
									console.warn('function not found: ', fun);
								}
							}

							if (!el._hasTimer && timer) {
								el._hasTimer = true;
								setTimeout(doIt, 1000);
							} else if(!el._hasTimer) {
								doIt();
							}

						});
						isActive = true;
					}
					if (isActive) {
						el.classList.add('active');
					}
				}
				
				// translate				
				if ((typeof attr.data !== "undefined") && (typeof attr.data['l10n-id'] !== "undefined")) {
					mozL10n.translate(el); 
				}

				return el;
			},
			
			htmlInput: function(attr, label, eventListeners, appendTo) {
				var box = document.createDocumentFragment();				
				attr.id = attr.id || 'input.' + Math.random();				
				attr.type = attr.type || 'text';
				attr.data = attr.data || {};
				try {
					label = mozL10n.get(label, false, label);
				} catch(e) {}
				try {
					attr.placeholder = mozL10n.get(attr.placeholder , false, '');
				} catch(e) {}
				var label = this.htmlElement('label', {'classes':['a'], 'for': attr.id, 'data': attr.data}, label, eventListeners);
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
			},


			/**
			 * @private
			 */
			_addEventListeners: function annoViewer_addEventListeners() {
				this.eventBus.on('annotationEvent', function(e) {

					if (e.type == 'click') {
						this.clickAnnotation(e.annotation, e.target);
					}
					if (e.type == 'mouseover') {
						this.hoverAnnotation(e.annotation);
					}
				}.bind(this));

				this.eventBus.on('windowClicked', function(e) {
					this.hideInTextPopup();

				}.bind(this));

			}
			
		};
		
		return AnnoSidebar;
	})();
	
	exports.AnnoSidebar = AnnoSidebar;
}));