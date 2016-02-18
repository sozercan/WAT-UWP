(function (WAT) {
    "use strict";

    var inkManager, penID = -1;

    var handlePointerDown, handlePointerMove, handlePointerUp, handlePointerOut, renderAllStrokes, renderStroke,
        toColorString, byteHex, printWebViewToDiskThenDisplay, saveImageToDisk, toggleInking, setupInking, handleResize, setStrokeStyle;

    var self = {
        inkingMode: false,
        backgroundImage: null,
        inkContext: null,

        start: function () {

            if (!WAT.config.ink || !WAT.config.ink.enabled || !WAT.config.header || !WAT.config.header.enabled) {
                WAT.options.inkButton.parentNode.removeChild(WAT.options.inkButton);
                WAT.options.inkCanvas.parentNode.removeChild(WAT.options.inkCanvas);
                return;
            }

            setupInking();

            window.addEventListener("resize", handleResize);
        }
    };

    handleResize = function (eventArgs) {
        WAT.options.inkCanvas.width = WAT.options.stage.offsetWidth;
        WAT.options.inkCanvas.height = WAT.options.stage.offsetHeight;

        setStrokeStyle();
    }

    setupInking = function () {

        WAT.options.inkCanvas.width = WAT.options.webView.offsetWidth;
        WAT.options.inkCanvas.height = WAT.options.webView.offsetHeight;

        inkManager = new Windows.UI.Input.Inking.InkManager();
        var drawingAttributes = new Windows.UI.Input.Inking.InkDrawingAttributes();
        drawingAttributes.fitToCurve = true;
        inkManager.setDefaultDrawingAttributes(drawingAttributes);
        inkManager.mode = Windows.UI.Input.Inking.InkManipulationMode.inking;

        var inkCanvas = document.getElementById("inkCanvas");
        inkCanvas.setAttribute("width", inkCanvas.offsetWidth);
        inkCanvas.setAttribute("height", inkCanvas.offsetHeight);
        setStrokeStyle();

        inkCanvas.addEventListener("pointerdown", handlePointerDown, false);
        inkCanvas.addEventListener("pointerup", handlePointerUp, false);
        inkCanvas.addEventListener("pointermove", handlePointerMove, false);
        inkCanvas.addEventListener("pointerout", handlePointerOut, false);

        document.getElementById("inkButton").addEventListener("click", toggleInking);
    }

    setStrokeStyle = function () {
        self.inkContext = inkCanvas.getContext("2d");
        self.inkContext.lineWidth = 5;
        self.inkContext.strokeStyle = "Red";
        self.inkContext.lineCap = "round";
        self.inkContext.lineJoin = "round";
    }

    toggleInking = function () {
        if (self.inkingMode == false) {
            self.inkingMode = true;
            WAT.options.inkCanvas.style.display = 'block';

            printWebViewToDiskThenDisplay();
            inkButton.winControl.icon = 'clear';
        }
        else {
            self.inkingMode = false;
            inkButton.winControl.icon = 'edit';

            // clear all ink
            inkManager.getStrokes().forEach(function (stroke) {
                stroke.selected = true;
            });
            inkManager.deleteSelected();
            renderAllStrokes();

            WAT.options.inkCanvas.style.display = 'none';
            WAT.options.webView.style.display = "block";
        }
    }

    printWebViewToDiskThenDisplay = function () {
        Windows.Storage.ApplicationData.current.localFolder.createFileAsync("webview.png", Windows.Storage.CreationCollisionOption.replaceExisting).then(function (file) {
            file.openAsync(Windows.Storage.FileAccessMode.readWrite).then(function (stream) {
                var capturePreview = WAT.options.webView.capturePreviewToBlobAsync();
                capturePreview.oncomplete = function (completeEvent) {
                    var inputStream = completeEvent.target.result.msDetachStream();
                    Windows.Storage.Streams.RandomAccessStream.copyAsync(inputStream, stream).then(function () {
                        stream.flushAsync().done(function () {
                            inputStream.close();
                            stream.close();
                            var image = new Image();
                            image.width = WAT.options.inkCanvas.width;
                            image.height = WAT.options.inkCanvas.height;

                            image.src = URL.createObjectURL(file);
                            self.backgroundImage = image;

                            WAT.options.inkCanvas.style.backgroundImage = "url(" + image.src + ");";
                            WAT.options.inkCanvas.style.backgroundSize = "100% 100%";

                            WAT.options.webView.style.display = "none";
                            document.getElementsByClassName("webview-overlay")[0].style.display = "none";
                        });
                    });
                };
                capturePreview.start();
            });
        });
    }

    handlePointerDown = function (evt) {
        if ((evt.pointerType === "pen") || (evt.pointerType === "touch") || ((evt.pointerType === "mouse") && (evt.button === 0))) {
            // Anchor and clear any current selection.
            var pt = { x: 0.0, y: 0.0 };
            inkManager.selectWithLine(pt, pt);

            pt = evt.currentPoint;

            self.inkContext.beginPath();
            self.inkContext.moveTo(pt.rawPosition.x, pt.rawPosition.y);

            inkManager.processPointerDown(pt);
            penID = evt.pointerId;
        }
    }

    handlePointerMove = function (evt) {
        if (evt.pointerId === penID) {
            var pt = evt.currentPoint;
            self.inkContext.lineTo(pt.rawPosition.x, pt.rawPosition.y);
            self.inkContext.stroke();
            // Get all the points we missed and feed them to inkManager.
            // The array pts has the oldest point in position length-1; the most recent point is in position 0.
            // Actually, the point in position 0 is the same as the point in pt above (returned by evt.currentPoint).
            var pts = evt.intermediatePoints;
            for (var i = pts.length - 1; i >= 0 ; i--) {
                inkManager.processPointerUpdate(pts[i]);
            }
        }
    }

    handlePointerUp = function (evt) {
        if (evt.pointerId === penID) {
            penID = -1;
            var pt = evt.currentPoint;
            self.inkContext.lineTo(pt.rawPosition.x, pt.rawPosition.y);
            self.inkContext.stroke();
            self.inkContext.closePath();

            var rect = inkManager.processPointerUp(pt);

            renderAllStrokes();
        }
    }

    // We treat the event of the pen leaving the canvas as the same as the pen lifting;
    // it completes the stroke.
    handlePointerOut = function (evt) {
        if (evt.pointerId === penID) {
            var pt = evt.currentPoint;
            self.inkContext.lineTo(pt.rawPosition.x, pt.rawPosition.y);
            self.inkContext.stroke();
            self.inkContext.closePath();
            inkManager.processPointerUp(pt);
            penID = -1;
            renderAllStrokes();
        }
    }

    renderAllStrokes = function() {
        self.inkContext.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
        inkManager.getStrokes().forEach(function (stroke) {
            var att = stroke.drawingAttributes;
            var strokeSize = att.size;
            var ctx = self.inkContext;
            renderStroke(stroke, ctx);
        });
    }

    renderStroke = function (stroke, ctx) {
        ctx.save();
        ctx.beginPath();

        var first = true;
        stroke.getRenderingSegments().forEach(function (segment) {
            if (first) {
                ctx.moveTo(segment.position.x, segment.position.y);
                first = false;
            } else {
                ctx.bezierCurveTo(segment.bezierControlPoint1.x, segment.bezierControlPoint1.y,
                                    segment.bezierControlPoint2.x, segment.bezierControlPoint2.y,
                                    segment.position.x, segment.position.y);
            }
        });

        ctx.stroke();
        ctx.closePath();
        ctx.restore();
    }

    // helper functions
    toColorString = function(color) {
        return "#" + byteHex(color.r) + byteHex(color.g) + byteHex(color.b);
    }

    byteHex = function (num) {
        var hex = num.toString(16);
        if (hex.length === 1) {
            hex = "0" + hex;
        }
        return hex;
    }

    // Module Registration
    WAT.registerModule("ink", self);

})(window.WAT);