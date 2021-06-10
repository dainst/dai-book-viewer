# dai-book-viewer

##  building
    npm install
    mkdir build
    chmod -R 777 build
    npm run build

## Docker support

https://github.com/dainst/dai-book-viewer-docker

## Files

Files below `/src` seem to be a mixture of files from Mozillas pdf.js and this project.

In general:

* Files starting with `src/dbv_` are from this project, most of the rest are from Mozilla, but some have been modified by us.
* `src/pdf_find_controller.js` has been heavily modified (text search functionality to find annotations on a page.)
* `src/text_layer_builder.js` has been modified to display annotations.
