
(function (WAT, WinJS) {
    "use strict";

    // Private method declaration
    var overrideConsoleMethods, wrapConsoleMethod,
        determineLogFilename, cleanFileLogs, createLogFile, getLogFileFolder, logFileReady, deleteOldestFile,
        serialize, logHandler, writeLog, writeToFile, logFile, logFileFolder,
        writingToFile = false,
        logFileQueue = [],
        levels = ["log", "perf", "info", "warn", "error"],
        consoleMethods = {
            // The IE console object only has certain methods, so we duplicate some...
            "log": "log",
            "perf": "log",
            "info": "info",
            "warn": "warn",
            "error": "error"
        };

    WAT._console = window.console; // cache the original console object

    // Public API
    var self = {

        // default values
        level: 2,
        fileLevel: 3,
        maxLogFiles: 8, // use -1 in the config.json file to keep all
        filename: "app_%W.log",
        // Supported log filename entities (for log rolling):
        //   %D Day (YYYY-MM-DD)
        //   %W Week (YYYY-W)
        //   %m Month (YYYY-MM)
        fileLineFormat: "%D %T [%L] %M (%t)",
        // Supported log file entities:
        //   %D Date in YYYY-MM-DD format
        //   %f Filename from originating function call
        //   %L Log level in (printed in uppercase)
        //   %l Line number from originating file
        //   %M Log message
        //   %T Time in HH:ii:ss format
        //   %t Message tags

        start: function () {
            if (!WAT.config.logging || WAT.config.logging.enabled === false) {
                WinJS.Utilities.stopLog();
                return;
            }

            if (Number(WAT.config.logging.level) || WAT.config.logging.level === 0) {
                self.level = Math.max(0, Number(WAT.config.logging.level));
            } else if (WAT.config.logging.level && levels.indexOf(WAT.config.logging.level) > -1) {
                self.level = levels.indexOf(WAT.config.logging.level);
            }

            if (WAT.config.logging.disableWithoutDebugger && !Debug.debuggerEnabled) {
                self.warn("No debugger enabled, setting level to 99");
                self.level = 99;
            }

            if (WAT.config.logging.overrideConsoleMethods === true) {
                overrideConsoleMethods();
            }

            if (WAT.config.logging.fileLog && WAT.config.logging.fileLog.enabled) {
                if (Number(WAT.config.logging.fileLog.level) || WAT.config.logging.fileLog.level === 0) {
                    self.fileLevel = Math.max(0, Number(WAT.config.logging.fileLog.level));
                } else if (WAT.config.logging.fileLog.level && levels.indexOf(WAT.config.logging.fileLog.level) > -1) {
                    self.fileLevel = levels.indexOf(WAT.config.logging.fileLog.level);
                }

                if (WAT.config.logging.fileLog.format) {
                    self.fileLineFormat = WAT.config.logging.fileLog.format;
                }

                determineLogFilename();
               // cleanFileLogs().then(createLogFile);
            }

        },

        // These two are just for convenience since some devs may know about them and want to use them
        trace: function () {
            logHandler([].splice.call(arguments, 0), "log");
        },
        debug: function () {
            logHandler([].splice.call(arguments, 0), "log");
        },

        // These are convenience methods into the logHandler, but force our types/levels
        log: function () {
            logHandler([].splice.call(arguments, 0), "log");
        },

        info: function () {
            logHandler([].splice.call(arguments, 0), "info");
        },

        warn: function () {
            logHandler([].splice.call(arguments, 0), "warn");
        },

        error: function () {
            logHandler([].splice.call(arguments, 0), "error");
        },

        getStacktrace: function () {
            var i, l, stack, lines, line,
                trace = [];

            try { (0)(); } catch (e) { stack = e.stack; }
            
            lines = stack.split(/\n/);

            // Grab all of the lines, starting at index 2 (ignoring the error type and this function)
            for (i = 2, l = lines.length; i < l; ++i) {
                line = lines[i].match(/at ([^(]+)\s\([^\/]+\/\/[^/]+(\/[^:]+)\:([0-9]+)/);
                if (line) {
                    trace.push({
                        caller: line[1],
                        file: line[2],
                        line: line[3]
                    });
                }
            }

            return trace;
        }

    };


    // Private methods

    overrideConsoleMethods = function () {
        window.console = {
            trace: self.trace,
            debug: self.debug,
            log: self.log,
            info: self.info,
            warn: self.warn,
            error: self.error,

            // These are all of the other documented console methods.
            // Unfortunately we cannot simply override our specific methods because the window.console
            // object is frozen. Instead, we have to override the entire object and then wrap all 
            // methods we are not interested in with a custom binding...
            assert: wrapConsoleMethod(WAT._console.assert),
            clear: wrapConsoleMethod(WAT._console.clear),
            count: wrapConsoleMethod(WAT._console.count),
            dir: wrapConsoleMethod(WAT._console.dir),
            dirxml: wrapConsoleMethod(WAT._console.dirxml),
            group: wrapConsoleMethod(WAT._console.group),
            groupCollapsed: wrapConsoleMethod(WAT._console.groupCollapsed),
            groupEnd: wrapConsoleMethod(WAT._console.groupEnd),
            msIsIndependentlyComposed: wrapConsoleMethod(WAT._console.msIsIndependentlyComposed),
            profile: wrapConsoleMethod(WAT._console.profile),
            profileEnd: wrapConsoleMethod(WAT._console.profileEnd),
            time: wrapConsoleMethod(WAT._console.time),
            timeEnd: wrapConsoleMethod(WAT._console.timeEnd)
        };
    };

    wrapConsoleMethod = function (f) {
        return function () {
            f.apply(WAT._console, [].splice.call(arguments, 0));
        };
    };

    determineLogFilename = function () {
        var rolling, date, week,
            now = new Date();

        if (WAT.config.logging.fileLog.filename) {
            self.filename = WAT.config.logging.fileLog.filename;
        }

        // Handle rolling log file names
        date = now.toISOString().split(/T/)[0];
        week = WAT.getWeekNumber(now);
        rolling = {
            day: date,
            week: week[0] + "-" + week[1],
            month: date.split(/\-/)[0] + "-" + date.split(/\-/)[1]
        };

        self.filename = self.filename.replace(/([^%]|^)%D/g, "$1" + rolling.day);
        self.filename = self.filename.replace(/([^%]|^)%W/g, "$1" + rolling.week);
        self.filename = self.filename.replace(/([^%]|^)%m/g, "$1" + rolling.month);
    };

    cleanFileLogs = function () {
        return new WinJS.Promise(function (complete, error) {
            self.maxLogFiles = (Number(WAT.config.logging.fileLog.maxLogFiles) || self.maxLogFiles);
            if (!self.maxLogFiles || self.maxLogFiles < 1) {
                // they want to keep all log files
                complete(0);
            }

            getLogFileFolder().then(function (logFolder) {

                var options = new Windows.Storage.Search.QueryOptions(Windows.Storage.Search.CommonFileQuery.orderByName, [".log"]),
                    query = logFolder.createFileQueryWithOptions(options);

                query.getFilesAsync().then(
                    function (files) {
                        if (files.length <= self.maxLogFiles) {
                            complete(0);
                            return;
                        }

                        // These are sorted by name, not date, so we need to find the oldest for deletion
                        WAT.getFilesWithProperties(files).then(
                            function (fileWithProps) {
                                deleteOldestFile(fileWithProps).then(
                                    function(count) {
                                        complete(count);
                                    },
                                    error
                                );
                            },
                            error
                        );
                    },
                    error
                );
            });
        });
    };

    deleteOldestFile = function (filesWithProps) {
        return new WinJS.Promise(function (complete, error) {
            var oldest;

            if (!filesWithProps || !filesWithProps.length) {
                complete(0);
                return;
            }

            filesWithProps.forEach(function (file) {
                if (!oldest || file.dateModified < oldest.dateModified) {
                    oldest = file;
                }
            });

            if (!oldest) {
                complete(0);
                return;
            }

            oldest.fileObject.deleteAsync(Windows.Storage.StorageDeleteOption.permanentDelete).then(
                function () {
                    complete(1);
                },
                error
            );
        });
    };

    createLogFile = function () {
        var fileName;

        fileName = self.filename.split(/[\/\\]/);
        fileName = fileName.pop();

        getLogFileFolder().then(function (logFolder) {
            logFolder.createFileAsync(fileName, Windows.Storage.CreationCollisionOption.openIfExists)
                .done(logFileReady);
        });
    };

    getLogFileFolder = function () {
        return new WinJS.Promise(function (complete, error) {
            if (logFileFolder) {
                complete(logFileFolder);
                return;
            }

            if (/[\/\\]/.test(self.filename)) {
                // If the dev gave us a filename with sub-directories, we'll need to get that last folder object
                WAT.getFolderFromPathRecursive(self.filename, Windows.Storage.ApplicationData.current.localFolder)
                    .then(
                        function(subFolder) {
                            logFileFolder = subFolder;
                            complete(logFileFolder);
                        },
                        error
                    );

            } else {
                // Otherwise we use the local folder
                logFileFolder = Windows.Storage.ApplicationData.current.localFolder;
                complete(logFileFolder);
            }
        });
    };

    logFileReady = function (file) {
        // cache the file for use while app is active
        logFile = file;

        // beging processing the queue if there is one...
        if (logFileQueue.length) {
            // Note that we only call writeToFile on the first entry, the queue will 
            // be automatically processed after that
            writeToFile.apply(self, logFileQueue.shift());
        }
    };

    serialize = function (o) {
        var str;

        try {
            str = JSON.stringify(o);
        } catch (err) {
            // primitives, undefined, null, etc, all get serialized fine. In the
            // case that stringify fails (typically due to circular graphs) we 
            // just show "[object]". While we may be able to tighten the condition
            // for the exception, we never want this serialize to fail.

            // Note: we make this be a JSON string, so that consumers of the log
            // can always call JSON.parse.
            if (o instanceof Error) {
                str = JSON.stringify({
                    message: ((o.message) ? o.message.toString() : ""),
                    number: ((o.number) ? o.number.toString() : ""),
                    name: ((o.name) ? o.name.toString() : ""),
                });
            } else {
                str = JSON.stringify("[object]");
            }
        }

        return str;
    },

    logHandler = function (items, level) {
        var msgs = [];

        items = (items.forEach && items) || [];
        items.forEach(function (item) {
            item = (item || typeof(item));
            msgs.push((item.toLowerCase) ? item : serialize(item));
        });

        return writeLog(msgs.join(" "), "WAT", level);
    },

    writeLog = function (message, tags, level) {
        // levels (types) expected: log, perf, info, warn, error
        // tag format: "tag1 tag2 tag3"
        var tagFound, tagArray,
            tagDisplay = " | tags: " + (tags || ""),
            args = [(message) ? message.toString() : ""];

        level = ((level && level.toLowerCase()) || "log");

        if (levels.indexOf(level) < self.level) {
            return false;
        }

        if (!WAT.config.logging || !WAT.config.logging.hideTagDisplay) {
            args.push(tagDisplay);
        }

        if (WAT.config.logging &&
            WAT.config.logging.ignoreTags &&
            WAT.config.logging.ignoreTags.forEach &&
            (level !== "error" || !WAT.config.logging.logErrorsForIgnoredTags)) {

            tagArray = ((tags && tags.toString().split(/\s+/)) || []);
            tagFound = false;

            WAT.config.logging.ignoreTags.forEach(function (ignoreTag) {
                if (tagArray.indexOf(ignoreTag) > -1) {
                    tagFound = true;
                }
            });

            if (tagFound) {
                return false;
            }
        }

        // console logger
        if (WAT.config.logging && !WAT.config.logging.disableConsoleLog) {
            WAT._console[(consoleMethods[level] || "log")].apply(WAT._console, args);
        }

        // file logger (if being used)
        if (levels.indexOf(level) >= self.fileLevel) {
            writeToFile(message, tags, level);
        }

        return true;
    };

    writeToFile = function (message, tags, level, details) {
        // we always want to return a promise, it just may only include the queue (because the 
        // file isn't ready) or null (if we're not doing file logging)
        return new WinJS.Promise(function (complete, error) {
            var now, stack,
                logMsg = "",
                returnVal = null;

            level = (level || "log");
            tags = (tags || "");

            if (!details) {
                now = new Date();

                details = {
                    time: now.toISOString().split(/[T\.]/)[1], // just the time, no ms, no "Z"
                    date: now.toISOString().split(/T/)[0],
                    line: 0,
                    filename: "(n/a)"
                };

                //stack = self.getStacktrace();
                //stack.forEach(function (call) {
                //    if (call.file !== "/template/js/log.js" && call.file !== "/js/base.js") {
                //        details.line = call.line;
                //        details.filename = call.file;
                //    }
                //});
            }

            if (!logFile || writingToFile) {
                // if file logging is enabled, we'll add this one to the queue
                if (WAT.config.logging && WAT.config.logging.fileLog && WAT.config.logging.fileLog.enabled) {
                    logFileQueue.push([message, tags, level, details]);
                    returnVal = logFileQueue;
                }

                complete(returnVal);
                return;
            }

            writingToFile = true;

            logMsg += self.fileLineFormat + "\r\n";
            logMsg = logMsg.replace(/([^%]|^)%M/g, "$1" + message);
            logMsg = logMsg.replace(/([^%]|^)%D/g, "$1" + details.date);
            logMsg = logMsg.replace(/([^%]|^)%T/g, "$1" + details.time);
            logMsg = logMsg.replace(/([^%]|^)%L/g, "$1" + level.toUpperCase());
            logMsg = logMsg.replace(/([^%]|^)%t/g, "$1" + tags);
            logMsg = logMsg.replace(/([^%]|^)%l/g, "$1" + details.line);
            logMsg = logMsg.replace(/([^%]|^)%f/g, "$1" + details.filename);

            Windows.Storage.FileIO.appendTextAsync(logFile, logMsg)
                .done(function () {
                    writingToFile = false;
                    complete(logMsg, logFile);

                    // if we have messages in the queue, process the next one
                    if (logFileQueue.length) {
                        writeToFile.apply(self, logFileQueue.shift());
                    }
                });
        });
    };


    // Module Registration
    WAT.registerModule("log", self);

    // We also want to go ahead and register the logger now so that it is set up 
    // as soon as possible for the rest of of our code and the native code.
    WinJS.Utilities.startLog({ action: writeLog });

})(window.WAT, window.WinJS);
