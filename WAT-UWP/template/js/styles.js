(function (WAT, Windows) {
    "use strict";

    // Private method declaration
    var setThemeColor, loadCustomStyleString, setupWrapperCssFile, addCustomWrapperStyles,
        getCustomCssFile, customCssFileLoadHandler, loadCustomCssFileString,
        addNavAppBarCustomColorStyles, logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            WAT.config.styles = (WAT.config.styles || {});

            setThemeColor();
            addNavAppBarCustomColorStyles();

            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", loadCustomStyleString);

            if (WAT.config.styles.wrapperCssFile) {
                setupWrapperCssFile();
            }
            if (WAT.config.styles.customCssFile) {
                WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", getCustomCssFile);
            }
        }

    };

    // Private methods

    setThemeColor = function () {
        var link = WAT.wrapperDocHead.querySelector('link[rel=stylesheet][data-href="THEME-PLACEHOLDER"]');
        link.href = "/css/ui-themed" + (WAT.config.styleTheme ? ".theme-" + WAT.config.styleTheme : "") + ".css";
    };

    setupWrapperCssFile = function () {
        var newStyleSheet;

        if (!WAT.config.styles.wrapperCssFile) {
            return;
        }

        newStyleSheet = document.createElement("link");
        newStyleSheet.rel = "stylesheet";
        newStyleSheet.href = WAT.config.styles.wrapperCssFile;

        WAT.wrapperDocHead.appendChild(newStyleSheet);
    };

    loadCustomStyleString = function () {
        var i, l, hiddenEls, exec,
            scriptString = "",
            cssString = "";

        if (WAT.config.styles.setViewport === true) {
            cssString += "@-ms-viewport {";
        }
        if (WAT.config.styles.setViewport === true &&
            WAT.config.styles.targetWidth !== "") {
            cssString += "width:" + WAT.config.styles.targetWidth + ";";
        }
        if (WAT.config.styles.setViewport === true &&
            WAT.config.styles.targetHeight) {
            cssString += "height:" + WAT.config.styles.targetHeight + ";";
        }
        if (WAT.config.styles.setViewport === true) {
            cssString += "}";
        }
        if (WAT.config.styles.suppressTouchAction === true) {
            cssString += "body{touch-action:none;}";
        }

        if (WAT.config.styles.hiddenElements && WAT.config.styles.hiddenElements !== "") {
            hiddenEls = WAT.config.styles.hiddenElements;
            var elements = "";
            for (i = 0; i < hiddenEls.length - 1; i++) {
                elements += hiddenEls[i] + ",";
            }
            elements += hiddenEls[hiddenEls.length - 1];
            cssString += elements + "{display:none !important;}";
        }

        //custom css string to add whatever you want
        if (WAT.config.styles.customCssString) {
            cssString += WAT.config.styles.customCssString;
        }

        scriptString += "var cssString = '" + cssString + "';" +
            "var styleEl = document.createElement('style');" +
            "document.body.appendChild(styleEl);" +
            "styleEl.innerHTML = cssString;";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    getCustomCssFile = function () {
        var cssFile = "ms-appx://" + ((/^\//.test(WAT.config.styles.customCssFile)) ? "" : "/") + WAT.config.styles.customCssFile;

        logger.log("Getting custom css file from " + cssFile);

        var url = new Windows.Foundation.Uri(cssFile);
        Windows.Storage.StorageFile.getFileFromApplicationUriAsync(url)
            .then(
                customCssFileLoadHandler,
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.error("Error getting custom css file", err);
                }
            );
    };

    customCssFileLoadHandler = function (file) {
        Windows.Storage.FileIO.readTextAsync(file)
            .then(loadCustomCssFileString,
                function (err) {
                    // log this error, but let things proceed anyway
                    logger.warn("Error reading custom css file", err);
                }
            );
    };

    loadCustomCssFileString = function (customStylesFromFile) {
        var exec, scriptString;

        logger.log("injecting styles: ", customStylesFromFile.replace(/\r\n/gm, " "));

        scriptString = "var cssFileString = '" + customStylesFromFile.replace(/\r\n/gm, " ") + "';" +
            "var cssFileStyleEl = document.createElement('style');" +
            "document.body.appendChild(cssFileStyleEl);" +
            "cssFileStyleEl.innerHTML = cssFileString;";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();
    };

    addNavAppBarCustomColorStyles = function () {
        var navBarScript = "";

        if (WAT.config.appBar) {
            var appBarBackColor = WAT.config.appBar.backgroundColor;
            var appBarButtonColor = WAT.config.appBar.buttonColor;

            if (appBarBackColor || appBarButtonColor) {
                /*App Bar custom colors*/

                navBarScript += ".win-appbar.win-bottom.customColor {\n";
                if (appBarBackColor) {
                    navBarScript += "background-color: " + appBarBackColor + ";\n";
                }

                navBarScript += "}\n" +
                    ".customColor .win-commandimage{\n";

                if (appBarButtonColor) {
                    navBarScript += "color: " + appBarButtonColor + ";\n";
                }

                navBarScript += "}\n" +
                    ".customColor button:active .win-commandimage, \n" +
                    ".customColor button:enabled:hover:active .win-commandimage.win-commandimage{ \n";

                if (appBarBackColor) {
                    navBarScript += "color: " + appBarBackColor + " !important;\n";
                }
                else {
                    if (appBarButtonColor) {
                        navBarScript += "color: inherit;\n";
                    }
                }

                navBarScript += "}\n" +
                    "html.win-hoverable .customColor button:enabled:hover .win-commandimage,\n" +
                    "html.win-hoverable .customColor button[aria-checked=true]:enabled:hover .win-commandimage {\n";

                if (appBarButtonColor) {
                    navBarScript += "color: " + appBarButtonColor + ";\nopacity: .75;\n";
                }

                navBarScript += "}\n" +
                    ".customColor .win-commandring {\n";

                if (appBarButtonColor) {
                    navBarScript += "border-color: " + appBarButtonColor + ";\n";
                }

                navBarScript += "}\n" +
                    ".customColor button:active .win-commandring, \n" +
                    ".customColor button:enabled:hover:active .win-commandring.win-commandring{\n";

                if (appBarButtonColor) {
                    navBarScript += "background-color: " + appBarButtonColor + ";\nborder-color: " + appBarButtonColor + ";\n";
                }

                navBarScript += "}\n" +
                    ".customColor button:enabled:hover .win-commandring{\n";
                if (appBarButtonColor) {
                    navBarScript += "border-color: " + appBarButtonColor + " !important;\n";
                }
                if (appBarBackColor) {
                    navBarScript += "opacity: .75;\n";
                }

                navBarScript += "}\n" +
                    ".customColor .win-label {\n";

                if (appBarButtonColor) {
                    navBarScript += "color: " + appBarButtonColor + ";\n";
                }

                navBarScript += "}\n" +
                    ".customColor.win-appbar button:enabled.win-appbar-invokebutton.win-appbar-invokebutton .win-appbar-ellipsis,\n" +
                    ".customColor .submenu{\n";

                if(appBarButtonColor){
                    navBarScript += "color: " + appBarButtonColor + ";\n";
                }

                navBarScript += "}";
            }
        }

        if (navBarScript != "") {
            var cssFileStyleEl = document.createElement('style');
            document.head.appendChild(cssFileStyleEl);
            cssFileStyleEl.innerHTML = navBarScript;
        }
    }

    // Module Registration
    WAT.registerModule("styles", self);

})(window.WAT, window.Windows);