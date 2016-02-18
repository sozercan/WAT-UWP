(function (WAT) {
    "use strict";

    var requestMicrophonePermission, initializeRecognizer, continuousRecoFn, onSpeechRecognizerResultGenerated, parseVoiceCommands, speechButtonHandler;
    var recognizer;

    var self = {

        parseSpeech: function(cortanaArgs, searchTerm) { parseVoiceCommands(cortanaArgs, searchTerm); },

        start: function () {
            if (!WAT.config.speech.inAppSpeech && !WAT.config.speech.inAppSpeech.enabled) {
                return;
            }

            requestMicrophonePermission().then(function (available) {
                if (available) {
                    initializeRecognizer();
                    setTimeout(function () { continuousRecoFn() }, 1000);
                }
                else {
                    console.log("Microphone unavailable, check microphone privacy settings.");
                }
            });
        }
    };

    requestMicrophonePermission = function () {
        return new WinJS.Promise(function (completed, error) {
            try {
                // Only check microphone access for speech, we don't need webcam access.
                var captureSettings = new Windows.Media.Capture.MediaCaptureInitializationSettings();
                captureSettings.streamingCaptureMode = Windows.Media.Capture.StreamingCaptureMode.audio;
                captureSettings.mediaCategory = Windows.Media.Capture.MediaCategory.speech;

                var capture = new Windows.Media.Capture.MediaCapture();
                capture.initializeAsync(captureSettings).then(function () {
                    completed(true);
                });
            } catch (exception) {
                console.log("Media Player components not available on this system.");
            }
        });
    }

    // Initialize speech recognizer and compile constraints.
    initializeRecognizer = function() {
        if (typeof recognizer !== 'undefined') {
            recognizer = null;
        }
        recognizer = Windows.Media.SpeechRecognition.SpeechRecognizer();
        recognizer.continuousRecognitionSession.addEventListener('resultgenerated', onSpeechRecognizerResultGenerated, false);

        var phrases = phraseList;
        phrases.push("back");

        if (WAT.config.speech.inAppSpeech.search) {
            phrases.push("search");
        }

        recognizer.constraints.append(Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint(phrases));

        recognizer.compileConstraintsAsync();
    }

    continuousRecoFn = function () {
        if (recognizer.state != Windows.Media.SpeechRecognition.SpeechRecognizerState.idle) { // Check if the recognizer is listening or going into a state to listen.
            recognizer.continuousRecognitionSession.stopAsync();
        }

        // Start the continuous recognition session. Results are handled in the event handlers below.
        try {
            recognizer.continuousRecognitionSession.startAsync();
        }
        catch (e) {
        }
    }

    // takes action from voice commands
    parseVoiceCommands = function (textSpoken, searchTerm) {

        WAT.config.navBar.buttons.forEach(function (item) {
            textSpoken = textSpoken.toLowerCase();

            if (textSpoken.indexOf((item.label).toLowerCase()) != -1) {
                switch (item.action) {
                    case "home":
                        WAT.goToLocation(WAT.config.baseUrl);
                        break;
                    case "eval":
                        break;
                    case "back":
                        WAT.options.webView.goBack();
                        break;
                    case "nested":
                        break;
                    default:
                        WAT.goToLocation(item.action);
                        break;
                }
                return;
            }
        });

        WAT.config.settings.items.forEach(function (item) {
            if (textSpoken.indexOf((item.title).toLowerCase()) != -1) {
                if (item.loadInApp === true) {
                    WAT.goToLocation(item.page);
                } else {
                    Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri(item.page));
                }
                return;
            }
        });

        WAT.config.appBar.buttons.forEach(function (item) {
            if (textSpoken.indexOf((item.label).toLowerCase()) != -1) {
                switch (item.action) {
                    case "settings":
                        WAT.options.webView.navigate("ms-appx-web:///template/settings.html");
                        break;
                    default:
                        WAT.goToLocation(item.action);
                        break;
                }
                return;
            }
        });

        if (textSpoken == "back") {
            WAT.options.webView.goBack();
            return;
        }

        if (textSpoken.indexOf("search") != -1) {
            if (WAT.config.search && WAT.config.search.enabled && WAT.config.search.searchURL && WAT.config.speech.cortana.search) {

                var searchUrl = WAT.config.search.searchURL;

                if (searchTerm != undefined) { // cortana
                    WAT.goToLocation(searchUrl.replace("{searchTerm}", searchTerm));
                }
                else { // in-app speech
                    recognizer.continuousRecognitionSession.stopAsync();

                    var searchRecognizer = Windows.Media.SpeechRecognition.SpeechRecognizer();

                    var webSearchConstraint = new Windows.Media.SpeechRecognition.SpeechRecognitionTopicConstraint(Windows.Media.SpeechRecognition.SpeechRecognitionScenario.webSearch, "websearch");

                    searchRecognizer.constraints.append(webSearchConstraint);
                    searchRecognizer.uiOptions.exampleText = WAT.config.search.onScreenSearchOptions.placeholderText;
                    searchRecognizer.uiOptions.isReadBackEnabled = false;

                    searchRecognizer.compileConstraintsAsync();

                    try {
                        setTimeout(function () {
                            searchRecognizer.recognizeWithUIAsync().then(
                                function (result) {
                                    // If successful, display the recognition result.
                                    if (result.status == Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus.success) {
                                        var searchText = result.text;

                                        WAT.goToLocation(searchUrl.replace("{searchTerm}", searchText));

                                        recognizer.continuousRecognitionSession.startAsync();
                                    }
                                });
                        }, 1000);
                    }
                    catch (e) { }
                }
                return;
            }
        }
    }

    onSpeechRecognizerResultGenerated = function(eventArgs) {
        if (eventArgs.result.confidence == Windows.Media.SpeechRecognition.SpeechRecognitionConfidence.high ||
            eventArgs.result.confidence == Windows.Media.SpeechRecognition.SpeechRecognitionConfidence.medium) {
            parseVoiceCommands(eventArgs.result.text);
        }
    }

// Module Registration
WAT.registerModule("speech", self);

})(window.WAT);