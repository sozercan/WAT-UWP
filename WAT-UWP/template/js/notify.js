(function (WAT) {
    "use strict";

    // Private method declaration
    var setupNotifications,
        logger = window.console;

    // Public API
    var self = {

        start: function () {
            if (WAT.getModule("log")) {
                logger = WAT.getModule("log");
            }

            setupNotifications();
        },

        channelUri: {},

        hub: {},

        tagSubs: [],

        updateSubscription: function (tagId, subscribed) {
            // Update model
            for (var i = 0; i < self.tagSubs.length; i++) {
                if (self.tagSubs[i].id == tagId) {
                    self.tagSubs[i].subscribed = subscribed;
                    break;
                }
            }

            // Persist model to local storage/settings
            var applicationData = Windows.Storage.ApplicationData.current;
            var roamingSettings = applicationData.roamingSettings;
            roamingSettings.values["PushTag_" + tagId] = subscribed;

            // Create array of only subscribed tags to pass to notificaiton hub
            var subscribedTags = [];
            for (var i = 0; i < self.tagSubs.length; i++) {
                if (self.tagSubs[i].subscribed == true) {
                    subscribedTags.push(self.tagSubs[i].id);
                }
            }

            if (subscribedTags.length > 0) {
                self.hub.registerApplicationAsync(self.channelUri, subscribedTags);
            } else {
                self.hub.unregisterApplicationAsync();
            }
        }
    };

    // Private methods

    var TagSub = WinJS.Binding.define({
        id: "",
        tag: "",
        subscribed: false
    });

    setupNotifications = function () {
        if (!WAT.config.notifications || WAT.config.notifications.enabled !== true) {
            return;
        }

        if (WAT.config.notifications.azureNotificationHub && WAT.config.notifications.azureNotificationHub.enabled === true) {
            var applicationData = Windows.Storage.ApplicationData.current;
            var roamingSettings = applicationData.roamingSettings;
            var setting;
            var subscribedTags = [];

            // Get push hub tag subscriptions
            for (var i = 0; i < WAT.config.notifications.azureNotificationHub.tags.length; i++) {
                // Build array of models
                self.tagSubs.push(new TagSub({ id: WAT.config.notifications.azureNotificationHub.tags[i].replace(' ', '_'), tag: WAT.config.notifications.azureNotificationHub.tags[i], subscribed: true }));

                // Get value from local setting storage (if any)
                setting = roamingSettings.values["PushTag_" + self.tagSubs[i].id];
                if (setting != null) {
                    // Update model with setting
                    self.tagSubs[i].subscribed = setting;
                }

                // Create array of only subscribed tags to pass to notificaiton hub
                if (self.tagSubs[i].subscribed == true) {
                    subscribedTags.push(self.tagSubs[i].id);
                }
            }

            //var messaging = Microsoft.WindowsAzure.Messaging;
            var messaging = WAT.getModule("nh");

            // Register push notifcation channel
            self.hub = new messaging.NotificationHub(WAT.config.notifications.azureNotificationHub.endpoint,
                WAT.config.notifications.azureNotificationHub.secret, WAT.config.notifications.azureNotificationHub.path);
            var pushNotifications = Windows.Networking.PushNotifications;
            var channelOperation = pushNotifications.PushNotificationChannelManager.createPushNotificationChannelForApplicationAsync();

            channelOperation.then(function (newChannel) {
                self.channelUri = newChannel.uri;
                return newChannel.uri;
            }).then(function (channelUri) {
                if (subscribedTags.length > 0) {
                    return self.hub.registerApplicationAsync(channelUri, subscribedTags);
                }
            }).done();
        }
    };

    // Module Registration
    WAT.registerModule("notify", self);

})(window.WAT);