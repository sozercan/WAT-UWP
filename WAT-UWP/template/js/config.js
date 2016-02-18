(function (WAT) {
    "use strict";

    // Public API
    var self = {
        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            if (moduleStarted) {
                logger.warn("[config] Module already started; skipping...")
                return;
            }

            moduleStarted = true;
            logger.log("[config] Starting module...");
        },

        loadConfigAsync: function (configText) {
            // Parse config.json string
            var parsedConfig = JSON.parse(configText)

            var configuration = {
                config: parsedConfig,
                isWebApplicationManifest: false,
                schema: null,
            };

            return WinJS.Promise.as(configuration)
            // Check whether the content is a Web App Manifest
            .then(function (configuration) {
                configuration.isWebApplicationManifest = isWebApplicationManifest(configuration.config);

                if (configuration.isWebApplicationManifest) {
                    if (configuration.config["$schema"]) {
                        var filename = "ms-appx://" + configuration.config["$schema"];
                        var uri = new Windows.Foundation.Uri(filename);
                        return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri)
                            .then(function (file) { return Windows.Storage.FileIO.readTextAsync(file); })
                            .then(function (text) { return WinJS.Promise.as(JSON.parse(text)); })
                            .then(function (manifest) {
                               
                                // It seems that the validate method is changing the manifest being passed, 
                                // so this is to ensurethat we are doing a copy by value instead of by ref.
                                configuration.schema = JSON.parse(JSON.stringify(manifest));
                               
                                var result = tv4.validate(configuration.config, manifest);

                                if (!result) {
                                    logger.error(JSON.stringify(tv4.error, null, 4));

                                    throw tv4.error;
                                }

                                return WinJS.Promise.as(configuration);
                            })
                    }
                }

                return WinJS.Promise.as(configuration);
            })
            // Apply default values configured in the manifest schema
            .then(function (configuration) { return configuration.isWebApplicationManifest ? 
                applyWebApplicationManifestDefaultValuesAsync(configuration):
                WinJS.Promise.as(configuration); })
            // Translate Web App Manifest into old plain config object
            .then(function (configuration) { return configuration.isWebApplicationManifest ? 
                WinJS.Promise.as(translateWebApplicationManifest(configuration)) :
                WinJS.Promise.as(configuration);
            })
            // Assign parsed config to global WAT.config property
            .then(function (configuration) { return WinJS.Promise.as(WAT.config = configuration.newConfig); })
            // Look for current culture config and translate localizable settings
            .then(function (configuration) { return loadLanguageConfigAsync(); })
            .done(
                function () { WAT.startHandler(); },
                function (err) { configErrorHandler(err, 1); }
             );
        },

        loadFilesConfigAsync: function(filesUri) {            
            //try to get files.json and use config.json if it does not exists
            Windows.Storage.StorageFile.getFileFromApplicationUriAsync(filesUri)
                .done(
                    filesConfigLoadHandler,
                    function (err) {
                        var configFileUri = new Windows.Foundation.Uri(WAT.options.configFile);
                        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(configFileUri)
                            .done(
                                filesConfigLoadHandler,
                                function (err) { configErrorHandler(err, 1); }
                            );
                    }
                );
        }
    },

        // Private variable declarations
        logger,
        utilities,
        moduleStarted = false,
        otherVar,

        // Private methods
        isWebApplicationManifest = function (config, ignoreStartUrl) {
            if (config && (config.hasOwnProperty("start_url") || ignoreStartUrl)) {
                for (var prop in config) {
                    if (!isWebApplicationManifestProperty(prop)) {
                        throw new WinJS.ErrorFromName('Invalid configuration structure', '');
                    }
                }

                return true;
            }

            return false;
        },

        isWebApplicationManifestProperty = function (property) {
            var validProperties = ["start_url", "name", "short_name", "orientation", "display", "icons", "$schema"];

            return property.indexOf("wat_") > -1 || validProperties.filter(function (item) { return item === property; }).length !== 0;
        },

        translateWebApplicationManifest = function (configuration) {
            var newConfig = {};

            for (var prop in configuration.config) {
                if (prop.indexOf("wat_") > -1) {
                    newConfig[prop.replace("wat_", "")] = configuration.config[prop];
                }
            }

            if (typeof configuration.config.start_url === 'string') {
                newConfig.homeURL = configuration.config.start_url.trim();

                if (WAT.filesConfig.configJsonUri) {
                    var parser = document.createElement("a");
                    parser.href = newConfig.homeURL;

                    if (!/https?/.test(parser.protocol)) {
                        // the start_url is a relative path so we need to add the hostname 
                        parser = document.createElement("a");
                        parser.href = WAT.filesConfig.configJsonUri;
                        var port = parser.port ? ':' + parser.port : '';
                        if ((newConfig.homeURL.indexOf('/') !== 0) && (newConfig.homeURL.indexOf('\\') !== 0)) {
                            newConfig.homeURL = parser.protocol + '//' + parser.hostname + port + '/' + newConfig.homeURL;
                        } else {
                            newConfig.homeURL = parser.protocol + '//' + parser.hostname + port + newConfig.homeURL;
                        }
                    }
                }
            }

            if (typeof configuration.config.name === 'string') {
                newConfig.displayName = configuration.config.name.trim();
            }

            if (typeof configuration.config.orientation === 'string') {
                newConfig.orientation = configuration.config.orientation.trim();
            }

            configuration.newConfig = newConfig;

            return configuration;
        },

        applyWebApplicationManifestDefaultValuesAsync = function (configuration) {
            if (configuration.schema) {
                return applyConfigDefaultValuesHandlerAsync(configuration);
            } else {
                return WinJS.Promise.wrap(configuration);
            }
        },

        // Uses recursive method to apply default values to config object
        applyConfigDefaultValuesHandlerAsync = function (configuration) {
            if (configuration.schema.properties) {
                updateDefaultProperty(configuration.schema, configuration.schema.properties, configuration.config);
            }

            return WinJS.Promise.wrap(configuration);
        },

        // Recursively applies default values into a target object
        updateDefaultProperty = function (manifest, sourceObject, targetObject) {

            // Check for source and target objects. This condition stops recursion
            if (sourceObject && targetObject) {
                for (var propertyName in sourceObject) {
                    var property = getManifestProperty(manifest, sourceObject[propertyName]);
                    if (property) {
                        if (property.default && !targetObject.hasOwnProperty(propertyName)) {
                            targetObject[propertyName] = property.default;
                        }

                        // Recursively update objects. In Manifest all props are included in the properties array
                        updateDefaultProperty(manifest, property.properties, targetObject[propertyName]);
                    }
                }
            }
        },

        // Retrieves the referenced manifest property from declarations or the property itself if no referenced property
        getManifestProperty = function (manifest, property) {
            if (property["$ref"]) {
                // $ref property in the form "#/declarations/property
                var sections = property["$ref"].split("/");
                for (var i in sections) {
                    if (sections[i] == "#") property = manifest;
                    else property = property[sections[i]];
                }
            }

            return property;
        },

        loadLanguageConfigAsync = function () {
            return utilities.findLanguageFileAsync(WAT.options.configFile)
                .then(function (langFile) {
                    if (langFile != WAT.options.configFile) {
                        var langUri = new Windows.Foundation.Uri(langFile);
                        return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(langUri)
                            .then(
                                updateConfigHandlerAsync,
                                function (err) {
                                    throw "Cannot open localized config file: " + langFile;
                                });
                    }
                });
        },

        updateConfigHandlerAsync = function (file) {
            return Windows.Storage.FileIO.readTextAsync(file)
                .then(
                    function (configText) {
                        if (configText === 'undefined') {
                            return;
                        }
                        try {
                            var parsedConfig = JSON.parse(configText);

                            var configuration = {
                                config: parsedConfig
                            };

                            if (isWebApplicationManifest(parsedConfig,true)) {
                                configuration = translateWebApplicationManifest(configuration);
                            }

                            updateObject(WAT.config, configuration.newConfig);
                        } catch (err) {
                            throw "error updating localized configuration: " + err.message;
                        }
                    });
        },

        updateObject = function (target, source) {
            for (var property in source) {
                if (target.hasOwnProperty(property)) {
                    updateProperty(target, source, property);
                }
            }
        },

        updateProperty = function (target, source, propName) {
            if (typeof source[propName] === 'array') {
                for (var i = 0; i < source[propName]; i++) {
                    updateProperty(target[propName][i], source[propName][i]);
                }
            }
            else if (typeof source[propName] === 'object') {
                updateObject(target[propName], source[propName]);
            }
            else {
                target[propName] = source[propName];
            }
        },

        filesConfigLoadHandler = function (filesConfigFile) {
            var cachedFilePath = "ms-appdata:///local/config.json";
            Windows.Storage.FileIO.readTextAsync(filesConfigFile)
                .then(getFilesConfigAsync)
                .then(function () {
                    if (WAT.filesConfig.configJsonUri != "" && WAT.filesConfig.configJsonUri !== undefined) {
                        //cache the hosted file locally
                        return WAT.cacheHostedFileAsync(WAT.filesConfig.configJsonUri, "config.json")
                    }
                }, function (err) { configErrorHandler(err, 1); })
                .then(function () {
                    if (WAT.filesConfig.configJsonUri != "" && WAT.filesConfig.configJsonUri != undefined) {
                        //verify that the file was cached
                        return WAT.isFileCachedAsync(cachedFilePath);
                    }
                }, function (err) { configErrorHandler(err, 1); })
                .then(function (isValidFile) {
                    if (isValidFile)
                        //update the WAT configFile to look at teh local data path rather than app package
                        WAT.options.configFile = cachedFilePath;
                    return;
                }, function (err) { configErrorHandler(err, 1); })
                .done(
                    loadConfigAsync,
                    function (err) { configErrorHandler(err, 1);
                });
        },

        loadConfigAsync = function () {
            //this is what was in the orginal WAT 1.1 which simply loads whatever config file is configuired in WAT.options.configFile. It could be the orginal app package one or a cached one in local data
            var uri = new Windows.Foundation.Uri(WAT.options.configFile);
            return loadManifestStylesAsync().then(function () {
                return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri)
                    .then(
                        configLoadHandler,
                        function (err) { configErrorHandler(err, 1);
                        }
                    );
            })
        },

        getFilesConfigAsync = function (configText) {
            return new WinJS.Promise(function (complete) {
                var savedHostURL = localStorage.getItem("savedHostURL") || 'no data';

                //parse the configText into the WAT object
                try {
                    WAT.filesConfig = (savedHostURL && savedHostURL !== 'no data') ? { configJsonUri: savedHostURL } : JSON.parse(configText);
                    complete();
                } catch (err) {
                    configErrorHandler(err.message, 3);
                    return;
                }
            });
        },

        configLoadHandler = function (file) {
            return Windows.Storage.FileIO.readTextAsync(file)
                .then(
                    self.loadConfigAsync,
                    function (err) { configErrorHandler(err, 2); }
                );
        },

        loadManifestStylesAsync = function () {
            var uri = new Windows.Foundation.Uri("ms-appx:///AppxManifest.xml")
            return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(function (file) {
                return Windows.Data.Xml.Dom.XmlDocument.loadFromFileAsync(file).then(function (xml) {
                    WAT.styles = {};

                    var visualElements = xml.selectSingleNodeNS(
                        "/x:Package/x:Applications/x:Application/m2:VisualElements",
                        "xmlns:x='http://schemas.microsoft.com/appx/2010/manifest' xmlns:m2='http://schemas.microsoft.com/appx/2013/manifest'");

                    if (visualElements) {
                        var backgroundColor = visualElements.attributes.getNamedItem("BackgroundColor");
                        if (backgroundColor) {
                            WAT.styles.manifestBackgroundColor = backgroundColor.nodeValue;
                        }

                        var foregroundText = visualElements.attributes.getNamedItem("ForegroundText");
                        if (foregroundText) {
                            WAT.styles.manifestForegroundText = foregroundText.nodeValue;
                        }
                    }
                });
            });
        },

        configErrorHandler = function (err, i) {
            i = (i || 1);
            logger.error("Error while loading config (" + WAT.options.configFile + "): ", err);

            WAT.options.initCallback("Unable to initialize application config file (" + i + ").");
        };

    // Module Registration
    WAT.registerModule("config", self);

})(window.WAT);