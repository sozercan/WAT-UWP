(function () {
    geoLocationInterceptor = {
        Intercept: function (order, webView) {
            var utilities;
            if (WAT.getModule("utilities")) {
                utilities = WAT.getModule("utilities");
            }

            switch (order.type) {
                case "GEO":
                    navigator.geolocation.getCurrentPosition(function (position) {
                        utilities.sendDataBackToWebview(webView, "getGeoCallbacks", { error: 0, position: position });
                    }, function() {
                        utilities.sendDataBackToWebview(webView, "getGeoCallbacks", { error: 1 });
                    });
                    break;
            }
        }
    };
})();