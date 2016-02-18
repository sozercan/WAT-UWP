(function (WAT, WinJS, Windows) {
    "use strict";

    // Private method declaration
    var handleOfflineEvent,
        handleOfflineSuperCacheEvent,
        handleOnlineSuperCacheEvent,
        redirectToOfflineSolution,
        offlineViewLoaded,
        handleOnlineEvent,
        offlineNavigateWebview,
        logger = window.console,
        lastKnownLocation,
        utilities,
        defaultURL = "template/offline.html",
        localURLBase = "ms-appx:///";

    // Public API
    var self = {

        active: false,
        urlBase: localURLBase,
        rootURL: defaultURL,
        useSuperCache: false,

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false) {
                this.useSuperCache = true;

                window.addEventListener("offline", handleOfflineSuperCacheEvent);
                window.addEventListener("online", handleOnlineSuperCacheEvent);

                // show already in offline mode fire the event once the page is loaded
                if (!window.navigator.onLine) {
                    WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", handleOfflineSuperCacheEvent);
                }

                var offlineMessage = document.querySelector(".offlineMessageContent");
                if (offlineMessage) {
                    offlineMessage.innerText = WAT.config.offline.superCache.offlineMessage;
                }
            }

            WAT.config.offline = (WAT.config.offline || {});
            lastKnownLocation = WAT.config.baseURL; // default last location to home page

            if (!WAT.options.offlineView) { return; }
            if (!WAT.config.offline.enabled) { return; }

            if (WAT.config.offline.rootURL) {
                // If they're providing a local root URL for offline functionality
                // then we'll use that instead of our template default
                self.urlBase = localURLBase;
                self.rootURL = WAT.config.offline.rootURL;
            }

            logger.log("Set offline solution url to: " + self.urlBase + self.rootURL);

            WAT.options.offlineView.addEventListener("MSWebViewDOMContentLoaded", offlineViewLoaded);
            
            if (!WAT.config.offline || !WAT.config.offline.superCache || WAT.config.offline.superCache.enabled === false) {

                // open offline page if super cache is disabled
                window.addEventListener("offline", handleOfflineEvent);                

                // If we're not online to start, go to offline solution, this could mean 
                // using the default solution if the zip is unavailable
                if (!window.navigator.onLine) {
                    handleOfflineEvent();
                }
            }

            window.addEventListener("online", handleOnlineEvent);
        },

        forceOffline: function () {
            var nav = WAT.getModule("nav");
            if (nav) {
                nav.removeExtendedSplashScreen();
            }
            handleOfflineEvent();
        },

        navigateOffline: function (root) {
            utilities.readScript("ms-appx:///template/js/idb/injectedIDB.script").then(function (idbScript) {

                // preCache
                var checkPreCache = function (e) {
                    WAT.options.webView.removeEventListener("MSWebViewNavigationCompleted", checkPreCache);

                    for (var preCacheIndex = 0; preCacheIndex < WAT.config.offline.superCache.preCacheURLs.length; preCacheIndex++) {
                        var webview = document.createElement("x-ms-webview");
                        var url = WAT.config.offline.superCache.preCacheURLs[preCacheIndex];
                        offlineNavigateWebview(webview, url);
                    }

                    WAT.config.offline.superCache.preCacheURLs = [];
                };

                // Navigate
                offlineNavigateWebview(WAT.options.webView, root);
            });
        },

        serialize: function (args) {
        },

        updateLastKnownLocation: function (uri) {
            lastKnownLocation = uri;
        }
    };

    // Private Methods
    offlineNavigateWebview = function (webview, root) {
        var page = "";

        if (WAT.config.offline.superCache.baseDomainURL && root.indexOf(WAT.config.offline.superCache.baseDomainURL) !== -1) {
            page = root.replace(WAT.config.offline.superCache.baseDomainURL, "");
            root = WAT.config.offline.superCache.baseDomainURL;
        } else {
            logger.warn("SuperCache enabled but no baseDomainURL found. This may be a problem...");
        }

    };

    handleOfflineEvent = function () {
        WatExtensions.SuperCacheManager.useOffline = true;
        var uri;

        if (self.active) { return; }

        logger.info("Device is offline...", self.urlBase + self.rootURL);
        self.active = true;

        var fullUrl = self.urlBase + self.rootURL;

        return utilities.findLanguageFileAsync(fullUrl)
            .then(
            function (uri) {
                return Windows.Storage.StorageFile.getFileFromApplicationUriAsync(new Windows.Foundation.Uri(uri))
                    .then(
                        redirectToOfflineSolution(uri),
                        function () {
                            logger.warn("Offline solution unavailable (" + self.urlBase + self.rootURL + "), reverting to default (" + localURLBase + defaultURL + ")");

                            self.urlBase = localURLBase;
                            self.rootURL = defaultURL;
                            var fullUrl = self.urlBase.replace(/ms\-appx\:/, "ms-appx-web:") + self.rootURL;
                            redirectToOfflineSolution(fullUrl);
                        });
            });
    };

    handleOfflineSuperCacheEvent = function () {
        // double check connection status
        WatExtensions.SuperCacheManager.useOffline = true;
        if (!navigator.onLine) {
            WAT.options.offlineView.removeEventListener("MSWebViewDOMContentLoaded", handleOfflineSuperCacheEvent);

            var exec = WAT.options.webView.invokeScriptAsync("eval", "document.body.classList.add('wat_offlinemode');");
            exec.start();

            if (WAT.options.offlineMessage) {
                WAT.options.offlineMessage.style.display = 'block';
            }
        }
    };

    handleOnlineSuperCacheEvent = function () {
        WatExtensions.SuperCacheManager.useOffline = false;

        var exec = WAT.options.webView.invokeScriptAsync("eval", "document.body.classList.remove('wat_offlinemode');");
        exec.start();

        if (WAT.options.offlineMessage) {
            WAT.options.offlineMessage.style.display = 'none';
        }
    };

    redirectToOfflineSolution = function (url) {
        WAT.options.webView.style.display = "none";
        WAT.options.offlineView.style.display = "block";
        WAT.options.offlineView.navigate(url.replace(/ms\-appx\:/, "ms-appx-web:"));
    };

    offlineViewLoaded = function () {
        var exec, scriptString;

        // inject the offline message if requested...
        if (WAT.config.offline.message) {
            scriptString = "var msg = document.querySelector('.offlineMessage');" +
                            "if (msg && msg.innerHTML == '') { msg.innerHTML = '" + WAT.config.offline.message + "'; }";

            exec = WAT.options.offlineView.invokeScriptAsync("eval", scriptString);
            exec.start();
        }

        // disable the supercache message if supercache is disabled...
        if (!self.useSuperCache) {
            scriptString = "var msg = document.querySelector('.supercacheMessage');" +
                            "if (msg) { msg.style.display = 'none'; }";

            exec = WAT.options.offlineView.invokeScriptAsync("eval", scriptString);
            exec.start();
        }

        if (WAT.getModule("nav")) {
            if (WAT.options.offlineView.canGoBack === true || (self.useSuperCache === true && WAT.options.webView.canGoBack === true)) {
                WAT.getModule("nav").toggleBackButton(true);
            } else {
                WAT.getModule("nav").toggleBackButton(false);
            }
            WAT.getModule("nav").removeExtendedSplashScreen();

        }
    };

    handleOnlineEvent = function () {
        WatExtensions.SuperCacheManager.useOffline = false;
        var loc = lastKnownLocation || WAT.config.baseURL;

        if (!self.active) { return; }

        logger.info("Online connection restored, redirecting to " + loc);
        self.active = false;

        var offlineUrl = self.urlBase.replace(/ms\-appx\:/, "ms-appx-web:") + self.rootURL;

        WAT.options.offlineView.style.display = "none";
        WAT.options.offlineView.navigate(offlineUrl);
        WAT.options.webView.style.display = "block";

        WAT.goToLocation(loc);
    };

    // Module Registration
    WAT.registerModule("offline", self);

})(window.WAT, window.WinJS, window.Windows);