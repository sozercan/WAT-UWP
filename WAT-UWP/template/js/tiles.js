(function (WAT) {
    "use strict";

    // Private method declaration
    var setupLiveTile, checkSiteforMetaData, processLiveTileMetaTags, setupTileFeed,
        setupPinning, pinHandler, secondaryPin, download,
        logger = window.console;

    // Public API
    var self = {

        // These match the values in Windows.UI.Notifications.PeriodicUpdateRecurrence
        periodicUpdateRecurrence: [30, 60, 360, 720, 1440],

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupLiveTile();
            setupPinning();
        }

    };

    // Private methods

    setupLiveTile = function () {
        if (!WAT.config.livetile || WAT.config.livetile.enabled !== true) {
            return;
        }

        WAT.config.livetile.enableQueue = !!WAT.config.livetile.enableQueue;

        // Enable Notifications Queue - The tile will cycle through the multple tile notifications
        var notifications = Windows.UI.Notifications;
        notifications.TileUpdateManager.createTileUpdaterForApplication().enableNotificationQueue(WAT.config.livetile.enableQueue);

        if (WAT.config.livetile.tilePollFeed) {
            // Did they give us a feed to poll?
            setupTileFeed(WAT.config.livetile.tilePollFeed);
        } else {
            // If they didn't give us a specific feed, we'll see if the loaded 
            // webview has any live tile meta tags
            WAT.options.webView.addEventListener("MSWebViewDOMContentLoaded", checkSiteforMetaData);
        }
    };

    checkSiteforMetaData = function () {
        var scriptString, exec;

        logger.log("looking for meta tags in webview...");

        WAT.options.webView.addEventListener("MSWebViewScriptNotify", processLiveTileMetaTags);

        scriptString = "var meta = document.querySelector('meta[name=msapplication-notification]');" +
                       "if (meta) { window.external.notify('TILEMETA~~' + meta.content); }";

        exec = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        exec.start();

        WAT.options.webView.removeEventListener("MSWebViewDOMContentLoaded", checkSiteforMetaData);

        /*
        META TAG EXAMPLE

        <meta name="application-name" content="Foobar"/>
        <meta name="msapplication-TileColor" content="#8f398f"/>
        <meta name="msapplication-square70x70logo" content="tiny.png"/>
        <meta name="msapplication-square150x150logo" content="square.png"/>
        <meta name="msapplication-wide310x150logo" content="wide.png"/>
        <meta name="msapplication-square310x310logo" content="large.png"/>
        <meta name="msapplication-notification" content="frequency=30;polling-uri=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=1;polling-uri2=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=2;polling-uri3=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=3;polling-uri4=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=4;polling-uri5=http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&amp;id=5; cycle=1"/>

        -OR-
        <meta name="application-name" content="Foobar"/>
        plus "browserconfig.xml":
        <browserconfig>
            <msapplication>
                <tile>
                    <square70x70logo src="tiny.png"/>
                    <square150x150logo src="square.png"/>
                    <wide310x150logo src="wide.png"/>
                    <square310x310logo src="large.png"/>
                    <TileColor>#8f398f</TileColor>
                </tile>
                <notification>
                    <polling-uri src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=1"/>
                    <polling-uri2 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=2"/>
                    <polling-uri3 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=3"/>
                    <polling-uri4 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=4"/>
                    <polling-uri5 src="http://notifications.buildmypinnedsite.com/?feed=http://www.npr.org/rss/rss.php?id=1001&id=5"/>
                    <frequency>30</frequency>
                    <cycle>1</cycle>
                </notification>
            </msapplication>
        </browserconfig>
        */
    };

    processLiveTileMetaTags = function (e) {
        var content, feedURL, recurrence;

        content = e.value.split(/~~/);
        if (content.length !== 2 || content[0] !== "TILEMETA") {
            // oops, this isn't ours
            return;
        }

        logger.log("captured script notify event for livetile polling feed: ", e.value);

        content = content[1].split(/;/);
        content.forEach(function (value) {
            var option = value.split(/=/);
            if (option[0] === "polling-uri") {
                feedURL = option[1];
            } else if (option[0] === "frequency" && WAT.config.livetile.periodicUpdate === undefined) {
                WAT.config.livetile.periodicUpdate = Math.max(0, self.periodicUpdateRecurrence.indexOf(option[1]));
            }
        });

        WAT.options.webView.removeEventListener("MSWebViewScriptNotify", processLiveTileMetaTags);

        setupTileFeed(feedURL);
    };

    setupTileFeed = function (feedURL) {
        var n, updater, address, urisToPoll,
            recurrence = Windows.UI.Notifications.PeriodicUpdateRecurrence.halfHour;

        if (feedURL.splice) {
            // we already have an array of feeds, use it!
            urisToPoll = feedURL;
        } else {
            urisToPoll = [];

            for (n = 0; n < 5; ++n) {
             //   address = "http://discourse.azurewebsites.net/FeedTile.ashx?index=" +
              //            String(n) +
                //           "&url=" + encodeURIComponent(feedURL);
                address = 'http://notifications.buildmypinnedsite.com/?feed=' + encodeURIComponent(feedURL) + '&id=' + n.toString();
                try {
                    urisToPoll.push(new Windows.Foundation.Uri(address));
                } catch (err) {
                    // broken address, never mind
                    logger.warn("Unable to load live tile feed URL: " + feedURL, err);
                    return;
                }
            }
        }

        try {
            updater = Windows.UI.Notifications.TileUpdateManager.createTileUpdaterForApplication();
            updater.clear();
            updater.stopPeriodicUpdate();

            if (WAT.config.livetile.periodicUpdate !== undefined) {
                recurrence = WAT.config.livetile.periodicUpdate;
            }

            updater.startPeriodicUpdateBatch(urisToPoll, recurrence);

        } catch (e) {
            // Tile APIs are flaky.. they sometimes fail for no readily apparent reason
            // but that's no reason to crash and risk a 1-star
            logger.warn("Error setting up live tile", e);
        }
    },

    setupPinning = function () {
        var btn,
            buttonText = "Pin this screen";

        if (!WAT.config.secondaryPin || WAT.config.secondaryPin.enabled !== true || !WAT.options.appBar) {
            return;
        }

        if (WAT.config.secondaryPin.buttonText) {
            buttonText = WAT.config.secondaryPin.buttonText;
        }

        var section = (WAT.config.secondaryPin.buttonSection || "primary");

        btn = document.createElement("button");

        new WinJS.UI.AppBarCommand(btn, { label: buttonText, icon: "pin", section: section });

        btn.className = "win-disposable win-command win-global";
        btn.setAttribute("role", "menuitem");
        btn.setAttribute("id", "pinButton");
        btn.addEventListener("click", pinHandler);

        WAT.options.appBar.appendChild(btn);
    };


    pinHandler = function () {
        var squareLogoUri, wideLogoUri, wideLogoPath,
            displayName = WAT.options.webView.documentTitle, tileId,
            squareLogoPath = "/images/storelogo.png";

        if (displayName === "") {
            displayName = WAT.config.displayName;
        }

        tileId = (displayName + Math.random().toString()).replace(/[^a-z0-9\s]/gi, '').replace(/[_\s]/g, '-').substring(0, 63);

        var scriptString = "(function() {" +
                             "var el = document.querySelector('" + WAT.config.secondaryPin.customImageSelector + "');" +
                             "return el ? el.src : '';" +
                           "})();";

        var asyncOp = WAT.options.webView.invokeScriptAsync("eval", scriptString);
        asyncOp.oncomplete = function (scriptArg) {
            if (scriptArg.target.result) {
                download(scriptArg.target.result, tileId).then(function () {
                    squareLogoUri = wideLogoUri = new Windows.Foundation.Uri("ms-appdata:///Local/" + tileId);
                    secondaryPin(tileId, displayName, squareLogoUri, wideLogoUri);
                });
            }
            else {
                if (WAT.config.secondaryPin.squareImage) {
                    squareLogoPath = ((/^\//.test(WAT.config.secondaryPin.squareImage)) ? "" : "/") + WAT.config.secondaryPin.squareImage;
                }
                squareLogoUri = new Windows.Foundation.Uri("ms-appx://" + squareLogoPath);

                if (WAT.config.secondaryPin.wideImage) {
                    wideLogoPath = ((/^\//.test(WAT.config.secondaryPin.wideImage)) ? "" : "/") + WAT.config.secondaryPin.wideImage;
                    wideLogoUri = new Windows.Foundation.Uri("ms-appx://" + wideLogoPath);
                }

                secondaryPin(tileId, displayName, squareLogoUri, wideLogoUri);
            }
        };

        asyncOp.start();
    };

    secondaryPin = function (tileId, displayName, squareLogoUri, wideLogoUri) {
        var secondaryTile = new Windows.UI.StartScreen.SecondaryTile(
                tileId,
                displayName,
                displayName,
                WatExtensions.SuperCacheManager.resolveTargetUri(WAT.options.webView.src),
                (Windows.UI.StartScreen.TileOptions.showNameOnLogo | Windows.UI.StartScreen.TileOptions.showNameOnWideLogo),
                squareLogoUri,
                wideLogoUri
            );

        if (WAT.config.secondaryPin.tileTextTheme === "light") {
            secondaryTile.visualElements.foregroundText = Windows.UI.StartScreen.ForegroundText.light;
        }
        if (WAT.config.secondaryPin.tileTextTheme === "dark") {
            secondaryTile.visualElements.foregroundText = Windows.UI.StartScreen.ForegroundText.dark;
        }

        var selectionRect = document.getElementById("pinButton").getBoundingClientRect();

        secondaryTile.requestCreateForSelectionAsync(
            {
                x: selectionRect.left,
                y: selectionRect.top,
                width: selectionRect.width,
                height: selectionRect.height
            },
            Windows.UI.Popups.Placement.below
        );
    };

    download = function (imgUrl, imgName) {
        return WinJS.xhr({ url: imgUrl, responseType: "blob" }).then(function (result) {
            var blob = result.response;
            var applicationData = Windows.Storage.ApplicationData.current;
            var folder = applicationData.localFolder;
            return folder.createFileAsync(imgName, Windows.Storage.
                   CreationCollisionOption.replaceExisting).then(function (file) {
                       return file.openAsync(Windows.Storage.FileAccessMode.readWrite).
                            then(function (stream) {
                                return Windows.Storage.Streams.RandomAccessStream.copyAsync
                                    (blob.msDetachStream(), stream).then(function () {
                                        return stream.flushAsync().then(function () {
                                            stream.close();
                                        });
                                    });
                            });
                   });
        }, function (e) {
        });
    };



    // Module Registration
    WAT.registerModule("tiles", self);

})(window.WAT);