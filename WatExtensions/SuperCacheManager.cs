namespace WatExtensions
{
    using System;
    using WatExtensions.SuperCache;
    using WatExtensions.SuperCache.Config;
    using Windows.Foundation;
    
    public static class SuperCacheManager
    {
        private static WebServer webServer;

        public static event EventHandler<SendingRequestEventArgs> SendingRequest
        {
            add
            {
                GuardWebServer();

#if SILVERLIGHT
                webServer.SendingRequestRegistrationTokenTable.AddEventHandler(value);
#else
                return webServer.SendingRequestRegistrationTokenTable.AddEventHandler(value);
#endif
            }

            remove
            {
                GuardWebServer();
                webServer.SendingRequestRegistrationTokenTable.RemoveEventHandler(value);
            }
        }

        public static event EventHandler<ResponseReceivedEventArgs> TextResponseReceived
        {
            add
            {
                GuardWebServer();

#if SILVERLIGHT
                webServer.TextResponseReceivedRegistrationTokenTable.AddEventHandler(value);
#else
                return webServer.TextResponseReceivedRegistrationTokenTable.AddEventHandler(value);
#endif
            }

            remove
            {
                GuardWebServer();
                webServer.TextResponseReceivedRegistrationTokenTable.RemoveEventHandler(value);
            }
        }

        public static event EventHandler<OfflinePageUnavailableEventArgs> OfflinePageUnavailable
        {
            add
            {
                GuardWebServer();

#if SILVERLIGHT
                webServer.OfflinePageUnavailableRegistrationTokenTable.AddEventHandler(value);
#else
                return webServer.OfflinePageUnavailableRegistrationTokenTable.AddEventHandler(value);
#endif
            }

            remove
            {
                GuardWebServer();
                webServer.OfflinePageUnavailableRegistrationTokenTable.RemoveEventHandler(value);
            }
        }

        public static bool UseOffline { get; set; }

        public static IAsyncAction StartAsync(Uri baseUri, SuperCacheConfig configuration)
        {
            webServer = new WebServer();
            return webServer.StartAsync(baseUri, configuration);
        }

        public static IAsyncAction StopAsync()
        {
            GuardWebServer();
            return webServer.StopAsync();
        }

        public static bool OnNavigating(NavigatingEventArgs e)
        {
            GuardWebServer();
            return webServer.OnNavigating(e);
        }

        public static string BuildLocalProxyUri(Uri baseUri, string requestUri)
        {
            if (webServer == null)
            {
                return new Uri(baseUri, requestUri).ToString();
            }

            return webServer.BuildCurrentProxyUri(baseUri, requestUri);
        }

        public static Uri ResolveTargetUri(string requestUri)
        {
            if (webServer == null)
            {
                return new Uri(requestUri, UriKind.RelativeOrAbsolute);
            }

            return webServer.ResolveTargetUri(requestUri);
        }

        public static string RewriteLinksInHtmlForLocalProxy(Uri baseUri, string html)
        {
            var htmlProcessor = new HtmlProcessor(html, webServer);
            htmlProcessor.RedirectLinks(baseUri);
            var content = htmlProcessor.GetContent();

            return content;
        }

        public static void AddPreloadScript(string script)
        {
            GuardWebServer();
            webServer.PreloadScripts.Add(new PreloadScript(script));
        }

        private static void GuardWebServer()
        {
            if (webServer == null)
            {
                throw new InvalidOperationException("Default web server instance not started!");
            }
        }
    }
}