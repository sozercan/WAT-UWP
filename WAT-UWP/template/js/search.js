(function (WAT) {
    "use strict";

    // Private method declaration
    var handleSearchQuery, toggleSearch,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            if (!WAT.config.search || WAT.config.search.enabled !== true || !WAT.config.search.searchURL) {
                document.getElementById("searchBox").style.display = "none";
                return;
            }

            WAT.options.searchFlyout.style.backgroundColor = WAT.config.header.backgroundColor;

            WAT.options.searchButton.addEventListener("click", toggleSearch);
            WAT.options.searchBox.winControl.addEventListener("querysubmitted", handleSearchQuery);
            WAT.options.searchBox.winControl.placeholderText = (WAT.config.search.onScreenSearchOptions.placeholderText || "Search");
        }
    };

    toggleSearch = function () {
        document.getElementById("searchFlyout").winControl.show(WAT.options.searchButton);
        document.getElementById("searchBox").focus();
    }

    handleSearchQuery = function (e) {
        var query = e.detail.queryText;
        var searchUrl = WAT.config.search.searchURL;
        WAT.goToLocation(searchUrl.replace("{searchTerm}", query));
    };

    // Module Registration
    WAT.registerModule("search", self);

})(window.WAT);