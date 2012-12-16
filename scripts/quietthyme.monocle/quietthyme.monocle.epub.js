// @reference jszip.js

var QT = QT || {};

QT.bookdata = (function(qt){
    
    //////////////////////////////////////////////////////////////////////////
    // Private Data
    //////////////////////////////////////////////////////////////////////////
    var EVENT ={};
    EVENT.LOADING = 'EVENT_LOADING';
    EVENT.BOOKDATA_READY = 'EVENT_BOOKDATA_READY';
    
    
    var MSG = {};
    MSG.LOADING_FILE = 'Loading file from url';
    MSG.UNZIPPING = 'Unzipping';
    MSG.UNCOMPRESSING = 'Uncompressing file: ';
    MSG.READING_OPF = 'Reading OPF';
    MSG.POST_PROCESSING = 'Post processing';
    MSG.FINISHED = 'Finished!';
    MSG.FINISHED_POST_PROCESSING = 'FINISHED_POST_PROCESSING';
    
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
    var _epubVersion;
    var _ncx;
    var _oebpsDir = '';
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
        //try{
            publish(EVENT.LOADING, STATE.OK,MSG.UNZIPPING);
            _unzipper = new JSZip();
            _unzipper.load(data, {
                base64 : false
            });
            
            console.log(_unzipper);
            console.log(_unzipper.files, typeof(_unzipper.files));
            
            _compressedFiles=[];
            for(var key in _unzipper.files){
                var item = _unzipper.files[key];
                if(item){
                    _compressedFiles.push(item);
                }
            }
            
            uncompressNextCompressedFile()
            
        //}
        //catch(ex){
            //console.log(ex);
            publish(EVENT.LOADING, STATE.ERR,MSG.ERR_NOT_ZIP);
        //}
	}
    
    function uncompressNextCompressedFile() {
        var compressedFile = _compressedFiles.shift();
        if (compressedFile) {
            publish(EVENT.LOADING, STATE.OK, MSG.UNCOMPRESSING + compressedFile.name);
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
            publish(EVENT.LOADING, STATE.OK, MSG.READING_OPF);
            _opfPath = getOpfPathFromContainer();
            
            // Get the OEPBS dir, if there is one
            if (_opfPath.indexOf('/') != -1) {
                _oebpsDir =  _opfPath.substr(0, _opfPath.lastIndexOf('/'));
            }
            
            readOpf(_files[_opfPath]);

            publish(EVENT.LOADING, STATE.OK, MSG.POST_PROCESSING);
            postProcess();
            publish(EVENT.LOADING, STATE.OK, MSG.FINISHED);
    }

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
        
        var ncxFile = '';
        for (var i = 0, il = manifestEntries.length; i < il; i++) {
            var node = manifestEntries[i];
            var id = node.getAttribute("id");
            var href= node.getAttribute("href");
            
            if (href.indexOf('.ncx') != -1
    					|| id.toLowerCase() === 'toc') {
				ncxFile = href;
			}
            
            opf.manifest[id] = {
                "href": resolvePath(node.getAttribute("href"), _opfPath),
                "media-type": node.getAttribute("media-type")
            }
        }

        var spineEntries = doc
            .getElementsByTagName("spine")[0]
            .getElementsByTagName("itemref");

        for (var i = 0, il = spineEntries.length; i < il; i++) {
            var node = spineEntries[i];
            opf.spine.push((_oebpsDir ? _oebpsDir+ '/' : '') + node.getAttribute("idref"));
        }

        _opf = opf;
        
        
        console.log(doc);
        _epubVersion = parseInt(doc.getElementsByTagName("package")[0].getAttribute("version"), 10);
        if(ncxFile){
            _ncx = readNcx(_files[ncxFile]);
        }
        
    }
    
    function readNcx(xml){
        var doc = xmlDocument(xml);
        
        var tocItems = [];
        
        

        // ePub 3 compatibility to parse toc.xhtml file
        if (_epubVersion === 3) {
            
            var navTopLevelEntries = doc
            .getElementsByTagName("nav");
            
            for (var i = 0, il = navTopLevelEntries.length; i < il; i++) {
                var node = navTopLevelEntries[i];
                if(node.getAttribute("type") != "toc" ){
                    continue;
                }
                
                
                var olElement = node.firstElementChild;
                
                for(var ii = 0, iil = olElement.childNodes.length; ii < iil; ii++) {
                    var liElement = olElement.childNodes[ii];
                    if(liElement.nodeName.toLowerCase() != "li"){
                        continue;
                    }
                    tocItems.push(recursive3NcxParser(liElement));
                }
                
//                if(oebps_dir){
//                    link = oebps_dir + '/' + $(this).find(content_tag).attr('src');
//            	}
//				else{
//					link = $(this).find(content_tag).attr('src');
//				}
            }
            
        }
        // ePub 2 compatibility to parse toc.ncx file
        //if (_epubVersion === 2) {
        else{
        
//            // Some ebooks use navPoint while others use ns:navPoint tags
//            var nav_tag = 'ns\\:navPoint';
//            var content_tag = 'ns\\:content';
//            var text_tag = 'ns\\:text';
//		
//            if ($(f).find('ns\\:navPoint').length == 0) {
//                nav_tag = 'navPoint';
//                content_tag = 'content';
//                text_tag = 'text';
//            }
            var navPointTopLevelEntries = doc
            .getElementsByTagName("navMap")[0]
            .childNodes;
		
            
            for (var i = 0, il = navPointTopLevelEntries.length; i < il; i++) {
                var node = navPointTopLevelEntries[i];
                if(node.nodeName.toLowerCase() != "navpoint"){
                    continue;
                }
                
                tocItems.push(recursive2NcxParser(node));
                
                
//                if(oebps_dir){
//                    link = oebps_dir + '/' + $(this).find(content_tag).attr('src');
//        		}
//				else{
//					link = $(this).find(content_tag).attr('src');
//				}
            }
             
        }
        return tocItems;
    }
    
    function recursive2NcxParser(navPointElement){
        var navPointChildren = navPointElement.childNodes;
        
        var link = navPointElement.getElementsByTagName("content")[0].getAttribute("src");
        var title = navPointElement.getElementsByTagName("text")[0].text;
        
        var tocItem = new TocItem(title,link);
        
        for (var i = 0, il = navPointChildren.length; i < il; i++) {
            var childNavPoint = navPointChildren[i];
            if(childNavPoint.nodeName.toLowerCase() == "navpoint"){
                tocItem.children.push(recursive2NcxParser(childNavPoint));
            }
        }
        return tocItem;
    }
    
    function recursive3NcxParser(liElement){
        var liChildren = liElement.childNodes;
        
        var tocItem = new TocItem('placeholder title','');
        for (var i = 0, il = liChildren.length; i < il; i++) {
            var childElement = liChildren[i];
            if(childElement.nodeName.toLowerCase() == "a" || childElement.nodeName.toLowerCase() == "span"){
                
                var link = childElement.getAttribute("href");
                var title = childElement.text;
                
                tocItem.title =title;
                tocItem.src = link;
            }
            if(childElement.nodeName.toLowerCase() == "ol"){
                var olChildren = childElement.children;
                for(var ii = 0, iil = liChildren.length; ii < iil; ii++) {
                    var olChild = olChildren[ii];
                    tocItem.children.push(recursive3NcxParser(olChild));                  
                }
            }
        }
        
        return tocItem;
        
    }
    
    
    function TocItem(title, src){
        this.title = title;
        this.src = src;
        this.children = [];
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
        publish(EVENT.LOADING,STATE.OK,MSG.FINISHED_POST_PROCESSING);
        publish(EVENT.BOOKDATA_READY, this);
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
            publish(EVENT.LOADING, STATE.OK,MSG.LOADING_FILE);
            getBinaryFile(url,unzipBlob);
            
        }
        else{
            publish(EVENT.LOADING, STATE.ERR,MSG.ERR_BLANK_URL);
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
        
        var componentArr = [];
        for(var key in _opf.spine){
            var spineEntry = _opf.spine[key];
            componentArr.push(_opf.manifest[spineEntry].href);
        }
        
        console.log('getComponents',componentArr);
        return componentArr;
    }
    var getContents = function () {
        console.log('getContents',_ncx);
       return _ncx;
    }
    var getComponent = function (componentId, callback) {
        //todo: decide if it would be better/faster to unzip the file on demand. for now just display the unzipped file.
        console.log('getComponent',componentId,_files[componentId].documentElement.outerHTML);
        
        
        return _files[componentId].documentElement.outerHTML;
    }
    var getMetaData = function(key) {
        switch (key) {
            case "title":
                try{
                    return _opf.metadata['dc:title']._text;
                }
                catch(ex){
                    return '';
                }
                break;
            case "creator":
                try{
                    return _opf.metadata['dc:creator']._text
                }
                catch(ex){
                    return '';
                }
                break;
        }
        return '';
            
    }
    
    return {
        init :  init,
        events : function(){return EVENT;},
        
        unzipper:           function(){return _unzipper;},
        compressedFiles:    function(){return _compressedFiles;},
        files:              function(){return _files;},
        opfPath:            function(){return _opfPath;},
        container:          function(){return _container;},
        mimetype:           function(){return _mimetype;},
        opf:                function(){return _opf;},
        ncx:                function(){return _ncx;},
        oebpsDir:           function(){return _oebpsDir;},
        publish:    publish,
        
        /*Monocle Book Data Interface Methods*/
        getComponents : getComponents,
        getContents : getContents,
        getComponent : getComponent,
        getMetaData : getMetaData
    }
        
    
})(QT)


