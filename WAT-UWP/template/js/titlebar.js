(function (WAT) {
    "use strict";

    var self = {
        start: function () {
            var titleBarBackgroundColor;
            var titleBarForegroundColor;

            if (WAT.config.titlebar.backgroundColor && WAT.config.titlebar.foregroundColor) {
                var titleBarBackgroundColor = WAT.config.titlebar.backgroundColor;
                var titleBarForegroundColor = WAT.config.titlebar.foregroundColor;
            }
            var rgbBackgroundColor = hexToRgb(titleBarBackgroundColor);
            var rgbForegroundColor = hexToRgb(titleBarForegroundColor);

            function changeColors() {
                titleBar.backgroundColor = { a: 255, r: rgbBackgroundColor.r, g: rgbBackgroundColor.g, b: rgbBackgroundColor.b };
                titleBar.foregroundColor = { a: 255, r: rgbForegroundColor.r, g: rgbForegroundColor.g, b: rgbForegroundColor.b };

                titleBar.inactiveBackgroundColor = { a: 255, r: rgbBackgroundColor.r, g: rgbBackgroundColor.g, b: rgbBackgroundColor.b };
                titleBar.inactiveForegroundColor = { a: 255, r: rgbForegroundColor.r, g: rgbForegroundColor.g, b: rgbForegroundColor.b };

                titleBar.buttonBackgroundColor = { a: 255, r: rgbBackgroundColor.r, g: rgbBackgroundColor.g, b: rgbBackgroundColor.b };
                titleBar.buttonForegroundColor = { a: 255, r: rgbForegroundColor.r, g: rgbForegroundColor.g, b: rgbForegroundColor.b };
            }

            function hexToRgb(hex) {
                var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : null;
            }

            var titleBar = Windows.UI.ViewManagement.ApplicationView.getForCurrentView().titleBar;

            if (titleBar) {
                changeColors();
            }
        }
    }

    // Module Registration
    WAT.registerModule("titlebar", self);
})(window.WAT);
