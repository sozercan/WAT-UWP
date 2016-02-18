(function (WAT) {
    "use strict";

    // Private method declaration
    var setupShare, shareClickHandler, handleShareRequest, sharePage, makeLink, processScreenshot, getScreenshot,
        logger = window.console;

    // Public API
    var self = {
        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupShare();
        },

        processScreenshot: function (newFileStream) {
            return new WinJS.Promise(function (complete, error) {
                var captureOperation = WAT.options.webView.capturePreviewToBlobAsync();

                captureOperation.addEventListener("complete", function (e) {
                    // Get the screenshot
                    var inputStream = e.target.result.msDetachStream();
                    var canvas = WAT.options.inkCanvas;

                    var ink;
                    if (WAT.getModule("ink")) {
                        ink = WAT.getModule("ink");
                    }

                    if (ink.inkingMode) {
                        // overlaying webview background image before saving
                        ink.inkContext.globalCompositeOperation = "destination-over";
                        ink.inkContext.drawImage(ink.backgroundImage, 0, 0, canvas.width, canvas.height);

                        var imgData = ink.inkContext.getImageData(0, 0, canvas.width, canvas.height);
                        Windows.Graphics.Imaging.BitmapEncoder.createAsync(Windows.Graphics.Imaging.BitmapEncoder.pngEncoderId, newFileStream)
                            .done(function (encoder) {
                                //Set the pixel data in the encoder
                                encoder.setPixelData(Windows.Graphics.Imaging.BitmapPixelFormat.rgba8, Windows.Graphics.Imaging.BitmapAlphaMode.straight,
                                    canvas.width, canvas.height, 96, 96, new Uint8Array(imgData.data));
                                //Go do the encoding
                                encoder.flushAsync().done(function () {
                                    newFileStream.close()
                                    complete();
                                });
                            })
                    }
                    else {
                        Windows.Storage.Streams.RandomAccessStream.copyAsync(inputStream, newFileStream).then(function () {
                            newFileStream.flushAsync().done(function () {
                                inputStream.close();
                                newFileStream.close();
                                complete();
                            });
                        });
                    }
                });
                captureOperation.start();
            });
        },

        getScreenshot: function () {
            var screenshotFile;

            return new WinJS.Promise(function (complete, error) {

                if (!WAT.options.webView.capturePreviewToBlobAsync) {
                    // screen capturing not available, but we still want to share...
                    error(new Error("The capturing method (capturePreviewToBlobAsync) does not exist on the webview element"));
                    return;
                }

                // we create the screenshot file first...
                Windows.Storage.ApplicationData.current.temporaryFolder.createFileAsync("screenshot.png", Windows.Storage.CreationCollisionOption.replaceExisting)
                    .then(
                        function (file) {
                            // open the file for reading...
                            screenshotFile = file;
                            return file.openAsync(Windows.Storage.FileAccessMode.readWrite);
                        },
                        error
                    )
                    .then(self.processScreenshot, error)
                    .then(
                        function () {
                            complete(screenshotFile);
                        },
                        error
                    );
                });
            }
    };

    // Private methods
    setupShare = function () {
        var dataTransferManager;

        if (!WAT.config.share || WAT.config.share.enabled !== true) {

            WAT.options.shareButton.parentNode.removeChild(WAT.options.shareButton);
            return;
        }
        
        dataTransferManager = Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView();
        dataTransferManager.addEventListener("datarequested", handleShareRequest);

        WAT.options.shareButton.winControl.label = (WAT.config.share.buttonText || "Share");
        WAT.options.shareButton.addEventListener("click", shareClickHandler);
    };

    shareClickHandler = function () {
        Windows.ApplicationModel.DataTransfer.DataTransferManager.showShareUI();
    };

    handleShareRequest = function (e) {
        var deferral = e.request.getDeferral();
        var dataReq = e.request;
        var op = WAT.options.webView.invokeScriptAsync("eval", "if (document.body){ document.body.innerHTML.length.toString(); } else {'0'}");
        op.oncomplete = function (e) {
            if (e.target.result === "0") {
                // No page is loaded in the webview
                sharePage(dataReq, deferral, null);
            }
            else {
                if (WAT.config.share.screenshot) {
                    self.getScreenshot().then(
                        function (imageFile) {
                            sharePage(dataReq, deferral, imageFile);
                        },
                        function (err) {
                            // There was an error capturing, but we still want to share
                            logger.warn("Error capturing screenshot, sharing anyway", err);
                            sharePage(dataReq, deferral, null);
                        }
                    );
                } else {
                    sharePage(dataReq, deferral, null);
                }
            }
        }
        op.start();
    };

    makeLink = function (url, content) {
        if (content) {
            return "<a href=\"" + url + "\">" + content + "</a>";
        }
        else {
            return "<a href=\"" + url + "\">" + url + "</a>";
        }
    }

    sharePage = function (dataReq, deferral, imageFile) {
        var msg = WAT.config.share.message,
            shareUrl = WatExtensions.SuperCacheManager.resolveTargetUri(WAT.options.webView.src),
            currentURL = WAT.config.share.url.replace("{currentURL}", shareUrl),
            html = WAT.config.share.message;

        var displayName = (WAT.config.displayName || "");
        var currentApp = Windows.ApplicationModel.Store.CurrentApp;
        var appUri;
        try{
            appUri = currentApp.linkUri.absoluteUri;
        }
        catch(e) {
            appUri = "Unpublished app - no Store link is available";
        }

        msg = msg.replace("{url}", WAT.config.share.url).replace("{currentURL}", shareUrl).replace("{appUrl}", appUri).replace("{appLink}", displayName);
        html = html.replace("{currentUrl}", makeLink(WAT.config.share.url)).replace("{url}", makeLink(shareUrl)).replace("{appUrl}", makeLink(appUri)).replace("{appLink}", makeLink(appUri, displayName));

        var htmlFormat = Windows.ApplicationModel.DataTransfer.HtmlFormatHelper.createHtmlFormat(html);

        dataReq.data.properties.title = WAT.config.share.title;

        dataReq.data.setText(msg);

        dataReq.data.setHtmlFormat(htmlFormat);

        if (imageFile) {
            dataReq.data.setStorageItems([imageFile], true);
        }

        deferral.complete();
    };
    
    // Module Registration
    WAT.registerModule("share", self);

})(window.WAT);