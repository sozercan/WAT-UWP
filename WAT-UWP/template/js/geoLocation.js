(function (WAT) {
    "use strict";

    var logger, utilities;

    // Public API
    var self = {

        enabled: false,

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            self.enabled = WAT.config.geoLocation && WAT.config.geoLocation.enabled;
            if (!self.enabled) { return; }

            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            var geolocator = new Windows.Devices.Geolocation.Geolocator();

            WAT.options.webView.addEventListener('MSWebViewContentLoading', function (e) {
                utilities.readScript("ms-appx:///template/js/geo/injectedGeoLocation.script").then(function (geoLocationScript) {

                    geolocator.getGeopositionAsync().then(function (position) {

                        geoLocationScript = geoLocationScript.replace("###LOCLAT###", position.coordinate.latitude);
                        geoLocationScript = geoLocationScript.replace("###LOCLONG###", position.coordinate.longitude);

                        var asyncOp = WAT.options.webView.invokeScriptAsync('eval', geoLocationScript);
                        asyncOp.start();
                    });
                });
            });
        }
    };

    // Module Registration
    WAT.registerModule("geo", self);

})(window.WAT);