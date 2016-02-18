(function () {
    var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
    var db = null;

    var utilities;
    if (WAT.getModule("utilities")) {
        utilities = WAT.getModule("utilities");
    }

    var openDataBase = function (details, callbackId, webView) {
        var request = indexedDB.open(details.name, (details.version ? parseFloat(details.version) : 1.0));

        request.onerror = function (event) {
            var response = {
                callbackId: callbackId,
                event: "onerror",
                target: event.target
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };

        // executes when a version change transaction cannot complete due to other active transactions
        request.onblocked = function (event) {
            var response = {
                callbackId: callbackId,
                event: "onblocked",
                target: event.target
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };

        // DB has been opened successfully
        request.onsuccess = function () {
            db = request.result;
            var response = {
                callbackId: callbackId,
                event: "onsuccess",
                stores: db.objectStoreNames
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };

        // Initialization of the DB. Creating stores
        request.onupgradeneeded = function (event) {
            db = event.target.result;

            for (var index = 0; index < details.stores.length; index++) {
                var store = details.stores[index];
                db.createObjectStore(store.name, store.def);
            }

        };
    };

    var openCursor = function (details, callbackId, webView) {
        var objectStore = db.transaction(details.name).objectStore(details.name);
        var request = objectStore.openCursor();
        var currentPosition = 0;

        request.onsuccess = function (event) {
            var cursor = event.target.result;

            if (cursor && currentPosition !== details.position) {
                currentPosition = details.position;
                cursor.advance(details.position);
                return;
            }

            var response = {
                callbackId: callbackId,
                event: "onsuccess",
                value: cursor ? cursor.value : null,
                position: details.position,
                name: details.name
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };

        request.onerror = function (event) {
            var response = {
                callbackId: callbackId,
                event: "onerror",
                target: event.target
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };
    };

    var startTransaction = function (details, callbackId, webView) {
        var transaction = db.transaction(details.name, details.mode);

        // the transaction could abort because of a QuotaExceededError error
        transaction.onabort = function (event) {
            var response = {
                callbackId: callbackId,
                event: "onabort",
                target: event.target
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };

        transaction.oncomplete = function () {
            var response = {
                callbackId: callbackId,
                event: "oncomplete"
            };

            var responseString = JSON.stringify(response);

            // Send back to webview
            utilities.sendDataBackToWebview(webView, "getIdbCallbacks", responseString);
        };

        // Process orders
        var stores = {};
        for (var index = 0; index < details.orders.length; index++) {
            var command = details.orders[index];
            var store;

            if (stores[command.store] === undefined) {
                stores[command.store] = transaction.objectStore(command.store);
            }

            store = stores[command.store];

            switch (command.order) {
                case "CLEAR":
                    store.clear();
                    break;
                case "PUT":
                    store.put(command.value);
                    break;
                case "DELETE":
                    store.delete(command.id);
                    break;
            }
        }

    };

    IDBInterceptor = {
        Intercept: function (order, webView) {
            switch (order.method) {
                case "OPEN":
                    openDataBase(order.details, order.callbackId, webView);
                    break;
                case "OPENCURSOR":
                    openCursor(order.details, order.callbackId, webView);
                    break;
                case "TRANSACTION":
                    startTransaction(order.details, order.callbackId, webView);
                    break;
            }
        }
    };
})();