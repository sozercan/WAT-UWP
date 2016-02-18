var phraseList = []; //cortana phrases

(function () {
    "use strict";

    var app = WinJS.Application;
    var activation = Windows.ApplicationModel.Activation;
    var cortanaArgs;

    app.onactivated = function (args) {
        if (args.detail.kind === activation.ActivationKind.voiceCommand) {
            // This application has been activated with a voice command.
            WAT.cortanaArgs = args.detail.result;
        }
    };

    app.start();

    WinJS.UI.Pages.define("/template/wat-wrapper.html", {
        // This function is called whenever a user navigates to this page. It
        // populates the page elements with the app's data.
        ready: function (element, options) {
            WinJS.Application.addEventListener("activated", WAT.activationHandler, false);
        
            WAT.init({
                configFile: "config/config.json",
                stage: document.getElementById("stage"),
                webView: document.getElementById("main-view"),
                offlineView: document.getElementById("offline-view"),
                dialogView: document.getElementById("dialog-view"),
                closeButton: document.getElementById("close"),
                loadingWrapper: document.getElementById("loading-wrapper"),
                // You can disable the extended splash screen by commenting out the line below...
                extendedSplashScreen: document.getElementById("extendedSplashScreen"),
                appBar: document.getElementById("appBar"),
                navBar: document.getElementById("splitView"),
                splitViewToggle: document.getElementById("splitViewToggle"),
                toolBar: document.getElementById("toolBar"),
                header: document.getElementById("header"),
                logo: document.getElementById("logo"),
                title: document.getElementById("title"),
                searchBox: document.getElementById("searchBox"),
                inkButton: document.getElementById("inkButton"),
                searchButton: document.getElementById("searchButton"),
                shareButton: document.getElementById("shareButton"),
                privacyButton: document.getElementById("privacyButton"),
                searchFlyout: document.getElementById("searchFlyout"),
                offlineMessage: document.getElementById("offlineMessage"),
                inkCanvas: document.getElementById("inkCanvas"),
            });

            var offlineMessageHide = document.getElementById("offlineMessageHide");
            var offlineMessageHideHandler = function () { document.getElementById("offlineMessage").style.display = 'none'; };
            offlineMessageHide.addEventListener("click", offlineMessageHideHandler);

            WinJS.UI.processAll();
        }
    });
})();
