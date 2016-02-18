(function (WAT) {
    "use strict";

    
    // Public API
    var self = {

        start: function () {
            WAT.config.orientation = (WAT.config.orientation || {});

            if (WAT.config.orientation && typeof WAT.config.orientation === "string") {
                var orientation = WAT.config.orientation;
                switch (orientation) {
                    case "landscape":
                        var wgd = Windows.Graphics.Display;
                        wgd.DisplayInformation.autoRotationPreferences = wgd.DisplayOrientations.landscape | wgd.DisplayOrientations.landscapeFlipped;
                        break;
                    case "portrait":
                        var wgd = Windows.Graphics.Display;
                        wgd.DisplayInformation.autoRotationPreferences = wgd.DisplayOrientations.portrait | wgd.DisplayOrientations.portraitFlipped;
                        break;
                    case "portrait-primary":
                        var wgd = Windows.Graphics.Display;
                        wgd.DisplayInformation.autoRotationPreferences = wgd.DisplayOrientations.portrait;
                        break;
                    case "portrait-secondary":
                        var wgd = Windows.Graphics.Display;
                        wgd.DisplayInformation.autoRotationPreferences = wgd.DisplayOrientations.portraitFlipped;
                        break;
                    case "landscape-primary":
                        var wgd = Windows.Graphics.Display;
                        wgd.DisplayInformation.autoRotationPreferences = wgd.DisplayOrientations.portrait;
                        break;
                    case "landscape-secondary":
                        var wgd = Windows.Graphics.Display;
                        wgd.DisplayInformation.autoRotationPreferences = wgd.DisplayOrientations.landscapeFlipped;
                        break;
                    default:
                        break;
                }
            }
        }

    };


    // Module Registration
    WAT.registerModule("orientation", self);

})(window.WAT);
