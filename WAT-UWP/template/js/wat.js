/*
Copyright (c) Microsoft Corporation

All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.  You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0   

THIS CODE IS PROVIDED *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABLITY OR NON-INFRINGEMENT.  

See the Apache Version 2.0 License for specific language governing permissions and limitations under the License. 


*/

(function (winJS) {
    "use strict";
    // Private method declarations
    var start,
        configErrorHandler,
        webViewLoaded,
        webViewNavigationStarting,
        webViewNavigationCompleted,
        navigatingUrl,
        handleUncaughtErrors,
        initializeSpeechPhrases,
        // Private variable declarations
        loadTimeout,
        logger = window.console,
        modules = {},
        secondaryPinLocation = null,
        utilities,
        configModule,
        guids = [],
        configIsWebApplicationManifest = false;

    // Public API
    window.WAT = {

        // Public variables
        config: {},
        options: {},
        wrapperDocHead: null,
        cortanaArgs: null,
        // Public methods

        /**
         * Initialization script to start everything off.
         * @param {Object} options The collection of options
         * @return void (Use options.initCallback to get the result of the init call. A `null` value indicates success, anything else is an error.)
         */
        init: function (options) {
            var uri;
            WAT.options = options = (options || {});

            var StartScreen = Windows.UI.StartScreen;
            var JumpList = StartScreen.JumpList;
            var JumpListItem = StartScreen.JumpListItem;
            // clearing jumplist
            if (JumpList.isSupported()) {
                JumpList.loadCurrentAsync().done(function (jumpList) {
                    jumpList.items.clear();
                    jumpList.saveAsync();
                });
            }

            options.initCallback = (options.initCallback || function () { });

            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            WinJS.Application.addEventListener("error", handleUncaughtErrors);

            if (!options.stage ||
                !options.webView) {
                logger.error("One or more of the primary html elements of the wrapper html file were not provided to the WAT engine.");
                options.initCallback("One or more of the primary html elements of the wrapper html file were not provided to the WAT engine.");
            }

            WAT.wrapperDocHead = document.querySelector("head");

            logger.info("Getting config file from " + options.configFile);

            options.configFile = "ms-appx:///" + (WAT.options.configFile || "config/config.json");
            options.filesConfigFile = "ms-appx:///config/files.json";
            var filesuri = new Windows.Foundation.Uri(options.filesConfigFile);

            if (modules["config"]) {
                configModule = modules["config"];
                configModule.start();
            }
            configModule.loadFilesConfigAsync(filesuri);
        },

        cortanaActivation: function(cortanaArgs)
        {
            if (cortanaArgs) {
                var speech;
                if (WAT.getModule("speech")) {
                    speech = WAT.getModule("speech");
                }

                var textSpoken = cortanaArgs.text.toLowerCase();
                var searchTerm = "";

                if (textSpoken.indexOf("search") != -1) {
                    searchTerm = cortanaArgs.semanticInterpretation.properties["searchTerm"][0];
                }

                speech.parseSpeech(textSpoken, searchTerm);
            }
        },

        activationHandler: function (e) {
            var namespace;

            for (namespace in modules) {
                if (modules[namespace].onActivated) {
                    logger.log("Calling onActivated for ", namespace);
                    modules[namespace].onActivated(e);
                }
            }

            if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {
                if (e.detail.arguments !== "") {
                    secondaryPinLocation = e.detail.arguments;
                    WAT.goToLocation(secondaryPinLocation);
                }
            }
            else if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.voiceCommand) {
                if(WAT.config.search || WAT.config.appBar || WAT.config.navBar || WAT.config.settings) {
                    WAT.cortanaArgs = e.detail.result;
                    WAT.cortanaActivation(WAT.cortanaArgs);
                }
            }
        },

        registerModule: function (namespace, module) {
            if (!namespace || !module || !module.start) {
                logger.warn("Unable to register module: ", namespace, module, module.start);
                return null;
            }

            logger.log("Registering module: ", namespace);
            modules[namespace.toString()] = module;
            return module;
        },

        getModule: function (namespace) {
            if (modules[namespace.toString()]) {
                return modules[namespace.toString()];
            } else {
                return null;
            }
        },

        goToLocation: function (location) {
            if (location == "home") {
                location = WAT.config.baseUrl;
            }

            var target = new Windows.Foundation.Uri(location || WAT.config.baseURL);

            if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false) {
                target = WatExtensions.SuperCacheManager.buildLocalProxyUri(new Windows.Foundation.Uri(WAT.config.baseURL), target);
            }

            WAT.options.webView.navigate(target.toString());
        },

        escapeRegex: function (str) {
            return ("" + str).replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
        },

        convertPatternToRegex: function (pattern, excludeLineStart, excludeLineEnd) {
            var isNot = (pattern[0] == '!');
            if (isNot) { pattern = pattern.substr(1) };

            var regexBody = WAT.escapeRegex(pattern);

            excludeLineStart = !!excludeLineStart;
            excludeLineEnd = !!excludeLineEnd;

            regexBody = regexBody.replace(/\\\?/g, ".?").replace(/\\\*/g, ".*?");
            if (isNot) { regexBody = "((?!" + regexBody + ").)*"; }
            if (!excludeLineStart) { regexBody = "^" + regexBody; }
            if (!excludeLineEnd) { regexBody += "$"; }

            return new RegExp(regexBody);
        },

        isFunction: function (f) {
            return Object.prototype.toString.call(f) == '[object Function]';
        },

        getGUID: function () {
            var newGUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            if (guids.indexOf(newGUID) > -1) {
                return self.getGUID();
            } else {
                return newGUID;
            }
        },

        /**
         * Promise completes with the lowest level folder in the given path, 
         * creating subfolders along the way
         * @param {String} path The path to the lowest subfolder you want a reference to
         * @param {StorageFolder} rootFolder The folder to begin at for this iteration
         * @return {Promise}
         */
        getFolderFromPathRecursive: function (path, rootFolder) {
            var normalizedPath = path.replace(/\\/g, "/").replace(/\/?[^\/]+\.[^\.\/]+$/, ""), // remove a possible filename from the end of the path and fix slashes
                folders = normalizedPath.split(/\//), // get an array of the folders in the path
                subFolderName = folders.shift(); // remove the first folder in the path as the new one to create

            return new WinJS.Promise(function (complete, error) {
                if (!subFolderName || !subFolderName.length) {
                    complete(rootFolder);
                    return;
                }

                rootFolder
                    .createFolderAsync(subFolderName, Windows.Storage.CreationCollisionOption.openIfExists)
                        .then(
                            function (folder) {
                                return WAT.getFolderFromPathRecursive(folders.join("/"), folder);
                            },
                            error
                        )
                        .then(
                            function (folder) {
                                complete(folder);
                                return;
                            },
                            error
                        );
            });
        },

        getWeekNumber: function (d) {
            var yearStart, week;

            d = (d || new Date());
            d = new Date(+d); // Copy date so don't modify original

            d.setHours(0, 0, 0);
            // Set to nearest Thursday: current date + 4 - current day number
            // Make Sunday's day number 7
            d.setDate(d.getDate() + 4 - (d.getDay() || 7));
            // Get first day of year
            yearStart = new Date(d.getFullYear(), 0, 1);
            // Calculate full weeks to nearest Thursday
            week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            // Return array of year and week number (year may have changed)
            return [d.getFullYear(), week];
        },

        getFilesWithProperties: function (files) {
            var promises = [],
                filesWithProps = [];

            return new WinJS.Promise(function (complete, error) {
                files.forEach(function (file) {
                    promises.push(
                        file.getBasicPropertiesAsync().then(function (props) {
                            filesWithProps.push({
                                fileObject: file,
                                name: file.name,
                                dateModified: props.dateModified,
                                size: props.size
                            });
                        })
                    );
                });

                WinJS.Promise.join(promises).then(
                    function () {
                        complete(filesWithProps);
                    },
                    error
                );
            });
        },

        isFileCachedAsync: function (cachedFilePath) {
            return new WinJS.Promise(function (complete) {
                var cachedFile = new Windows.Foundation.Uri(cachedFilePath);
                var validFile = false;
                Windows.Storage.StorageFile.getFileFromApplicationUriAsync(cachedFile)
                    .then(
                        function (file) {
                            validFile = (!!file.displayName); //file.isAvailable;
                        },
                        function (err) {
                            validFile = false;
                        }
                    )
                    .done(function () {
                        complete(validFile);
                    });
            });
        },

        getCachedFileAsTextAsync: function (cachedFilePath) {
            return new WinJS.Promise(function (complete) {
                var cachedFile = new Windows.Foundation.Uri(cachedFilePath);
                Windows.Storage.StorageFile.getFileFromApplicationUriAsync(cachedFile)
                    .then(
                        function (file) {
                            return Windows.Storage.FileIO.readTextAsync(file);
                        }
                   )
                    .done(function (fileContent) {
                        complete(fileContent);
                    });
            });
        },

        cacheHostedFileAsync: function (path, cachedFileName) {
            return new WinJS.Promise(function (complete) {
                var applicationData = Windows.Storage.ApplicationData.current;
                var localFolder = applicationData.localFolder;
                var networkInfo = Windows.Networking.Connectivity.NetworkInformation;
                var internetProfile = networkInfo.getInternetConnectionProfile();
                var networkConnectivityLevel = internetProfile ? internetProfile.getNetworkConnectivityLevel() : 0;
                //check we are online
                if (networkConnectivityLevel == 3) {
                    //add a query string to the path to make a unique URL and ensure we always get the latest version, not a cached version
                    var u = path + "?nocache=" + new Date().getTime();
                    var responseText;
                    try {
                        //request the file
                        WinJS.xhr({ url: u })
                            .then(function (request) {
                                //capture the response text
                                responseText = request.responseText;
                            }, function (err) { configErrorHandler(err, 1); })
                            .then(function () {
                                //create a file in local data, overwrite existing
                                return localFolder.createFileAsync(cachedFileName, Windows.Storage.CreationCollisionOption.replaceExisting)
                            }, function (err) { configErrorHandler(err, 1); })
                            .then(function (newFile) {
                                //write the response text to the new file
                                if (responseText) {
                                    return Windows.Storage.FileIO.writeTextAsync(newFile, responseText)
                                }
                                else
                                {
                                    configErrorHandler("error requesting the configuration file from: " + u, 1);
                                }
                            }, function (err) { configErrorHandler(err, 1); })
                            .done(
                                function () { complete(); },
                                function (err) { configErrorHandler(err, 1); }
                            );
                    } catch (err) {
                        configErrorHandler(err.message, 3);
                    }
                }
                else {
                    complete();
                }
            });
        },

        startHandler: function()
        {
            start();
        },

    };

    // Private methods
    handleUncaughtErrors = function (e) {
        var alertMessage = "Sorry, but there was an error. Please contact us if the issue continues.",
            error = {
                message: (e.detail.errorMessage || e),
                url: e.detail.errorUrl,
                line: e.detail.errorLine,
                character: e.detail.errorCharacter
            };

        logger.error(error.message, error.url, error.line, error.character);

        if (WAT.config.errors && WAT.config.errors.showAlertOnError) {
            if (WAT.config.errors.alertMessage) {
                alertMessage = WAT.config.errors.alertMessage;
            }

            new Windows.UI.Popups.MessageDialog(alertMessage).showAsync();
        }

        if (WAT.config.errors && WAT.config.errors.redirectToErrorPage) {
            var url,
                baseUrl = "ms-appx-web:///",
                defaultErrorUrl = "template/error.html";

            if (WAT.config.errors.errorPageURL) {
                if (/^http/.test(WAT.config.errors.errorPageURL)) {
                    url = WAT.config.errors.errorPageURL;
                } else {
                    url = baseUrl + WAT.config.errors.errorPageURL;
                }

            } else {
                url = baseUrl + defaultErrorUrl;
            }

            url = url.replace("ms-appx-web", "ms-appx");
            utilities.findLanguageFileAsync(url)
                .then(function (langUrl) {
                    langUrl = langUrl.replace("ms-appx", "ms-appx-web");
                    WAT.goToLocation(langUrl);
                });
        }

        // Indicate that we have handled the error so the app does not crash
        return true;
    };

    start = function () {
        var namespace;

        // Start the logger first
        if (modules["log"]) {
            modules["log"].start();
        }

        logger.info("Starting application...");

        if (!WAT.config.baseURL && WAT.config.homeURL) {
            WAT.config.baseURL = WAT.config.homeURL;
        }

        if (!WAT.config.baseURL) {
            throw new WinJS.ErrorFromName('Invalid url', '');
        }

        WAT.config.loadTimeoutMs = (WAT.config.loadTimeoutMs || 10000);

        for (namespace in modules) {
            // the logger is started first above
            if (namespace !== "log") {
                logger.log("Calling start on ", namespace);
                modules[namespace].start();
            }
        }

        // TODO: catch MSWebViewUnviewableContentIdentified

        WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", webViewLoaded);

        var superCacheConfig = WAT.config.offline.superCache;
        if (superCacheConfig && superCacheConfig.enabled !== false) {
            WAT.options.webView.addEventListener("MSWebViewNavigationStarting", webViewNavigationStarting);
            WAT.options.webView.addEventListener("MSWebViewNavigationCompleted", webViewNavigationCompleted);

            // initialize SuperCache configuration object
            var config = new WatExtensions.SuperCache.Config.SuperCacheConfig();
            config.proxyUri = superCacheConfig.proxyUri || "Auto";
            config.isEnabled = superCacheConfig.enabled;
            config.enableDynamicImageHandler = superCacheConfig.enableDynamicImageHandler;
            config.enableRedirectWindowOpen = superCacheConfig.enableRedirectWindowOpen;
            config.enableXhrInterceptor = superCacheConfig.enableXhrInterceptor;

            // configure URL patterns that should not be handled by the SuperCache
            if (superCacheConfig.bypassUrlPatterns) {
                superCacheConfig.bypassUrlPatterns.forEach(function (item) {
                    config.bypassUrlPatterns.append(item);
                });
            }

            // configure diagnostics tracing
            var traceLevel = superCacheConfig.traceLevel ? superCacheConfig.traceLevel.toLowerCase() : "error";
            switch (traceLevel) {
                case "off": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.off; break;
                case "error": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.error; break;
                case "warning": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.warning; break;
                case "info": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.info; break;
                case "verbose": config.traceLevel = WatExtensions.Diagnostics.TraceLevel.verbose; break;
            }

            // start the SuperCache web server
            WatExtensions.SuperCacheManager.startAsync(new Windows.Foundation.Uri(WAT.config.baseURL), config)
                .then(function () {

                    //// Uncomment the block below to handle and modify requests before resending them to the remote site
                    //WatExtensions.SuperCacheManager.onsendingrequest = function (args) {
                    //    if (args.requestUri.absoluteUri.match(/.*\/About/)) {
                    //        args.doNotCache = true;
                    //    }
                    //
                    //    logger.log("[" + args.requestId + "] (OnSendingRequest) Sending request to: " + args.requestUri);
                    //};

                    //// Uncomment the block below to handle text responses received from the remote site before reaching the webview control
                    //WatExtensions.SuperCacheManager.ontextresponsereceived = function (args) {
                    //    logger.log("[" + args.requestId + "] (OnTextResponseReceived) Response received from: " + args.requestUri);//    logger.log("[" + args.requestId + "] (OnTextResponseReceived) Response received from: " + args.requestUri);                                                //    logger.log("[" + args.requestId + "] (OnTextResponseReceived) Response received from: " + args.requestUri);//    logger.log("[" + args.requestId + "] (OnTextResponseReceived) Response received from: " + args.requestUri);
                    //};

                    // When the requested page is not present in the cache
                    WatExtensions.SuperCacheManager.onofflinepageunavailable = function (args) {
                        if (WAT.config.offline.enabled) {
                            // show the offline page only if the operation is a webview navigation. It will ignore other requests, including AJAX requests.
                            var targetUri = WatExtensions.SuperCacheManager.resolveTargetUri(navigatingUrl);
                            if (targetUri.rawUri === args.requestUri.rawUri) {
                                var offline = WAT.getModule("offline");
                                if (offline) {
                                    offline.forceOffline();
                                }
                            }
                        }
                    };

                    WAT.goToLocation((secondaryPinLocation) ? secondaryPinLocation : WAT.config.baseURL);
                },
                function (e) {
                    logger.error(e.message);
                });
        }
        else
            WAT.goToLocation((secondaryPinLocation) ? secondaryPinLocation : WAT.config.baseURL);

        logger.info("...application initialized.");

        if (WAT.config.speech.cortana && WAT.config.speech.cortana.enabled) {
            initializeSpeechPhrases();
            WAT.cortanaActivation(WAT.cortanaArgs);
        }

        WAT.options.initCallback(null);

        // We must call processAll once to avoid UI creation problems
        WinJS.UI.processAll().then(function () {
            // Back button
            WinJS.Application.onbackclick = function (evt) {
                var settings = WAT.getModule("settings");
                if (settings) {
                    if (settings.navigateBack()) {
                        return true;
                    }
                }

                var nav = WAT.getModule("nav");
                if (nav) {
                    if (nav.navigateBack()) {
                        return true;
                    }
                }
                return false;
            };

            // After ProcessAll Actions
            for (namespace in modules) {
                var actions = modules[namespace].afterProcessAllActions;

                if (actions) {
                    for (var index = 0; index < actions.length; index++) {
                        actions[index]();
                    }
                }
            }
        });
            
    };

    initializeSpeechPhrases = function () {
        var uri = new Windows.Foundation.Uri("ms-appx:///vcd.xml");

        var storageFile =
            Windows.Storage.StorageFile.getFileFromApplicationUriAsync(uri).then(
            // Success function.
            function (vcd) {
                try {
                    Windows.ApplicationModel.VoiceCommands.VoiceCommandDefinitionManager.installCommandDefinitionsFromStorageFileAsync(vcd).then(
                        function () {
                            var installedCommandSets = Windows.ApplicationModel.VoiceCommands.VoiceCommandDefinitionManager.installedCommandDefinitions;
                            if (installedCommandSets.hasKey("examplevcd")) {
                                var commandSet = installedCommandSets.lookup("examplevcd");
                                commandSet.setPhraseListAsync("options", phraseList);
                            }
                        });
                } catch (err) {
                    console.log("Error loading VCD: " + err);
                }
            });
    }

    configErrorHandler = function (err, i) {
        i = (i || 1);
        logger.error("Error while loading config (" + WAT.options.configFile + "): ", err);

        WAT.options.initCallback("Unable to initialize application config file (" + i + ").");
    };

    webViewLoaded = function () {
        clearTimeout(loadTimeout);
        loadTimeout = null;
    };

    webViewNavigationStarting = function (e) {
        if (e.uri.length > 0) {
            navigatingUrl = e.uri;
            var args = new WatExtensions.SuperCache.NavigatingEventArgs(e.uri);
            if (WatExtensions.SuperCacheManager.onNavigating(args)) {
                e.preventDefault();
                WAT.options.webView.navigate(args.targetUri);
            }
        }
    };

    webViewNavigationCompleted = function (e) {
        // update the last known location uri in the offline module when done navigating
        navigatingUrl = null;
        if (WAT.config.offline.enabled) {
            var offline = WAT.getModule("offline");
            if (offline) {
                var uri = e.uri === "about:blank" ? WAT.config.baseURL : e.uri;
                offline.updateLastKnownLocation(uri);
            }
        }
    }

    WinJS.Application.onunload = function (args) {
        if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false)
            WatExtensions.SuperCacheManager.stopAsync();
    };

})(window.winJS);