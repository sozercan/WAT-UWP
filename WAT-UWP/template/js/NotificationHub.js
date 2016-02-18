(function (WAT) {
    "use strict";

    var settingKey = "Microsot.WindowsAzure.Messaging.WAT";

    var _nh = {
        start: function() {
        },

        NotificationHub: function (endpoint, sasKey, hubPath) {
            this.endpoint = endpoint;
            this.sasKey = sasKey;
            this.hubPath = hubPath;

            var applicationData = Windows.Storage.ApplicationData.current;
            var localSettings = applicationData.localSettings;

            if (!localSettings.containers.hasKey(settingKey)) {
                localSettings.createContainer(settingKey, Windows.Storage.ApplicationDataCreateDisposition.always);
            }
            this.container = localSettings.containers.lookup(settingKey);
        }
    };

    // constants
    var wnsNativeCreate = '<?xml version="1.0" encoding="utf-8"?><entry xmlns="http://www.w3.org/2005/Atom"><content type="application/xml"><WindowsRegistrationDescription xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.microsoft.com/netservices/2010/10/servicebus/connect">{0}<ChannelUri>{1}</ChannelUri></WindowsRegistrationDescription></content></entry>';
    var wnsTemplateCreate = '<?xml version="1.0" encoding="utf-8"?><entry xmlns="http://www.w3.org/2005/Atom"><content type="application/xml"><WindowsTemplateRegistrationDescription xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://schemas.microsoft.com/netservices/2010/10/servicebus/connect">{0}<ChannelUri>{1}</ChannelUri><BodyTemplate><![CDATA[{2}]]></BodyTemplate><WnsHeaders>{3}</WnsHeaders></WindowsTemplateRegistrationDescription></content></entry>';

    // utils

    var getSelfSignedToken = function (targetUri, sharedKey, ruleId, expiresInMins) {
        targetUri = 'http' + targetUri.substring(5);
        targetUri = encodeURIComponent(targetUri.toLowerCase()).toLowerCase();

        //Set expiration in seconds
        var expireOnDate = new Date();
        expireOnDate.setMinutes(expireOnDate.getMinutes() + expiresInMins);
        var expires = Date.UTC(expireOnDate.getUTCFullYear(), expireOnDate.getUTCMonth(), expireOnDate.getUTCDate(), expireOnDate.getUTCHours(), expireOnDate.getUTCMinutes(), expireOnDate.getUTCSeconds()) / 1000;

        var tosign = targetUri + '\n' + expires;

        // sign
        var cryptoBuffer = Windows.Security.Cryptography.CryptographicBuffer;
        var toSignUtf8 = cryptoBuffer.convertStringToBinary(tosign, Windows.Security.Cryptography.BinaryStringEncoding.utf8);
        var sha256Algorithm = Windows.Security.Cryptography.Core.MacAlgorithmProvider.openAlgorithm('HMAC_SHA256');
        var keyBuffer = Windows.Security.Cryptography.CryptographicBuffer.convertStringToBinary(sharedKey, Windows.Security.Cryptography.BinaryStringEncoding.utf8);
        var hmacKey = sha256Algorithm.createKey(keyBuffer);
        var signature = Windows.Security.Cryptography.Core.CryptographicEngine.sign(hmacKey, toSignUtf8);
        var base64UriSignature = encodeURIComponent(cryptoBuffer.encodeToBase64String(signature));

        //construct autorization string
        var token = "SharedAccessSignature sr=" + targetUri + "&sig=" + base64UriSignature + "&se=" + expires + "&skn=" + ruleId;

        console.log("signature:" + token);	
        return token;
    };

    var buildWnsHeaders = function (headers) {
        var xml = '';
        for (var header in headers) {
            if (headers.hasOwnProperty(header)) {
                xml += '<WnsHeader><Header>{0}</Header><Value>{1}</Value></WnsHeader>'.replace('{0}', header).replace('{1}', headers[header]);
            }
        }
        return xml;
    };

    // object: {location: '', channelUri: ''}
    var storeInContainer = function (hub, key, object) {
        hub.container.values[key] = JSON.stringify(object);
    };

    var deleteFromContainer = function (hub, key) {
        hub.container.values[key] = undefined;
    };

    var getFromContainer = function (hub, key) {
        if (typeof hub.container.values[key] === 'string') {
            return JSON.parse(hub.container.values[key]);
        }
        return undefined;
    };

    var buildCreatePayload = function (registration) {
        /*
           assuming:  
           tags,
           channelUri

           if template registration:
           assumes bodyTemplate AND wnsHeaders
       */

        var registrationPayload;

        // if bodytemplate != undefined use template
        if (typeof registration.bodyTemplate != 'undefined') {
            registrationPayload = wnsTemplateCreate.replace('{1}', registration.channelUri)
                .replace('{2}', registration.bodyTemplate).replace('{3}', buildWnsHeaders(registration.wnsHeaders));

            var tagstring = '';
            if (typeof registration.tags === 'object') {
                tagstring = '<Tags>' + registration.tags.join(',') + '</Tags>';
            }
            registrationPayload = registrationPayload.replace('{0}', tagstring);
        }
        else // native
        {
            registrationPayload = wnsNativeCreate.replace('{1}', registration.channelUri);
            var tagstring = '';
            if (typeof registration.tags === 'object') {
                tagstring = '<Tags>' + registration.tags.join(',') + '</Tags>';
            }
            registrationPayload = registrationPayload.replace('{0}', tagstring);
        }

        return registrationPayload;
    };

    var createRegistration = function (hub, registration) {

        var registrationPayload = buildCreatePayload(registration);

        var registrationPath = hub.hubPath + "/Registrations";

        var serverUrl = hub.endpoint + registrationPath + "?api-version=2013-04";

        console.log('url:' + serverUrl);
        console.log('payload:' + registrationPayload);

        var token = getSelfSignedToken(serverUrl, hub.sasKey, "DefaultListenSharedAccessSignature", 60);

        return new WinJS.xhr({
            type: "POST",
            url: serverUrl,
            headers: {
                "Content-Type": "application/xml",
                "Authorization": token
            },
            data: registrationPayload
        }).then(function (req) {
            console.log('status: ' + req.statusText);
            console.log('response: ' + req.response);
            console.log('headers: ' + req.getAllResponseHeaders());
            console.log('Location: ' + req.getResponseHeader("Content-Location"));

            var location = req.getResponseHeader("Content-Location");

            return WinJS.Promise.wrap(location);
        },
            function (req) {
                console.log('an error occurred: ' + req.statusText);

                return WinJS.Promise.wrapError(req.statusText);
            }
        );
    };

    var updateRegistration = function (hub, location, registration) {
        var registrationPayload = buildCreatePayload(registration);

        var serverUrl = location;

        console.log('url:' + serverUrl);
        console.log('payload:' + registrationPayload);

        var token = getSelfSignedToken(serverUrl, hub.sasKey, "DefaultListenSharedAccessSignature", 60);

        return new WinJS.xhr({
            type: "PUT",
            url: serverUrl,
            headers: {
                "Content-Type": "application/xml",
                "Authorization": token,
                "If-Match:": '*'
            },
            data: registrationPayload
        }).then(function (req) {
            console.log('status: ' + req.statusText);
            console.log('response: ' + req.response);

            var location = req.getResponseHeader("Content-Location");
            return WinJS.Promise.wrap(location);
        },
            function (req) {
                console.log('an error occurred: ' + req.statusText);

                return WinJS.Promise.wrapError(req.status);
            }
        );
    };

    var deleteRegistration = function (hub, location) {
        var serverUrl = location;

        console.log('url:' + serverUrl);

        var token = getSelfSignedToken(serverUrl, hub.sasKey, "DefaultListenSharedAccessSignature", 60);

        return new WinJS.xhr({
            type: "DELETE",
            url: serverUrl,
            headers: {
                "Content-Type": "application/xml",
                "Authorization": token,
                "If-Match": '*'
            },
        }).then(function (req) {
            console.log('status: ' + req.statusText);
            console.log('response: ' + req.response);

            return WinJS.Promise.wrap(req.statusText);
        },
            function (req) {
                console.log('an error occurred: ' + req.statusText);

                return WinJS.Promise.wrapError(req.statusText);
            }
        );
    };

    var register = function (hub, registration) {
        var channelUri = registration.channelUri;

        var tileKey = 'application';
        if (typeof registration.tileId != 'undefined') {
            tileKey = registration.tileId;
        }

        // create key
        var regKey = hub.endpoint + hub.hubPath + '/' + tileKey + '/' + registration.name;

        // if key exists
        var regInfo = getFromContainer(hub, regKey);
        if (typeof regInfo != 'undefined') {
            // update registration
            return updateRegistration(hub, regInfo.location, registration)
                .then(function (location) {
                    return WinJS.Promise.wrap(location);
                }, function (error) {
                    // if not exists / recreate
                    if (error === '404') {
                        return createRegistration(hub, registration);
                    }
                    return WinJS.Promise.wrapError(error);
                })
                .done(function (location) {
                    return WinJS.Promise.wrap(location);
                }, function (error) {
                    return WinJS.Promise.wrapError(error);
                });
        } else {
            // create new
            return createRegistration(hub, registration)
                .done(function (location) {
                    // update regInfo with new location
                    regInfo = {};
                    regInfo.location = location;
                    regInfo.channelUri = channelUri;
                    storeInContainer(hub, regKey, regInfo);

                    return WinJS.Promise.wrap(location);
                }, function (error) {
                    return WinJS.Promise.wrapError(error);
                });
        }
    };

    var unregister = function (hub, registration) {
        // create key
        var tileKey = 'application';
        if (typeof registration.tileId != 'undefined') {
            tileKey = registration.tileId;
        }

        // create key
        var regKey = hub.endpoint + hub.hubPath + '/' + tileKey + '/' + registration.name;

        var regInfo = getFromContainer(hub, regKey);
        if (typeof regInfo === 'undefined') return WinJS.Promise.wrap('OK');

        // delete regitration
        return deleteRegistration(hub, regInfo.location)
            .done(function (status) {
                deleteFromContainer(hub, regKey);
                return WinJS.Promise.wrap(status);
            }, function (error) {
                // not an error
                if (error === 'Not Found') {
                    deleteFromContainer(hub, regKey);
                    return WinJS.Promise.wrap(error);
                };
                return WinJS.Promise.wrapError(error);
            });
    };


    _nh.NotificationHub.prototype = {
        add: function (x, y) {
            this.result = x + y;
        },

        registerApplicationAsync: function (channelUri, tags) {
            register(this, {
                channelUri: channelUri,
                tags: tags,
                name: '$native'
            });
        },

        unregisterApplicationAsync: function () {
            unregister(this, {
                name: '$native'
            });
        },

        registerTemplateForApplicationAsync: function (channelUri, templateName, tags, wnsHeaders, bodyTemplate) {
            register(this, {
                channelUri: channelUri,
                tags: tags,
                name: templateName,
                wnsHeaders: wnsHeaders,
                bodyTemplate: bodyTemplate
            });
        },

        unregisterTemplateForApplicationAsync: function (templateName) {
            unregister(this, {
                name: templateName
            });
        },

        registerSecondaryTileAsync: function (tileId, channelUri, tags) {
            register(this, {
                tileId: tileId,
                channelUri: channelUri,
                tags: tags,
                name: '$native'
            });
        },

        unregisterSecondaryTileAsync: function (tileId) {
            unregister(this, {
                tileId: tileId,
                name: '$native'
            });
        },

        registerTemplateForSecondaryTileAsync: function (tileId, channelUri, templateName, tags, wnsHeaders, bodyTemplate) {
            register(this, {
                tileId: tileId,
                channelUri: channelUri,
                tags: tags,
                name: templateName,
                wnsHeaders: wnsHeaders,
                bodyTemplate: bodyTemplate
            });
        },

        unregisterTemplateForSecondaryTileAsync: function (tileId, templateName) {
            unregister(this, {
                tileId: tileId,
                name: templateName
            });
        }
    };

    // Module Registration
    WAT.registerModule("nh", _nh);

})(window.WAT);