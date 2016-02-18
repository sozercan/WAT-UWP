(function (WAT) {
    "use strict";

    var logger;

    // Public API
    var self = {
        start: function () {

        },

        readScript: function (filePath) {
            var uri = new Windows.Foundation.Uri(filePath);
            var inputStream = null;
            var reader = null;
            var size;

            return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(function (script) {
                return script.openAsync(Windows.Storage.FileAccessMode.read);
            }).then(function (stream) {
                size = stream.size;
                inputStream = stream.getInputStreamAt(0);
                reader = new Windows.Storage.Streams.DataReader(inputStream);

                return reader.loadAsync(size);
            }).then(function () {
                var contents = reader.readString(size);
                return contents;
            });
        },

        sendDataBackToWebview: function (webView, receptor, response) {
            var asyncOp = webView.invokeScriptAsync(receptor, typeof response === "string" ? response : JSON.stringify(response));
            asyncOp.oncomplete = function () {
            };
            asyncOp.onerror = function (err) {
                console.log("error during response to webview", err.target.result.description);
            };
            asyncOp.start();
        },

        findLanguageFileAsync: function (baseFilePath) {
            var baseFileNameSegments, baseFileName, baseSegments, baseExtension;

            baseFileNameSegments = baseFilePath.split('/');
            baseFileName = baseFileNameSegments[baseFileNameSegments.length - 1];
            baseSegments = baseFilePath.split('.');
            baseExtension = '.' + baseSegments[baseSegments.length - 1];

            return findLanguageTagsAsync(baseFilePath)
                .then(function (tags) {
                    var bestLang = lookupBestLang(tags);

                    if (bestLang != '' && bestLang != getAppDefaultLanguageTag()) {
                        return baseFilePath.replace(baseExtension, '.' + bestLang + baseExtension);
                    }
                    else
                    {
                        return baseFilePath;
                    }
                });
        }
        };

    function getAppDefaultLanguageTag() {
        var appDefaultLanguage = Windows.Globalization.ApplicationLanguages.manifestLanguages[0];
        var index = appDefaultLanguage.lastIndexOf("-");
        if (index >= 0) {
            appDefaultLanguage = appDefaultLanguage.substring(0, index);
            // one-character subtags get cut along with the following subtag
            if (index >= 2 && appDefaultLanguage.charAt(index - 2) === "-") {
                appDefaultLanguage = appDefaultLanguage.substring(0, index - 2);
            }
        }
        return appDefaultLanguage;
    }

    /* Based on YUI Intl.js implementation */
    function lookupBestLang(availableLanguages) {
        var i, language, result, index, preferredLanguages;

        // check whether the list of available languages contains language; if so return it
        function scan(language) {
            var i;
            for (i = 0; i < availableLanguages.length; i += 1) {
                if (language.toLowerCase() === availableLanguages[i].toLowerCase()) {
                    return availableLanguages[i];
                }
            }
        }

        preferredLanguages = Windows.System.UserProfile.GlobalizationPreferences.languages;
        for (i = 0; i < preferredLanguages.length; i += 1) {
            language = preferredLanguages[i];
            if (!language || language === "*") {
                continue;
            }

            // check the fallback sequence for one language
            while (language.length > 0) {
                result = scan(language);
                if (result) {
                    return result;
                } else {
                    index = language.lastIndexOf("-");
                    if (index >= 0) {
                        language = language.substring(0, index);
                        // one-character subtags get cut along with the following subtag
                        if (index >= 2 && language.charAt(index - 2) === "-") {
                            language = language.substring(0, index - 2);
                        }
                    } else {
                        // nothing available for this language
                        break;
                    }
                }
            }
        }

        return "";
    }
        
    function findLanguageTagsAsync(baseFilePath) {
        var baseFileUri, baseNameSegments, baseFileNameSegments, baseFileName, baseName, baseExtension;

        baseFileNameSegments = baseFilePath.split('/');
        baseFileName = baseFileNameSegments[baseFileNameSegments.length - 1];
        baseNameSegments = baseFileName.split('.');
        baseName = baseNameSegments[0];
        baseExtension = baseNameSegments[baseNameSegments.length - 1];

        baseFileUri = new Windows.Foundation.Uri(baseFilePath);
        return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(baseFileUri)
            .then(function (baseFile) {
                var configFolerPath = baseFile.path.substr(0, baseFile.path.length - baseFile.name.length);
                return Windows.Storage.StorageFolder.getFolderFromPathAsync(configFolerPath)
                    .then(function (configFolder) {
                        return configFolder.getFilesAsync()
                            .then(function (files) {
                                var tags = [];
                                files.forEach(function (file) {
                                    var segments = file.name.split('.');
                                    if (segments[0].toLowerCase() == baseName && segments[segments.length - 1].toLowerCase() == baseExtension) {
                                        if (segments.length > 2) {
                                            tags.push(segments[segments.length - 2]);
                                        } else if (segments.length == 2) {
                                            tags.push(getAppDefaultLanguageTag());
                                        }
                                    }
                                });

                                return tags;
                            });
                    },
                    function (err) {
                        configErrorHandler(err, 1);
                    });
            });
    }

    // Module Registration
    WAT.registerModule("utilities", self);

})(window.WAT);