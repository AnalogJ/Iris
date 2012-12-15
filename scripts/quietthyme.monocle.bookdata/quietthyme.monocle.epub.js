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
    
    var unzipper;
    var compressedFiles;
    var files = {};
    var opfPath;
    var container;
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
            unzipper = new JSZip();
            unzipper.load(data, {
                base64 : false
            });
            
            console.log(unzipper);
            console.log(unzipper.files);
            compressedFiles= unzipper.files;
            uncompressNextCompressedFile()
            
        }
        catch(ex){
            publish(EVENT_LOADING, STATE.ERR,MSG.ERR_NOT_ZIP);
        }
	}
    
    function uncompressNextCompressedFile() {
        var compressedFile = compressedFiles.shift();
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
            opfPath = getOpfPathFromContainer();
            readOpf(files[opfPath]);

            publish(EVENT_LOADING, STATE.OK, MSG.POST_PROCESSING);
            postProcess();
            publish(EVENT_LOADING, STATE.OK, MSG.FINISHED);
        },

    function uncompressFile(compressedFile) {
        var data = compressedFile.data;

        if (compressedFile.name === "META-INF/container.xml") {
            this.container = data;
        } else if (compressedFile.fileName === "mimetype") {
            this.mimetype = data;
        } else {
            this.files[compressedFile.fileName] = data;
        }
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


