// @reference jszip.js

var QT = QT || {};

QT.bookdata = (function(qt){
    
    //////////////////////////////////////////////////////////////////////////
    // Private Data
    //////////////////////////////////////////////////////////////////////////
    var EVENT_LOADING = 'EVENT_LOADING';
    
    var MSG = {};
    MSG.LOADING_FILE = 'Loading file from url';
    MSG.UNZIPPING = 'Unzipping';
    MSG.UNCOMPRESSING = 'Uncompressing file: ';
    MSG.READING_OPF = 'Reading OPF';
    MSG.POST_PROCESSING = 'Post processing';
    MSG.FINISHED = 'Finished!';
    
    MSG.ERR_NOT_ZIP = 'File is not a proper Zip file';
    MSG.ERR_BLANK_URL = 'Zip url cannot be blank';
    
    var STATE = {};
    STATE.OK = 1;
    STATE.ERR = 2;
    
    var _unzipper;
    var _compressedFiles;
    var _files = {};
    var _opfPath;
    var _container;
    var _mimetype;
    var _opf;
    //////////////////////////////////////////////////////////////////////////
    // Private Methods
    //////////////////////////////////////////////////////////////////////////
    /**
     * Determines if browser is a version of IE that supports ActiveXObjects.
     */ 
    function useMSXHR() {
        return typeof ActiveXObject == "function";
    }
    /**
     * Retrieves the epub file from url,
     * @param {String} url The url for the epub file.
     * @param {Function} callback The callback that is executed once the epub file has been retrieved.
     */ 
    function getBinaryFile(url, callback) {
        var request = useMSXHR() ? new ActiveXObject("Msxml2.XmlHttp.6.0")
				: new XMLHttpRequest();
		request.onreadystatechange = function() {
			if (request.readyState == 1) {
				if (request.overrideMimeType) {
					request
							.overrideMimeType('text/plain; charset=x-user-defined');
				}
				request.send();
			}

			if (request.readyState == 4) {
				if (request.status == 200) {
					var data;
					if (useMSXHR()) {
						var data = new VBArray(request.responseBody).toArray();
						for ( var j = 0; j < data.length; ++j)
							data[j] = String.fromCharCode(data[j]);
						callback(data.join(''));
						request.abort();
					} else {
						callback(request.responseText);
					}
				} else {
					console.log('Failed to get file ' + url + '<br>');
				}
			}
		}
		request.open("GET", url, true);
	}
    
    /**
     * Retrieves the epub file from url, then begins the process of parsing it by retrievig the container.xml file.
     * @param {data} data contained inside the epub file.
     */
    function unzipBlob(data) {
        try{
            publish(EVENT_LOADING, STATE.OK,MSG.UNZIPPING);
            _unzipper = new JSZip();
            _unzipper.load(data, {
                base64 : false
            });
            
            console.log(_unzipper);
            console.log(_unzipper.files);
            _compressedFiles= _unzipper.files;
            uncompressNextCompressedFile()
            
        }
        catch(ex){
            publish(EVENT_LOADING, STATE.ERR,MSG.ERR_NOT_ZIP);
        }
	}
    
    function uncompressNextCompressedFile() {
        var compressedFile = _compressedFiles.shift();
        if (compressedFile) {
            publish(EVENT_LOADING, STATE.OK, MSG.UNCOMPRESSING + compressedFile.name);
            uncompressFile(compressedFile);
            withTimeout(uncompressNextCompressedFile);
        } else {
            didUncompressAllFiles();
        }
    };
        
    // For mockability
    function withTimeout(func) {
        var self = this;
        setTimeout(function () {
            func.call(self);
        }, 30);
    };

    function didUncompressAllFiles() {
            publish(EVENT_LOADING, STATE.OK, MSG.READING_OPF);
            _opfPath = getOpfPathFromContainer();
            readOpf(_files[_opfPath]);

            publish(EVENT_LOADING, STATE.OK, MSG.POST_PROCESSING);
            postProcess();
            publish(EVENT_LOADING, STATE.OK, MSG.FINISHED);
        },

    function uncompressFile(compressedFile) {
        var data = compressedFile.data;

        if (compressedFile.name === "META-INF/container.xml") {
            _container = data;
        } else if (compressedFile.name === "mimetype") {
            _mimetype = data;
        } else {
            _files[compressedFile.name] = data;
        }
    }
    
    
    function getOpfPathFromContainer() {
        var doc = xmlDocument(_container);
        return doc
            .getElementsByTagName("rootfile")[0]
            .getAttribute("full-path");
    }

    function readOpf(xml) {
        var doc = xmlDocument(xml);
            
        var opf = {
            metadata: {},
            manifest: {},
            spine: []
        };

        var metadataNodes = doc
            .getElementsByTagName("metadata")[0]
            .childNodes;

        for (var i = 0, il = metadataNodes.length; i < il; i++) {
            var node = metadataNodes[i];
            // Skip text nodes (whitespace)
            if (node.nodeType === 3) { 
                continue; 
            }

            var attrs = {};
            for (var i2 = 0, il2 = node.attributes.length; i2 < il2; i2++) {
                var attr = node.attributes[i2];
                attrs[attr.name] = attr.value;
            }
            attrs._text = node.textContent;
            opf.metadata[node.nodeName] = attrs;
        }

        var manifestEntries = doc
            .getElementsByTagName("manifest")[0]
            .getElementsByTagName("item");

        for (var i = 0, il = manifestEntries.length; i < il; i++) {
            var node = manifestEntries[i];

            opf.manifest[node.getAttribute("id")] = {
                "href": resolvePath(node.getAttribute("href"), _opfPath),
                "media-type": node.getAttribute("media-type")
            }
        }

        var spineEntries = doc
            .getElementsByTagName("spine")[0]
            .getElementsByTagName("itemref");

        for (var i = 0, il = spineEntries.length; i < il; i++) {
            var node = spineEntries[i];
            opf.spine.push(node.getAttribute("idref"));
        }

        _opf = opf;
    }

    function resolvePath(path, referrerLocation) {
        var pathDirs = path.split("/");
        var fileName = pathDirs.pop();

        var locationDirs = referrerLocation.split("/");
        locationDirs.pop();

        for (var i = 0, il = pathDirs.length; i < il; i++) {
            var spec = pathDirs[i];
            if (spec === "..") {
                locationDirs.pop();
            } else {
                locationDirs.push(spec);
            }
        }

        locationDirs.push(fileName);
        return locationDirs.join("/");
    }

    function findMediaTypeByHref(href) {
        for (var key in _opf.manifest) {
            var item = _opf.manifest[key];
            if (item["href"] === href) {
                return item["media-type"];
            }
        }

        // Best guess if it's not in the manifest. (Those bastards.)
        var match = href.match(/\.(\w+)$/);
        return match && "image/" + match[1];
    }

        // Will modify all HTML and CSS files in place.
    function postProcess() {
        for (var key in _opf.manifest) {
            var mediaType = _opf.manifest[key]["media-type"]
            var href = _opf.manifest[key]["href"]
            var result;

            if (mediaType === "text/css") {
                result = postProcessCSS(href);
            } else if (mediaType === "application/xhtml+xml") {
                result = postProcessHTML(href);
            }

            if (result !== undefined) {
                _files[href] = result;
            }
        }
    }
    
    
    function postProcessCSS(href) {
        var file = _files[href];
        var self = this;

        file = file.replace(/url\((.*?)\)/gi, function (str, url) {
            if (/^data/i.test(url)) {
                // Don't replace data strings
                return str;
            } else {
                var dataUri = self.getDataUri(url, href);
                return "url(" + dataUri + ")";
            }
        });

        return file;
    }

    function postProcessHTML(href) {
        var xml = decodeURIComponent(escape(_files[href]));
        var doc = xmlDocument(xml);

        var images = doc.getElementsByTagName("img");
        for (var i = 0, il = images.length; i < il; i++) {
            var image = images[i];
            var src = image.getAttribute("src");
            if (/^data/.test(src)) { 
                continue;
            }
            image.setAttribute("src", getDataUri(src, href))
        }

        var head = doc.getElementsByTagName("head")[0];
        var links = head.getElementsByTagName("link");
        for (var i = 0, il = links.length; i < il; i++) {
            var link = links[0];
            if (link.getAttribute("type") === "text/css") {
                var inlineStyle = document.createElement("style");
                inlineStyle.setAttribute("type", "text/css");
                inlineStyle.setAttribute("data-orig-href", link.getAttribute("href"));

                var css = _files[resolvePath(link.getAttribute("href"), href)];
                inlineStyle.appendChild(document.createTextNode(css));

                head.replaceChild(inlineStyle, link);
            }
        }

        return doc;
    }

    function getDataUri(url, href) {
        var dataHref = resolvePath(url, href);
        var mediaType = findMediaTypeByHref(dataHref);
        var encodedData = escape(_files[dataHref]);
        return "data:" + mediaType + "," + encodedData;
    }

    function validate() {
        if (_container === undefined) {
               throw new Error("META-INF/container.xml file not found.");
        }

        if (_mimetype === undefined) {
            throw new Error("Mimetype file not found.");
        }

        if (_mimetype !== "application/epub+zip") {
            throw new Error("Incorrect mimetype " + _mimetype);
        }
    }

        // for data URIs
    function escapeData(data) {
        return escape(data);
    }

    function xmlDocument(xml) {
        var doc = new DOMParser().parseFromString(xml, "text/xml");

        if (doc.childNodes[1] && doc.childNodes[1].nodeName === "parsererror") {
            throw doc.childNodes[1].childNodes[0].nodeValue;
        }

        return doc;
    }
    
    
    //////////////////////////////////////////////////////////////////////////
    // Public Methods
    //////////////////////////////////////////////////////////////////////////
    var init = function(url, options){
        
        if(url){
            publish(EVENT_LOADING, STATE.OK,MSG.LOADING_FILE);
            getBinaryFile(url,unzipBlob);
            
        }
        else{
            publish(EVENT_LOADING, STATE.ERR,MSG.ERR_BLANK_URL);
        }
        
        
    };
    
    //////////////////////////////////////////////////////////////////////////
    // Messaging Methods
    //////////////////////////////////////////////////////////////////////////
    
    function publish(event, state, message){
        $(window).trigger(event, [state, message]);
    }
    function subscribe(selector, event, handler){
        $(selector).bind(event, handler);
    }
    
    
    //////////////////////////////////////////////////////////////////////////
    // Monocle Book Data Interface Methods 
    // https://github.com/joseph/Monocle/wiki/Book-data-object
    //////////////////////////////////////////////////////////////////////////
    
    var getComponents = function () {
    
    }
    var getContents = function () {
       
    }
    var getComponent = function (componentId) {
    
    }
    var getMetaData = function(key) {
    
    }
    
    return {
        init : init,
        
        /*Monocle Book Data Interface Methods*/
        getComponents : getComponents,
        getContents : getContents,
        getComponent : getComponent,
        getMetaData : getMetaData
    }
        
    
})(QT)


