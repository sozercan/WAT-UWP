(function (WAT, WinJS, Windows) {
    "use strict";

    // "icon" values are set to a value that mataches an icon name, 
    // the whole list of which are at the link below:
    // http://msdn.microsoft.com/en-us/library/windows/apps/hh770557.aspx

    // Private method & variable declarations
    var configureBackButton, webViewLoaded, webViewNavStart, webViewNavComplete, navigateBack, dialogViewNavigationStarting,
        setupLoadingContent, loadingPartialFileLoadHandler,
        suspendingHandler, resumingHandler,
        setupAppBar, setupNavBar, setButtonAction, setStickyBits,
        injectNavbarBuildingQuery, processWebviewNavLinks, setupNestedNav, toggleNestedNav,
        handleBarEval, handleBarNavigate, handleBarSettings, handleBarShare,
        setupExtendedSplashScreen, updateSplashPositioning, updateExtendedSplashScreenStyles,
	    configureRedirects, addRedirectRule, processOldRedirectFormat,
        redirectShowMessage, redirectPopout, redirectUrl,
        loadWindowOpenSpy, loadWindowCloseSpy, handleWindowOpen, handleWindowClose, closeModalContent,
        splashScreenEl, splashScreenImageEl, splashLoadingEl, getUriParameter,
        navDrawerInit, returnToContent, toggleMenu, itemInvokedHandler, disableNavDrawer, startupComplete,
        loadCustomCssFileStringForDialog, injectCustomCssToDialog, webViewNewWindowRequested, webViewPermissionRequested,
        afterProcessAllActions = [],
        logger = window.console,
        barActions = {},
        splashScreen = null,
        backButtons = [],
        backButtonRules = [],
        redirectRules = [],
        redirectActions = {},
        isWebViewEmpty,
        contentLoaded = false;

    // Public API
    var self = {

        start: function () {
            WAT.config.navigation = (WAT.config.navigation || {});

            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            configureBackButton();
            configureRedirects();

            setupLoadingContent();

            // hide extended splashscreen on DOMContentLoaded or on NavigationComplete, depending on setting in the config
            if (WAT.config.startup && WAT.config.startup.showContentWhileLoading) {
                WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", startupComplete);
            } else {
                WAT.options.webView.addEventListener("MSWebViewNavigationCompleted", startupComplete);
            }
            // when inner pages load, do these things...
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", webViewLoaded);
            WAT.options.webView.addEventListener("MSWebViewContentLoading", webViewLoaded);
            // when inner navigation occurs, do some stuff
            WAT.options.webView.addEventListener("MSWebViewNavigationStarting", webViewNavStart);
            // when navigation is complete, remove the loading icon
            WAT.options.webView.addEventListener("MSWebViewNavigationCompleted", webViewNavComplete);

            WAT.options.webView.addEventListener("MSWebViewNewWindowRequested ", webViewNewWindowRequested);
            WAT.options.webView.addEventListener("MSWebViewPermissionRequested", webViewPermissionRequested);


            Windows.UI.WebUI.WebUIApplication.addEventListener("suspending", suspendingHandler);
            Windows.UI.WebUI.WebUIApplication.addEventListener("resuming", resumingHandler);

            barActions = {
                back: navigateBack,
                eval: handleBarEval,
                navigate: handleBarNavigate,
                settings: handleBarSettings,
                share: handleBarShare,
                nested: true
            };

            setupAppBar();
            setupNavBar();

            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", setStickyBits);
        },

        toggleBackButton: function (isVisible) {
            var state,
                showBackButton = false;

            var systemNavigation = Windows.UI.Core.SystemNavigationManager.getForCurrentView();

            if (isVisible) {
                systemNavigation.appViewBackButtonVisibility = Windows.UI.Core.AppViewBackButtonVisibility.visible;
            }
            else {
                systemNavigation.appViewBackButtonVisibility = Windows.UI.Core.AppViewBackButtonVisibility.collapsed;
            }
        },

        toggleLoadingScreen: function (isLoading) {
            var clearOverlay = document.querySelector(".transparent-overlay");
            var blurOverlay = document.querySelector(".webview-overlay");

            if (isLoading) {
                if (blurOverlay && clearOverlay) {
                    if (!self.contentLoaded) {
                        clearOverlay.style.display = 'inline';
                        blurOverlay.classList.remove("fadeOut");
                        if (!clearOverlay.classList.contains("overlay-wp")) {
                            clearOverlay.classList.add("overlay-wp");
                        }
                    }
                }

                WAT.options.stage.classList.add("loading");
            } else if (WAT.options.stage.classList.contains("loading")) {
                if (blurOverlay && clearOverlay) {
                    clearOverlay.style.display = "none";
                    blurOverlay.classList.add("fadeOut");
                }

                WAT.options.stage.classList.remove("loading");
            }
        },

        onActivated: function (e) {
            // On launch, we show an extended splash screen (versus the typical loading icon)
            if (e.detail.kind === Windows.ApplicationModel.Activation.ActivationKind.launch) {

                if (WAT.options.appBar) {
                    // This line disables the Appbar before it is converted to a WinControl
                    WAT.options.appBar.setAttribute("data-win-options", "{ disabled : true }");
                }

                // cached for use later
                splashScreen = e.detail.splashScreen;

                // Listen for window resize events to reposition the extended splash screen image accordingly.
                // This is important to ensure that the extended splash screen is formatted properly in response to snapping, unsnapping, rotation, etc...
                window.addEventListener("resize", updateSplashPositioning, false);

                var previousExecutionState = e.detail.previousExecutionState;
                var state = Windows.ApplicationModel.Activation.ApplicationExecutionState;
                if (previousExecutionState === state.notRunning
                    || previousExecutionState === state.terminated
                    || previousExecutionState === state.closedByUser) {
                    setupExtendedSplashScreen();
                }
            }
        },

        parseURL: function (url) {
            var parsed, path,
                parser = document.createElement("a");
            parser.href = url;

            parsed = {
                protocol: parser.protocol, // => "http:"
                hostname: parser.hostname, // => "example.com"
                port: parser.port, // => "3000"
                pathname: parser.pathname, // => "/pathname/"
                search: parser.search, // => "?search=test"
                query: parser.search, // => "?search=test"
                hash: parser.hash, // => "#hash"
                host: parser.host // => "example.com:3000"
            };

            path = parsed.pathname.match(/(.+?\/)([^/]+\.[^/]+)?$/);
            if (path) {
                parsed.dirpath = path[1];
                parsed.file = path[2];
            } else {
                parsed.dirpath = parsed.pathname + "/";
                parsed.file = "";
            }

            return parsed;
        },

        removeExtendedSplashScreen: function () {
            if (splashScreenEl) {
                splashScreenEl.style.display = "none";
            }

            if (WAT.config.appBar && WAT.config.appBar.enabled && WAT.options.appBar) {
                WAT.options.appBar.winControl.disabled = false;
            }

            splashScreen = null;
        },

        navigateBack: function () {
            return navigateBack();
        },

        afterProcessAllActions: afterProcessAllActions
    };

    // Private methods
    isWebViewEmpty = function () {
        var op = WAT.options.webView.invokeScriptAsync("eval", "if (document.body){ document.body.innerHTML.length.toString(); } else {'0'}");
        op.oncomplete = function (e) {
            if (e.target.result === "0") {
                // No page loaded
                return true;
            }
            else {
                // Page loaded
                return false;
            }
        }
        op.start();
    };

    configureBackButton = function () {
        var hideBackRules = WAT.config.navigation.hideBackButtonOnMatch;

        backButtonRules.push(WAT.convertPatternToRegex(WAT.config.baseURL));

        if (hideBackRules && hideBackRules.length) {
            hideBackRules.forEach(function (pattern) {
                var fullPattern, regex;

                if (!pattern || !pattern.length) {
                    logger.warn("Skipping invalid back button hide rule:", pattern);
                    return;
                }

                fullPattern = pattern.replace(/\{baseURL\}/g, WAT.config.baseURL);
                regex = WAT.convertPatternToRegex(fullPattern);
                if (regex) {
                    logger.log("Adding back button hide rule: ", pattern, regex);
                    backButtonRules.push(regex);
                }
            });
        }

        if (WAT.options.backButton && !WAT.config.navigation.hideOnPageBackButton) {
            // we need to hold onto the parent since that is what gets toggled, not the actual <button>
            backButtons.push(WAT.options.backButton.parentNode);

            // handle back button clicks
            WAT.options.backButton.addEventListener("click", navigateBack);
        }
    };

    configureRedirects = function () {
        redirectActions = {
            showMessage: redirectShowMessage,
            popout: redirectPopout,
            redirect: redirectUrl,
            modal: true
        };

        WAT.config.redirects = (WAT.config.redirects || {});

        if (WAT.config.redirects.enabled === true && WAT.config.redirects.rules && WAT.config.redirects.rules.length) {
            WAT.config.redirects.rules.forEach(addRedirectRule);

        } else if (WAT.config.redirects.enabled === true && WAT.config.redirects.links && WAT.config.redirects.links.length) {
            // support old format for redirects
            WAT.config.redirects.links.forEach(processOldRedirectFormat);
        }

        if (WAT.config.redirects.enableCaptureWindowOpen === true && WAT.options.dialogView) {
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", loadWindowOpenSpy);
            WAT.options.dialogView.addEventListener("MSWebViewDOMContentLoaded", loadWindowCloseSpy);
            WAT.options.dialogView.addEventListener("MSWebViewNavigationStarting", dialogViewNavigationStarting);

            WAT.options.webView.addEventListener("MSWebViewScriptNotify", handleWindowOpen);
            //WAT.options.dialogView.addEventListener("MSWebViewScriptNotify", handleWindowClose);
            WAT.options.webView.addEventListener("MSWebViewFrameNavigationStarting", handleWindowOpen);

            WAT.options.dialogView.parentNode.addEventListener("click", closeModalContent);
        }
    };

    dialogViewNavigationStarting = function (e) {
        if (WAT.config.offline && WAT.config.offline.superCache && WAT.config.offline.superCache.enabled !== false) {
            var args = new WatExtensions.SuperCache.NavigatingEventArgs(e.uri);
            if (WatExtensions.SuperCacheManager.onNavigating(args)) {
                e.preventDefault();
                WAT.options.dialogView.navigate(args.targetUri);
            }
        }
    };

    loadWindowOpenSpy = function () {
        var scriptString, exec;

        scriptString =
        "(function() {\n" +
            "var match, " +
                "openWindow = window.open;\n" +
            "window.open = function() {\n" +
                "console.log('intercepted window.open going to: ' + arguments[0]);\n" +
                "match = false;\n";

        // see if the request URL matches a redirect rule...
        redirectRules.forEach(function (rule) {
            if (rule.action === "modal") {
                scriptString += "if (" + rule.regex + ".test(arguments[0])) { match = true; }\n";
            }
        });

        scriptString +=
                "if (match) {\n" +
                    "if (window.location.protocol === 'https:') {\n" +
                        "window.external.notify('WINDOWOPEN~~' + arguments[0]);\n" +
                    "}\n" +
                    "else {\n" +
                        "var iframe = document.createElement('iframe');\n" +
                        "iframe.width = 0;\n" +
                        "iframe.height = 0;\n" +
                        "iframe.id = Math.random();\n" +
                        "iframe.onload = function () { this.parentNode.removeChild(this); };\n" +
                        "iframe.src = \"" + WAT.config.baseURL + "\" + \"?WINDOWOPEN=\" + encodeURIComponent(arguments[0]);\n" +
                        "document.body.appendChild(iframe);\n" +
                    "}\n" +
                    "return null;\n" +
                "} else {\n" +
                    // if none of the redirect rules matched open as normal (external browser)
                    "return openWindow.apply(this, Array.prototype.slice.call(arguments));\n" +
                "}\n" +
            "};\n" + // end of window.open override
        "})();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    loadCustomCssFileStringForDialog = function (customStylesFromFile) {
        var exec, scriptString;

        logger.log("injecting styles: ", customStylesFromFile.replace(/\r\n/gm, " "));

        scriptString = "var cssFileString = '" + customStylesFromFile.replace(/\r\n/gm, " ") + "';" +
            "var cssFileStyleEl = document.createElement('style');" +
            "document.body.appendChild(cssFileStyleEl);" +
            "cssFileStyleEl.innerHTML = cssFileString;";

        exec = WAT.options.dialogView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    injectCustomCssToDialog = function (e, customCssFile) {
        if (customCssFile) {
            var cssFile = "ms-appx://" + ((/^\//.test(customCssFile)) ? "" : "/") + customCssFile;

            logger.log("Getting custom css file from " + cssFile);

            var cssUrl = new Windows.Foundation.Uri(cssFile);
            Windows.Storage.StorageFile.getFileFromApplicationUriAsync(cssUrl)
                .then(function (file) {
                    Windows.Storage.FileIO.readTextAsync(file)
                    .then(function (cssFileContent) {
                        loadCustomCssFileStringForDialog(cssFileContent);
                    },
                        function (err) {
                            // log this error, but let things proceed anyway
                            logger.warn("Error reading custom css file", err);
                        }
                    )
                },
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.error("Error getting custom css file", err);
                }
            );
        }
    };

    handleWindowOpen = function (e) {
        var url, parsed, path, content, customCss;

        url = getUriParameter(e, "WINDOWOPEN");
        if (!url) {
            // oops, this isn't ours
            return;
        }

        logger.log("captured external window.open call to: ", url);

        if (!/^http/.test(url)) {
            if (/^\//.test(url)) {
                // path from root
                parsed = self.parseURL(WAT.config.baseURL);
                url = parsed.protocol + "//" + parsed.hostname + url;
            } else {
                // relative path
                parsed = self.parseURL(WAT.options.webView.src);
                url = parsed.protocol + "//" + parsed.hostname + parsed.dirpath + url;
            }
        }

        //find data about the redirect rule, if any
        var closeButtonDisplay = "block";
        var cssCustomFile;
        if (WAT.config.redirects.enabled === true) {
            redirectRules.forEach(function (rule) {
                if (rule.regex.test(url)) {
                    if (rule.hideCloseButton === true) {
                        closeButtonDisplay = "none";
                    }
                    cssCustomFile = rule.customCssFile;
                }
            });
        }

        // Hide close button if requested for this URL
        if (WAT.options.closeButton) {
            WAT.options.closeButton.style.display = closeButtonDisplay;
        }

        WAT.options.dialogView.navigate(url);
        if (cssCustomFile) {
            WAT.options.dialogView.addEventListener("MSWebViewDOMContentLoaded", function (e) { return injectCustomCssToDialog.call(this, e, cssCustomFile); });
        }

        if (!WAT.config.header || WAT.config.header.enabled !== true) {
            WAT.options.dialogView.parentNode.style.msGridRow = 1;
            WAT.options.dialogView.parentNode.style.msGridRowSpan = 2;
        }
        WAT.options.dialogView.parentNode.style.display = "block";
    };

    getUriParameter = function (e, parameter) {
        if (e.type === "MSWebViewScriptNotify") {
            var content = e.value.split(/~~/);
            if (content.length === 2 && content[0] === parameter) {
                return content[1];
            }
        }
        else if (e.type === "MSWebViewFrameNavigationStarting") {
            var uriString = e.uri;
            if (uriString.indexOf('?') > -1) {
                uriString = uriString.split('?')[1];
            }

            var queryStringParams = uriString.split('&');
            var length = queryStringParams.length;

            for (var i = 0; i < length; i++) {
                if (queryStringParams[i].indexOf(parameter + '=') > -1) {
                    return decodeURIComponent(queryStringParams[i].split(parameter + '=')[1]);
                }
            }
        }

        return null;
    };

    loadWindowCloseSpy = function (e) {
        var scriptString, exec,
            modalClosed = false;

        WAT.options.dialogView.addEventListener("MSWebViewScriptNotify", handleWindowClose);
        WAT.options.dialogView.addEventListener("MSWebViewFrameNavigationStarting", handleWindowClose);

        // See if we need to close the modal based on URL
        if (WAT.config.redirects.enabled === true) {
            redirectRules.forEach(function (rule) {
                if (rule.action === "modal" && rule.closeOnMatchRegex && rule.closeOnMatchRegex.test(e.uri)) {
                    modalClosed = true;
                    closeModalContent();
                }
            });
            if (modalClosed) {
                return; // nothing else to do, the modal is closed
            }
        }

        scriptString =
        "(function() {\n" +
            "var closeWindow = window.close;\n" +
            "window.close = function() {\n" +
                "console.log('intercepted window.close');\n" +
                "if (window.location.protocol === 'https:') {\n" +
                    "window.external.notify('WINDOWCLOSE~~' + window.location.href);\n" +
                "}\n" +
                "else {\n" +
                    "var iframe = document.createElement('iframe');\n" +
                    "iframe.width = 0;\n" +
                    "iframe.height = 0;\n" +
                    "iframe.id = Math.random();\n" +
                    "iframe.onload = function () { this.parentNode.removeChild(this); };\n" +
                    "iframe.src = \"" + WAT.config.baseURL + "?WINDOWCLOSE=\" + encodeURIComponent(window.location.href);\n" +
                    "document.body.appendChild(iframe);\n" +
                "}\n" +
                "return;\n" +
            "};\n" + // end of window.close override
        "})();";

        exec = WAT.options.dialogView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    var handleWindowClose = function (e) {
        var metadata = getUriParameter(e, "WINDOWCLOSE");

        if (metadata) {
            logger.log("captured external window.close call: ", metadata);

            closeModalContent();
        }
    };

    closeModalContent = function () {
        WAT.options.dialogView.src = "about:blank";
        WAT.options.dialogView.parentNode.style.display = "none";

        if (WAT.config.redirects.refreshOnModalClose === true) {
            WAT.options.webView.refresh();
        }
    };

    addRedirectRule = function (rule) {
        var ruleCopy = { original: rule };

        if (!redirectActions[rule.action]) {
            logger.warn("Looks like that is an invalid redirect action... ", rule.action);
            return;
        }

        ruleCopy.pattern = rule.pattern.replace(/\{baseURL\}/g, WAT.config.baseURL);
        ruleCopy.regex = WAT.convertPatternToRegex(ruleCopy.pattern);

        ruleCopy.action = rule.action;
        ruleCopy.message = rule.message || "";
        ruleCopy.url = (rule.url) ? rule.url.replace(/\{baseURL\}/g, WAT.config.baseURL) : "";

        ruleCopy.hideCloseButton = rule.hideCloseButton || false;
        ruleCopy.closeOnMatch = rule.closeOnMatch || null;
        if (rule.closeOnMatch) {
            ruleCopy.closeOnMatchRegex = WAT.convertPatternToRegex(rule.closeOnMatch);
        } else {
            rule.closeOnMatchRegex = null;
        }
        ruleCopy.customCssFile = rule.customCssFile;

        logger.info("Adding redirect rule (" + ruleCopy.action + ") with pattern/regex: " + ruleCopy.pattern, ruleCopy.regex);

        redirectRules.push(ruleCopy);
    };

    processOldRedirectFormat = function (rule) {
        var actionMatch,
            newRule = { action: null, link: rule };

        newRule.pattern = rule.link;
        actionMatch = rule.action.match(/^showMessage\:\s*(.*)/);
        if (actionMatch) {
            newRule.action = "showMessage";
            newRule.message = actionMatch[1];
        } else {
            newRule.action = "redirect";
            newRule.url = rule.action;
        }

        addRedirectRule(newRule);
    };

    webViewNewWindowRequested = function (e) {
        e.preventDefault();
        WAT.goToLocation(e.uri);
    };

    // handling persmission request: Geolocation, UnlimitedIndexedDBQuota, Media, PointerLock
    webViewPermissionRequested = function (e) {
        if (WAT.config.geoLocation.enabled) {
            if (e.permissionRequest.type === 'geolocation') {
                e.permissionRequest.allow();
            }
        }
    };

    webViewNavStart = function (e) {
        self.contentLoaded = false;
        self.toggleLoadingScreen(true);
        self.toggleBackButton(false);

        // Follow any redirect rules
        if (WAT.config.redirects.enabled === true && e.uri.length > 0) {
            redirectRules.forEach(function (rule) {
                if (rule.regex.test(e.uri) && WAT.isFunction(redirectActions[rule.action])) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    redirectActions[rule.action](rule, e.uri);
                    self.toggleLoadingScreen(false);
                    if (WAT.options.webView.canGoBack === true) {
                        self.toggleBackButton(true);
                    }
                }
            });
        }
    };

    navigateBack = function (e) {
        var view = WAT.options.webView;

        if (e && e.currentTarget.getAttribute("disabled") === "disabled") {
            e.preventDefault();
            return false;
        }

        var offlineModule = WAT.getModule("offline");
        if (offlineModule && offlineModule.active && WAT.options.offlineView && !offlineModule.useSuperCache) {
            view = WAT.options.offlineView;
        }

        if (offlineModule && offlineModule.active && WAT.options.offlineView && offlineModule.useSuperCache && view.canGoBack) {
            view.style.display = "block";
            WAT.options.offlineView.style.display = "none";
            offlineModule.active = false;
        }

        if (!view.canGoBack) {
            return false;
        }

        try {
            view.goBack();
        } catch (err) {
            return false;
        }

        return true;
    }

    startupComplete = function () {
        if (splashScreen) {
            self.removeExtendedSplashScreen();
        }
    }

    webViewNavComplete = function () {
        self.toggleLoadingScreen(false);

        var showBackButton = true;

        if (WAT.options.webView.canGoBack === true) {
            backButtonRules.forEach(function (rule) {
                if (rule.test(WAT.options.webView.src)) {
                    showBackButton = false;
                }
            });
        } else {
            showBackButton = false;
        }

        if (WAT.config.header && WAT.config.header.enabled === true) {
            var header = WAT.getModule("header");

            if (header)
                header.setPageTitle(!showBackButton);
        }

        self.toggleBackButton(showBackButton);
    }

    webViewLoaded = function () {
        self.contentLoaded = true;
    };

    setupLoadingContent = function () {
        var partial;

        if (!WAT.config.navigation.pageLoadingPartial || !WAT.options.loadingWrapper) {
            return;
        }

        partial = "ms-appx://" + ((/^\//.test(WAT.config.navigation.pageLoadingPartial)) ? "" : "/") + WAT.config.navigation.pageLoadingPartial;

        logger.log("Getting loading partial file from " + partial);

        var url = new Windows.Foundation.Uri(partial);
        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(url)
            .then(
                loadingPartialFileLoadHandler,
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.error("Error getting custom loading partial file", err);
                }
            );
    };

    loadingPartialFileLoadHandler = function (file) {
        Windows.Storage.FileIO.readTextAsync(file)
            .then(
                function (text) {
                    WAT.options.loadingWrapper.innerHTML = text;
                },
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.warn("Error reading custom loading partial file", err);
                }
            );
    };

    // the suspending and resuming handler take care of the edge case where the app crashes if the app is suspended while it is still navigating. Repeatedely reported by the STARTS testing team.
    suspendingHandler = function (e) {
        console.log('suspending');
        WAT.options.webView.navigateToString("");
        var suspendingDeferral = e.suspendingOperation.getDeferral();
        WinJS.Promise.timeout(1000).done(function () {
            suspendingDeferral.complete();
        });
    };

    resumingHandler = function (e) {
        WAT.options.webView.goBack();
    };

    // app and nav bar setup
    setupAppBar = function () {
        var appBarEl = WAT.options.appBar;

        WAT.config.appBar = (WAT.config.appBar || {});

        // Determine whether the share button should be shown
        var showShare = WAT.config.share &&
            WAT.config.share.enabled &&
            WAT.config.share.showButton;

        // Do not delete the app bar element if the privacy setting is present.
        if (!WAT.config.appBar.enabled || !appBarEl) { // !showShare && !privacyOnly && (
            if (appBarEl) {
                appBarEl.parentNode.removeChild(appBarEl);
                appBarEl = null;
            }
            return;
        }

        // At this point we are building the app bar and forcing it enabled. We need this in case the app bar is disabled by configuration, but there's a privacy setting configured.
        WAT.config.appBar.enabled = true;

        WAT.config.appBar.buttons = (WAT.config.appBar.buttons || []);

        WAT.config.appBar.buttons.forEach(function (menuItem) {

            if (WAT.config.speech.cortana && WAT.config.speech.cortana.appBar) {
                phraseList.push(menuItem.label); //adding appbar items to cortana phrases
            }

            var btn = document.createElement("button");

            var section = (menuItem.section || "primary");
            new WinJS.UI.Command(btn, { label: menuItem.label, icon: menuItem.icon, section: section });

            setButtonAction(btn, menuItem);

            var toolbar = document.getElementsByClassName('win-commandingsurface-actionarea')[0];
            toolbar.appendChild(btn);
        });
    };

    setupNavBar = function () {
        var navBarEl = WAT.options.navBar;

        WAT.config.navBar = (WAT.config.navBar || {});

        // if navbar is enabled and header is disabled, enable header (disable navbar if you don't want header)
        if (WAT.config.header && !WAT.config.header.enabled && WAT.config.navBar.enabled) {
            WAT.config.header.enabled = true;
        }

        if (!WAT.config.navBar.enabled || !navBarEl) { // removing splitview and splitview toggle
            if (navBarEl && navBarEl.parentNode.parentNode) {
                WAT.options.splitViewToggle.parentNode.removeChild(WAT.options.splitViewToggle);
                WAT.options.navBar.parentNode.removeChild(WAT.options.navBar);
            }
            return; 
        }

        var JumpList = Windows.UI.StartScreen.JumpList;
        var JumpListItem = Windows.UI.StartScreen.JumpListItem;

        //if (JumpList.isSupported()) {
            JumpList.loadCurrentAsync().done(function (jumpList) {
                // Add explicit buttons first...
                if (WAT.config.navBar.buttons) {
                    WAT.config.navBar.buttons.forEach(function (menuItem) {
                        navDrawerInit();

                        var navBarCommands = document.getElementById("nav-commands");

                        var splitViewItem = document.createElement("div");
                        splitViewItem.setAttribute("data-win-control", "WinJS.UI.SplitViewCommand");
                        splitViewItem.setAttribute("data-action", menuItem.action);
                        splitViewItem.setAttribute("data-data", menuItem.data);

                        new WinJS.UI.SplitViewCommand(splitViewItem, { label: menuItem.label, icon: menuItem.icon, onclick: itemInvokedHandler });

                        navBarCommands.appendChild(splitViewItem);

                        if (WAT.config.speech.cortana && WAT.config.speech.cortana.navBar) {
                            phraseList.push(menuItem.label); //adding to cortana phrases
                        }

                        // adding to jumplists
                        if (menuItem.action != "eval") {
                            var item = JumpListItem.createWithArguments(menuItem.action, menuItem.label);
                            jumpList.items.append(item);
                            jumpList.saveAsync();
                        }
                    });
                }
            });
        //}
    };

    // initializing navdrawer
    navDrawerInit = function () {
        var splitView = document.querySelector(".splitView").winControl;
        new WinJS.UI._WinKeyboard(splitView.paneElement);
    };

    toggleMenu = function () {
        var splitView = document.querySelector('[data-win-control="WinJS.UI.SplitView"]').winControl;

        if (splitView.paneOpened) {
            splitView.closePane();
        }        
        else {
            splitView.openPane();
        }
    };

    // handles items in the navdrawer
    itemInvokedHandler = 
        WinJS.UI.eventHandler(function (ev) {
            var action = ev.currentTarget.dataset.action;
            var data = ev.currentTarget.dataset.data;

            switch (action) {
                case "home":
                    WAT.goToLocation(WAT.config.baseUrl);
                    break;
                case "eval":
                    var scriptString = "(function() { " + data + " })();";
                    var exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
                    exec.start();
                    break;
                case "back":
                    WAT.options.webView.goBack();
                    break;
                case "nested":
                    break;
                default:
                    WAT.goToLocation(action);
                    break;
            }

            toggleMenu();
        });

    setStickyBits = function () {
        var appBarHeight, height = (parseInt(WAT.options.stage.offsetHeight) || 0);

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", setStickyBits);

        if (WAT.config.appBar && WAT.config.appBar.enabled === true && WAT.config.appBar.makeSticky) {
            WAT.options.appBar.disabled = false;

            appBarHeight = (parseInt(WAT.options.appBar.offsetHeight) || 0);

            height -= appBarHeight;
        }
    };

    setButtonAction = function (btn, menuItem) {
        var action = menuItem.action.toLowerCase(),
            data = menuItem.data,
            handler = barActions[action];

        if (!handler) {
            // default handler is webview navigation
            handler = barActions["navigate"];
            data = menuItem.action;
        }

        if (!WAT.isFunction(handler)) {
            // This is a non-operational bar item (maybe nested nav?)
            return;
        }

        if (data === "home") {
            data = WAT.config.baseURL;
        }

        if (action === "back") {
            backButtons.push(btn);
        }

        btn.dataset.barActionData = data;
        //handle children case
        if (menuItem.children && menuItem.children.length) {
            btn.children[0].addEventListener("click", handler);
        } else {

            btn.addEventListener("click", handler);
        }

    };

    // app and nav bar action handlers

    handleBarEval = function () {
        var scriptString, exec;

        scriptString = "(function() { " + this.dataset.barActionData + " })();";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    handleBarNavigate = function () {
        //if dataset doesn't exist, look for parent, becuse it will be a nested button assignment that is a child
        var url = (this.dataset.barActionData || this.parentNode.dataset.barActionData || WAT.config.baseURL);
        WAT.goToLocation(url);
    };

    handleBarSettings = function () {
        WAT.options.webView.navigate("ms-appx-web:///template/settings.html");
    };

    // redirect rule action handlers
    redirectShowMessage = function (rule) {
        logger.log("Showing message: " + rule.message);
        return new Windows.UI.Popups.MessageDialog(rule.message).showAsync();
    };

    redirectPopout = function (rule, linkUrl) {
        logger.log("Popping out URL to: " + linkUrl);
        return Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(linkUrl));
    };

    redirectUrl = function (rule) {
        logger.log("Redirecting user to link in app: " + rule.url);

        WAT.goToLocation(rule.url);
    };


    // splash screen functionality
    setupExtendedSplashScreen = function () {
        splashScreenEl = WAT.options.extendedSplashScreen;
        splashScreenImageEl = (splashScreenEl && splashScreenEl.querySelector(".extendedSplashImage"));
        splashLoadingEl = (splashScreenEl && splashScreenEl.querySelector(".loading-progress"));

        if (!splashScreen || !splashScreenEl || !splashScreenImageEl) { return; }

        updateSplashPositioning();

        // Once the extended splash screen is setup, apply the CSS style that will make the extended splash screen visible.
        splashScreenEl.style.display = "block";
    };

    updateSplashPositioning = function () {
        if (!splashScreen || !splashScreenImageEl) { return; }
        // Position the extended splash screen image in the same location as the system splash screen image.
        splashScreenImageEl.style.top = splashScreen.imageLocation.y + "px";
        splashScreenImageEl.style.left = splashScreen.imageLocation.x + "px";
        splashScreenImageEl.style.height = splashScreen.imageLocation.height + "px";
        splashScreenImageEl.style.width = splashScreen.imageLocation.width + "px";

        if (splashLoadingEl) {
            splashLoadingEl.style.top = (splashScreen.imageLocation.y + splashScreen.imageLocation.height + 20) + "px";
        }
    };

    // Module Registration
    WAT.registerModule("nav", self);

})(window.WAT, window.WinJS, window.Windows);