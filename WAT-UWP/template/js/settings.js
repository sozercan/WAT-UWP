(function (WAT) {
    "use strict";

    // Private method declaration
    var addSetting,
        addSettings,
        privacyHandler,
        logger = window.console;

    var rs = WinJS.Resources;

    // Public API
    var self = {
        active: false,
        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (WAT.config.settings &&
                WAT.config.settings.enabled &&
                WAT.config.settings.privacyUrl) {
                var privacy = rs.getString("privacy");

                WAT.options.privacyButton.addEventListener("click", privacyHandler);
            }

            addSettings();
        },

        navigateBack: function () {
            if (self.active) {
                return true;
            }

            return false;
        },


    };

    privacyHandler = function () {
        Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(WAT.config.settings.privacyUrl));
    }

    // Private methods
    addSetting = function (applicationCommands, label, callback) {
        if (!WAT.options.toolBar || !WAT.config.settings.enabled) {
            return;
        }

        var btn = document.createElement("button");
        btn.addEventListener("click", callback);
        btn.className += " win-command-button";

        new WinJS.UI.Command(btn, { label: label, section: 'secondary' });

        var toolbar = document.getElementsByClassName('win-toolbar-overflowarea')[0];
        toolbar.appendChild(btn);
    }

    addSettings = function (applicationCommands) {
        if (WAT.config.settings &&
            WAT.config.settings.enabled &&
            WAT.config.settings.items &&
            WAT.config.settings.items.length) {

            WAT.config.settings.items.forEach(function (item) {

                if (WAT.config.speech.cortana && WAT.config.speech.cortana.settings) {
                    phraseList.push(item.title); //adding setting items to cortana phrase list
                }

                addSetting(applicationCommands, item.title,
                    function () {
                        if (item.loadInApp === true) {
                            WAT.goToLocation(item.page);
                        } else {
                            Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(item.page));
                        }
                    });
                });
            }
    }



    // Module Registration
    WAT.registerModule("settings", self);

})(window.WAT);