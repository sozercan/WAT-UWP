namespace WatExtensions.SuperCache
{
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Net;
    using System.Net.Http;
    using System.Net.Http.Headers;
    using System.Runtime.InteropServices.WindowsRuntime;
    using System.Text;
    using System.Text.RegularExpressions;
    using System.Threading.Tasks;
    using WatExtensions.Diagnostics;
    using WatExtensions.SuperCache.Config;
    using Windows.Foundation;
    using Windows.Networking;
    using Windows.Networking.Sockets;
    using Windows.Storage;
    using Windows.Storage.Streams;
    using Windows.UI.Core;

    // http://www.w3.org/Protocols/rfc2616/rfc2616.html
    internal sealed class WebServer : IDisposable
    {
        public const string CachedContentKey = "WAT-CachedContent";
        private const string LocalhostIpAddress = "127.0.0.1";

        private const uint BufferSize = 8192;
        private const string CrLf = "\r\n";

        private Uri proxyUri;
        private StreamSocketListener listener;
        private IRequestResolver requestResolver = new OfflineRequestResolver();
        private Uri baseUri;
        private Guid activityId;
        private SuperCacheConfig configuration;
        private CookieManager cookieManager;

        private System.Threading.SynchronizationContext context;
        private CoreDispatcher coreDispatcher;

        private EventRegistrationTokenTable<EventHandler<SendingRequestEventArgs>> sendingRequestRegistrationTokenTable;
        private EventRegistrationTokenTable<EventHandler<ResponseReceivedEventArgs>> textResponseReceivedRegistrationTokenTable;
        private EventRegistrationTokenTable<EventHandler<OfflinePageUnavailableEventArgs>> offlinePageUnavailableRegistrationTokenTable;

        public WebServer()
        {
            this.PreloadScripts = new List<PreloadScript>();
        }

        public event EventHandler<SendingRequestEventArgs> SendingRequest
        {
            add
            {
#if SILVERLIGHT
                this.SendingRequestRegistrationTokenTable.AddEventHandler(value);
#else
                return this.SendingRequestRegistrationTokenTable.AddEventHandler(value);
#endif
            }

            remove
            {
                this.SendingRequestRegistrationTokenTable.RemoveEventHandler(value);
            }
        }

        public event EventHandler<ResponseReceivedEventArgs> TextResponseReceived
        {
            add
            {
#if SILVERLIGHT
                this.TextResponseReceivedRegistrationTokenTable.AddEventHandler(value);
#else
                return this.TextResponseReceivedRegistrationTokenTable.AddEventHandler(value);
#endif
            }

            remove
            {
                this.TextResponseReceivedRegistrationTokenTable.RemoveEventHandler(value);
            }
        }

        public event EventHandler<OfflinePageUnavailableEventArgs> OfflinePageUnavailable
        {
            add
            {
#if SILVERLIGHT
                this.OfflinePageUnavailableRegistrationTokenTable.AddEventHandler(value);
#else
                return this.OfflinePageUnavailableRegistrationTokenTable.AddEventHandler(value);
#endif
            }

            remove
            {
                this.OfflinePageUnavailableRegistrationTokenTable.RemoveEventHandler(value);
            }
        }

        private enum ParserState
        {
            RequestLine,
            RequestHeaders,
            RequestBody,
            Complete
        }

        public static string WatBrowserTargetHostQueryStringParameter
        {
            get
            {
                return "x-wat-target-host";
            }
        }

        public IList<PreloadScript> PreloadScripts { get; private set; }

        // Event registration token tables
        internal EventRegistrationTokenTable<EventHandler<SendingRequestEventArgs>> SendingRequestRegistrationTokenTable
        {
            get
            {
                return EventRegistrationTokenTable<EventHandler<SendingRequestEventArgs>>
                    .GetOrCreateEventRegistrationTokenTable(ref this.sendingRequestRegistrationTokenTable);
            }
        }

        internal EventRegistrationTokenTable<EventHandler<ResponseReceivedEventArgs>> TextResponseReceivedRegistrationTokenTable
        {
            get
            {
                return EventRegistrationTokenTable<EventHandler<ResponseReceivedEventArgs>>
                    .GetOrCreateEventRegistrationTokenTable(ref this.textResponseReceivedRegistrationTokenTable);
            }
        }

        internal EventRegistrationTokenTable<EventHandler<OfflinePageUnavailableEventArgs>> OfflinePageUnavailableRegistrationTokenTable
        {
            get
            {
                return EventRegistrationTokenTable<EventHandler<OfflinePageUnavailableEventArgs>>
                    .GetOrCreateEventRegistrationTokenTable(ref this.offlinePageUnavailableRegistrationTokenTable);
            }
        }

        public static Uri ResolveTargetUri(Uri baseUri, string requestUri)
        {
            var queryParameters = ParseQueryString(requestUri);
            string targetHost;
            var rewriteUri = queryParameters.TryGetValue(WebServer.WatBrowserTargetHostQueryStringParameter, out targetHost) ?
                new Uri(targetHost) :
                baseUri;

            // remove target host from query string
            var filteredQueryParameters = queryParameters
                        .Where(p => p.Key != WebServer.WatBrowserTargetHostQueryStringParameter)

                // Sanitize empty values (query string wo value)
                .Select(p => p.Key + (p.Value != null ? "=" : string.Empty) + (string.IsNullOrEmpty(p.Value) ? string.Empty : WebUtility.UrlEncode(p.Value)));

            var mappedUri =
                Uri.IsWellFormedUriString(requestUri, UriKind.Absolute) ?
                new UriBuilder(requestUri) :
                new UriBuilder(new Uri(rewriteUri, requestUri));

            mappedUri.Scheme = rewriteUri.Scheme;
            mappedUri.Host = rewriteUri.Host;
            mappedUri.Port = rewriteUri.Port;
            mappedUri.Query = string.Join("&", filteredQueryParameters);
            return mappedUri.Uri;
        }

        public static string BuildProxyUri(Uri proxyUri, Uri baseUri, string requestUri, IEnumerable<string> bypassUrlPatterns)
        {
            Uri targetUri;

            // Use baseUri scheme as default default, this is what most browsers do
            if (requestUri.StartsWith("//"))
            {
                requestUri = baseUri.Scheme + ":" + requestUri;
            }

            // Check wellformed uri and if the TargetHost param is already in place (to avoid double processing)
            if (Uri.IsWellFormedUriString(requestUri, UriKind.RelativeOrAbsolute) &&
                !ParseQueryString(requestUri).ContainsKey(WebServer.WatBrowserTargetHostQueryStringParameter))
            {
                var absoluteRequestUri = new Uri(baseUri, requestUri);
                var targetHost = new Uri(absoluteRequestUri.GetComponents(UriComponents.SchemeAndServer, UriFormat.UriEscaped));

                if (!(string.Equals(targetHost.Scheme, "http", StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(targetHost.Scheme, "https", StringComparison.OrdinalIgnoreCase)) ||
                    targetHost == proxyUri ||
                    BypassUrl(requestUri, bypassUrlPatterns))
                {
                    return Uri.IsWellFormedUriString(requestUri, UriKind.Relative) ? absoluteRequestUri.ToString() : requestUri;
                }

                targetUri = new Uri(requestUri, UriKind.RelativeOrAbsolute)
                    .AddQueryParam(WebServer.WatBrowserTargetHostQueryStringParameter, WebUtility.UrlEncode(targetHost.ToString()));

                if (targetUri.IsAbsoluteUri)
                {
                    var rewriteUri = new UriBuilder(targetUri);
                    rewriteUri.Scheme = proxyUri.Scheme;
                    rewriteUri.Host = proxyUri.Host;
                    rewriteUri.Port = proxyUri.Port;
                    return rewriteUri.Uri.AbsoluteUri;
                }
                else
                {
                    return targetUri.ToString();
                }
            }

            return Uri.TryCreate(requestUri, UriKind.RelativeOrAbsolute, out targetUri) ? targetUri.ToString() : null;
        }

        public IAsyncAction StartAsync(Uri baseUri, SuperCacheConfig configuration)
        {
            var window = Windows.UI.Core.CoreWindow.GetForCurrentThread();
            if (window != null)
            {
                this.coreDispatcher = window.Dispatcher;
            }

            this.context = System.Threading.SynchronizationContext.Current;
            return this.Initialize(baseUri, configuration).AsAsyncAction();
        }

        public IAsyncAction StopAsync()
        {
            return this.CleanupAsync().AsAsyncAction();
        }

        public string BuildCurrentProxyUri(Uri baseUri, string requestUri)
        {
            return BuildProxyUri(this.proxyUri, baseUri, requestUri, this.configuration.BypassUrlPatterns);
        }

        public bool OnNavigating(NavigatingEventArgs e)
        {
            if (BypassUrl(e.Uri.OriginalString, this.configuration.BypassUrlPatterns))
            {
                return false;
            }

            if (e.Uri.Authority != this.proxyUri.Authority && (e.Uri.Scheme == "http" || e.Uri.Scheme == "https"))
            {
                e.TargetUri = new Uri(this.BuildCurrentProxyUri(this.baseUri, e.Uri.AbsoluteUri));
                return true;
            }

            if (e.Uri != null && e.Uri.Scheme == "https" && e.Uri.Authority == this.proxyUri.Authority)
            {
                var mappedUri = new UriBuilder(e.Uri);
                mappedUri.Port = this.proxyUri.Port;
                mappedUri.Scheme = this.proxyUri.Scheme;
                var queryString = mappedUri.Query.Trim('?');

                if (!queryString.Contains(WatBrowserTargetHostQueryStringParameter + "=https"))
                {
                    mappedUri.Query = queryString.Replace(WatBrowserTargetHostQueryStringParameter + "=http", WatBrowserTargetHostQueryStringParameter + "=https");
                }
                    
                e.TargetUri = mappedUri.Uri;
                return true;
            }

            e.TargetUri = e.Uri;
            return false;
        }

        public Uri ResolveTargetUri(string requestUri)
        {
            return ResolveTargetUri(this.baseUri, requestUri);
        }

        void IDisposable.Dispose()
        {
            this.CleanupAsync().Wait(1000);
        }

        private static IDictionary<string, string> ParseQueryString(string queryString)
        {
            var queryItems = new Dictionary<string, string>();
            var index = queryString.IndexOf('?');
            if (index >= 0)
            {
                var queryParameters = queryString.Substring(index + 1)
                    .Split(new[] { '&' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var parameter in queryParameters)
                {
                    var queryPair = parameter.Split(new[] { '=' }, 2, StringSplitOptions.RemoveEmptyEntries);
                    var queryPairValue = queryPair.Length == 1 ? (parameter.Contains('=') ? string.Empty : null) : WebUtility.UrlDecode(queryPair[1]);
                    queryItems.Add(queryPair[0], queryPairValue);
                }
            }

            return queryItems;
        }

        private static async Task<string> ReadScriptAsync(string scriptName)
        {
            var uri = new System.Uri("ms-appx://" + scriptName);
            var file = await StorageFile.GetFileFromApplicationUriAsync(uri);
            var fileContent = await file.ReadTextAsync();

            return fileContent;
        }

        private static bool BypassUrl(string url, IEnumerable<string> bypassUrlPatterns)
        {
            var nullSafeUrlPatterns = bypassUrlPatterns ?? Enumerable.Empty<string>();
            return nullSafeUrlPatterns.Any(urlPattern => Regex.IsMatch(url, urlPattern));
        }

        private void Dispose(bool disposing)
        {
            if (disposing)
            {
                if (this.listener != null)
                {
                    this.listener.Dispose();
                    this.listener = null;
                }
            }
        }

        private async Task Initialize(Uri baseUri, SuperCacheConfig configuration)
        {
            this.baseUri = baseUri;
            this.configuration = configuration;
            this.activityId = Guid.NewGuid();
            Trace.TraceLevel = configuration.TraceLevel;
            Trace.Information(this.activityId, "Server is starting...");

            HostName hostName = null;
            string port = string.Empty;
            if (!configuration.ProxyUri.Equals(SuperCacheConfig.AutomaticProxyUriConfiguration, StringComparison.OrdinalIgnoreCase))
            {
                // use manual configuration
                Uri proxyUri;
                if (!Uri.TryCreate(configuration.ProxyUri, UriKind.Absolute, out proxyUri))
                {
                    throw new InvalidOperationException("An invalid value was specified for the ProxyUri configuration setting.");
                }

                hostName = new HostName(proxyUri.Host);
                port = proxyUri.Port.ToString();
            }

            // start socket listener 
            this.listener = new StreamSocketListener();
            this.listener.ConnectionReceived += (sender, args) => { Task.Run(async () => { await this.OnConnectionReceivedAsync(sender, args); }); };
            await this.listener.BindEndpointAsync(hostName, port);

            // build proxy URI from the actual port bound to the listener
            this.proxyUri = new Uri(
                "http://" +
                (hostName != null ? hostName.CanonicalName : LocalhostIpAddress) + 
                ":" + 
                this.listener.Information.LocalPort);
            
            // initialize cookie manager
            this.cookieManager = new CookieManager(this.proxyUri);
            await this.cookieManager.LoadCookiesAsync(this.activityId);

            // initialize list of preload scripts
            await this.InitializePreloadScriptsAsync();

            Trace.Information(this.activityId, "Server is listening on port: {0} - baseUri: {1}", this.listener.Information.LocalPort, this.baseUri);
        }

        private async Task InitializePreloadScriptsAsync()
        {
            if (this.configuration.EnableDynamicImageHandler)
            {
                var dynamicImageHandler = await ReadScriptAsync("/WatExtensions/SuperCache/Scripts/DynamicImageHandler.html");
                this.PreloadScripts.Add(new PreloadScript(dynamicImageHandler, -1));
            }

            if (this.configuration.EnableRedirectWindowOpen)
            {
                var redirectWindowOpen = await ReadScriptAsync("/WatExtensions/SuperCache/Scripts/RedirectWindowOpen.html");
                this.PreloadScripts.Add(new PreloadScript(redirectWindowOpen, -1));
            }

            if (this.configuration.EnableXhrInterceptor)
            {
                var xhrInterceptor = await ReadScriptAsync("/WatExtensions/SuperCache/Scripts/XhrInterceptor.html");
                this.PreloadScripts.Add(new PreloadScript(xhrInterceptor, -1));
            }
        }

        private async Task CleanupAsync()
        {
            this.Dispose(true);
            await this.cookieManager.PersistCookiesAsync(this.activityId);
            Trace.Information(this.activityId, "Server has stopped.");
        }

        private async Task OnConnectionReceivedAsync(StreamSocketListener sender, StreamSocketListenerConnectionReceivedEventArgs args)
        {
            var requestId = Guid.NewGuid();
            using (var socket = args.Socket)
            {
                Trace.Verbose(requestId, "Connection from {0}:{1} to {2}:{3} was opened.", socket.Information.RemoteHostName.DisplayName, socket.Information.RemotePort, socket.Information.LocalAddress.DisplayName, socket.Information.LocalPort);

                using (var request = await this.ReadRequestAsync(socket, requestId))
                {
                    if (request != null)
                    {
                        using (var response = await this.ForwardRequestAsync(request, requestId))
                        {
                            // TODO: see if other status codes need to handled
                            if (response != null && (response.StatusCode == HttpStatusCode.Redirect || response.StatusCode == HttpStatusCode.Found))
                            {
                                if (!response.Headers.Location.IsAbsoluteUri)
                                {
                                    response.Headers.Location = new Uri(request.RequestUri, response.Headers.Location);
                                }

                                response.Headers.Location = new Uri(this.BuildCurrentProxyUri(response.Headers.Location, response.Headers.Location.OriginalString));
                            }

                            var setCookieHeaders = this.cookieManager.ProcessResponseCookies(requestId, response);
                            await this.WriteResponseAsync(socket, response, requestId, setCookieHeaders);

                            if (response == null)
                            {
                                var handler = this.OfflinePageUnavailableRegistrationTokenTable.InvocationList;
                                if (handler != null)
                                {
                                    if (this.context != null)
                                    {
                                        this.context.Post(
                                            (state) =>
                                            {
                                                handler(this, new OfflinePageUnavailableEventArgs(requestId, request.RequestUri));
                                            }, 
                                            null);
                                    }
                                }
                            }
                        }
                    }
                }

                Trace.Verbose(requestId, "Connection from {0}:{1} to {2}:{3} was closed.", socket.Information.RemoteHostName.DisplayName, socket.Information.RemotePort, socket.Information.LocalAddress.DisplayName, socket.Information.LocalPort);
            }
        }

        private async Task<HttpRequestMessage> ReadRequestAsync(StreamSocket socket, Guid requestId)
        {
            var currentState = ParserState.RequestLine;
            var request = new HttpRequestMessageBuilder();

            var lineBuffer = new StringBuilder();
            byte[] requestBuffer = null;
            int bufferPosition = 0;
            using (var reader = new DataReader(socket.InputStream))
            {
                reader.InputStreamOptions = InputStreamOptions.Partial;

                var encoding = Encoding.GetEncoding("ISO-8859-1");
                var decoder = encoding.GetDecoder();
                while (currentState < ParserState.RequestBody)
                {
                    var bytesRead = await reader.LoadAsync(BufferSize);

                    if (bytesRead == 0)
                    {
                        Trace.Information(requestId, "Disconnected from: {0}", socket.Information.RemoteHostName.DisplayName);
                        return null;
                    }

                    requestBuffer = new byte[bytesRead];
                    reader.ReadBytes(requestBuffer);
                    bufferPosition = 0;
                    bool inputConsumed = false;
                    var charBuffer = new char[1];
                    int bytesUsed, charsUsed;

                    while (!inputConsumed)
                    {
                        decoder.Convert(
                            requestBuffer,
                            bufferPosition,
                            requestBuffer.Length - bufferPosition,
                            charBuffer,
                            0,
                            1,
                            requestBuffer.Length == 0,
                            out bytesUsed,
                            out charsUsed,
                            out inputConsumed);
                        
                        bufferPosition += bytesUsed;
                        if (charsUsed > 0)
                        {
                            lineBuffer.Append(charBuffer[0]);
                            if (lineBuffer.Length > 1 && lineBuffer[lineBuffer.Length - 2] == '\r' && lineBuffer[lineBuffer.Length - 1] == '\n')
                            {
                                if (lineBuffer.Length == 2 && currentState == ParserState.RequestHeaders)
                                {
                                    currentState = ParserState.RequestBody;
                                    break;
                                }

                                Trace.Verbose(requestId, "Processing line: {0}", lineBuffer.ToString(0, lineBuffer.Length - 2));
                                currentState = this.ProcessRequest(request, currentState, lineBuffer.ToString());
                                lineBuffer.Clear();
                            }
                        }
                    }
                }

                while (currentState != ParserState.Complete)
                {
                    long contentLength = 0;
                    object headerValue;
                    if (request.ContentHeaders.TryGetValue("CONTENT-LENGTH", out headerValue))
                    {
                        contentLength = (long)headerValue;
                    }

                    if (contentLength > 0)
                    {
                        var requestBody = new byte[contentLength];
                        var availableBytes = requestBuffer.Length - bufferPosition;
                        if (availableBytes > 0)
                        {
                            Array.Copy(requestBuffer, bufferPosition, requestBody, 0, availableBytes);
                        }

                        while (availableBytes < contentLength)
                        {
                            var bytesRead = await reader.LoadAsync(BufferSize);
                            if (bytesRead == 0)
                            {
                                Trace.Information(requestId, "Disconnected from: {0}", socket.Information.RemoteHostName.DisplayName);
                                return null;
                            }

                            requestBuffer = new byte[bytesRead];
                            reader.ReadBytes(requestBuffer);
                            Array.Copy(requestBuffer, 0, requestBody, availableBytes, (int)bytesRead);
                            availableBytes += (int)bytesRead;
                        }

                        request.Content = new ByteArrayContent(requestBody);
                        foreach (var header in request.ContentHeaders)
                        {
                            switch (header.Key.ToUpperInvariant())
                            {
                                case "ALLOW":
                                case "CONTENT-ENCODING":
                                case "CONTENT-LANGUAGE":
                                    request.Content.Headers.Add(header.Key, (string)header.Value);
                                    break;

                                case "CONTENT-DISPOSITION":
                                    request.Content.Headers.ContentDisposition = (ContentDispositionHeaderValue)header.Value;
                                    break;

                                case "CONTENT-LENGTH":
                                    request.Content.Headers.ContentLength = contentLength;
                                    break;

                                case "CONTENT-LOCATION":
                                    request.Content.Headers.ContentLocation = (Uri)header.Value;
                                    break;

                                case "CONTENT-MD5":
                                    // currently not supported
                                    break;

                                case "CONTENT-RANGE":
                                    request.Content.Headers.ContentRange = (ContentRangeHeaderValue)header.Value;
                                    break;

                                case "CONTENT-TYPE":
                                    request.Content.Headers.ContentType = (MediaTypeHeaderValue)header.Value;
                                    break;

                                case "CONTENT-EXPIRES":
                                    request.Content.Headers.Expires = (DateTimeOffset)header.Value;
                                    break;

                                case "CONTENT-LASTMODIFIED":
                                    request.Content.Headers.LastModified = (DateTimeOffset)header.Value;
                                    break;
                            }
                        }

                        Trace.Verbose(
                            requestId, 
                            "Processing body: {0}, Content-Type: {1}, Content-Length: {2}",
                            lineBuffer.ToString(),
                            request.Content.Headers.ContentType,
                            request.Content.Headers.ContentLength);
                    }

                    currentState = ParserState.Complete;
                }
            }

            return request;
        }

        private ParserState ProcessRequest(HttpRequestMessageBuilder request, ParserState currentState, string content)
        {
            switch (currentState)
            {
                case ParserState.RequestLine:
                    // From RFC2616: "In the interest of robustness, servers SHOULD ignore any empty line(s) received where a Request-Line is expected."
                    if (content.Length == 0)
                    {
                        return currentState;
                    }

                    var requestLine = content.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    
                    // Verbs are case-sensitive
                    switch (requestLine.Length > 0 ? requestLine[0] : null)
                    {
                        case "OPTIONS": 
                            request.Method = HttpMethod.Options; 
                            break;
                        case "GET": 
                            request.Method = HttpMethod.Get; 
                            break;
                        case "HEAD": 
                            request.Method = HttpMethod.Head; 
                            break;
                        case "POST": 
                            request.Method = HttpMethod.Post; 
                            break;
                        case "PUT": 
                            request.Method = HttpMethod.Put; 
                            break;
                        case "DELETE": 
                            request.Method = HttpMethod.Delete; 
                            break;
                        case "TRACE": 
                            request.Method = HttpMethod.Trace; 
                            break;
                        default: break;
                    }

                    request.RequestUri = ResolveTargetUri(requestLine.Length > 1 ? requestLine[1] : "/");

                    var protocolVersion = Regex.Match(requestLine.Length > 2 ? requestLine[2] : null, "HTTP/(?<version>.*)").Groups["version"].Value;
                    Version version;
                    if (Version.TryParse(protocolVersion, out version))
                    {
                        request.Version = version;
                    }

                    return ParserState.RequestHeaders;
                
                case ParserState.RequestHeaders:
                    // empty line signals end of request header
                    if (content.Length > CrLf.Length)
                    {
                        // Header names are case-insensitive
                        var header = content.Split(new[] { ':' }, 2, StringSplitOptions.RemoveEmptyEntries);
                        var headerName = header.Length > 0 ? header[0].Trim() : null;
                        var headerValue = header.Length > 1 ? header[1].Trim() : null;
                        if (headerName != null && headerValue != null)
                        {
                            switch (headerName.ToUpperInvariant())
                            {
                                case "RANGE":
                                    // fixes issue in HttpClient for WP where a Range header with no upper range 
                                    // results in an InvalidOperationException - "Nullable object must have a value"
                                    if (headerValue.EndsWith("-"))
                                    {
                                        headerValue += long.MaxValue.ToString();
                                    }

                                    request.Headers.Add(headerName, headerValue);
                                    break;

                                case "REFERER":
                                    headerValue = ResolveTargetUri(headerValue).AbsoluteUri;
                                    request.Headers.Add(headerName, headerValue);
                                    break;

                                case "HOST":
                                    break;

                                case "CONNECTION":
                                    break;

                                case "ALLOW":
                                case "CONTENT-ENCODING":
                                case "CONTENT-LANGUAGE":
                                    request.ContentHeaders[headerName] = headerValue;
                                    break;

                                case "CONTENT-DISPOSITION":
                                    ContentDispositionHeaderValue contentDisposition;
                                    if (ContentDispositionHeaderValue.TryParse(headerValue, out contentDisposition))
                                    {
                                        request.ContentHeaders[headerName] = contentDisposition;
                                    }

                                    break;

                                case "CONTENT-LENGTH":
                                    long contentLength;
                                    if (long.TryParse(headerValue, out contentLength))
                                    {
                                        request.ContentHeaders[headerName] = contentLength;
                                    }

                                    break;

                                case "CONTENT-LOCATION":
                                    var contentLocation = ResolveTargetUri(headerValue).AbsoluteUri;
                                    request.ContentHeaders[headerName] = contentLocation;
                                    break;

                                case "CONTENT-MD5":
                                    // currently not supported
                                    break;

                                case "CONTENT-RANGE":
                                    ContentRangeHeaderValue contentRange;
                                    if (ContentRangeHeaderValue.TryParse(headerValue, out contentRange))
                                    {
                                        request.ContentHeaders[headerName] = contentRange;
                                    }

                                    break;

                                case "CONTENT-TYPE":
                                    MediaTypeHeaderValue contentType;
                                    if (MediaTypeHeaderValue.TryParse(headerValue, out contentType))
                                    {
                                        request.ContentHeaders[headerName] = contentType;
                                    }

                                    break;

                                case "CONTENT-EXPIRES":
                                case "CONTENT-LASTMODIFIED":
                                    DateTimeOffset expires;
                                    if (DateTimeOffset.TryParse(headerValue, out expires))
                                    {
                                        request.ContentHeaders[headerName] = expires;
                                    }

                                    break;

                                case "USER-AGENT":
                                    request.Headers.TryAddWithoutValidation("User-Agent", headerValue.Replace(")", "; WAT)"));
                                    break;

                                case "COOKIE":
                                    // filter out cookies for other domains
                                    var filteredCookies = this.cookieManager.FilterCookiesForCurrentRequest(request.RequestUri, headerValue);
                                    if (!string.IsNullOrWhiteSpace(filteredCookies))
                                    {
                                        request.Headers.Add(headerName, filteredCookies);
                                    }

                                    break;

                                default:
                                    request.Headers.Add(headerName, headerValue);
                                    break;
                            }
                        }
                    }
                    else
                    {
                        currentState = ParserState.RequestBody;
                    }

                    break;

                case ParserState.RequestBody:
                    request.Content = new StringContent(content);
                    currentState = ParserState.Complete;
                    break;
            }

            return currentState;
        }

        private async Task<HttpResponseMessage> ForwardRequestAsync(HttpRequestMessage request, Guid requestId)
        {
            Trace.Verbose(requestId, "URL: {0} - Forwarding request - data:\r\n{1}{2}", request.RequestUri, request.Headers, request.Content != null ? request.Content.Headers.ToString() : string.Empty);
            
            await this.OnSendingRequestAsync(request, requestId);
            var response = await this.requestResolver.ResolveRequestAsync(request, requestId);
            if (response != null)
            {
                Trace.Information(requestId, "URL: {0} - Response received - status: {1}", response.RequestMessage.RequestUri, response.StatusCode);
            }
            else
            {
                Trace.Information(requestId, "URL: {0} - Response unavailable", request.RequestUri);
            }

            await this.OnResponseReceivedAsync(response, requestId);

            return response;
        }

        private async Task RunThroughDispatcherAsync(Action handler)
        {
            if (this.coreDispatcher != null)
            {
                await this.coreDispatcher.RunAsync(
                    CoreDispatcherPriority.Normal,
                    new DispatchedHandler(handler));
            }
            else
            {
                await Task.Run(handler);
            }
        }

        private async Task OnSendingRequestAsync(HttpRequestMessage request, Guid requestId)
        {
            var sendingRequest = this.SendingRequestRegistrationTokenTable.InvocationList;
            if (sendingRequest != null)
            {
                var eventArgs = new SendingRequestEventArgs(requestId, request);
                Trace.Verbose(requestId, "Raising SendingRequest event for URI: {0}", request.RequestUri);
                await this.RunThroughDispatcherAsync(() => sendingRequest(this, eventArgs));
            }
        }

        private async Task OnResponseReceivedAsync(HttpResponseMessage response, Guid requestId)
        {
            if (response == null)
            {
                return;
            }

            var content = response.Content;
            if (content != null && content.Headers.ContentType != null)
            {
                var contentType = content.Headers.ContentType;
                var mediaTypeParts = contentType.MediaType.Split(new[] { '/' }, 2);
                var mediaType = mediaTypeParts.Length > 0 ? mediaTypeParts[0].ToLowerInvariant() : null;
                var mediaSubType = mediaTypeParts.Length > 1 ? mediaTypeParts[1].ToLowerInvariant() : null;
                if (mediaType == "text" || (mediaType == "application" && (mediaSubType == "json" || mediaSubType == "xhtml+xml")))
                {
                    var htmlContent = await response.Content.ReadAsStringAsync();

                    // raise TextResponseReceived event and allow subscribers to modify the response
                    var responseReceived = this.TextResponseReceivedRegistrationTokenTable.InvocationList;
                    if (responseReceived != null)
                    {
                        var eventArgs = new ResponseReceivedEventArgs(requestId, response.RequestMessage.RequestUri, contentType.MediaType, htmlContent);
                        Trace.Verbose(requestId, "Raising TextResponseReceived event for URI: {0}", response.RequestMessage.RequestUri);
                        await this.RunThroughDispatcherAsync(() => responseReceived(this, eventArgs));
                        htmlContent = eventArgs.Content;
                    }

                    if (mediaType == "text" || mediaType == "application")
                    {
                        if (mediaSubType == "html" || mediaSubType == "xhtml+xml")
                        {
                            var processor = new HtmlProcessor(htmlContent, this);
                            processor.RedirectLinks(response.RequestMessage.RequestUri);

                            if (response.Content.Headers.Contains(WebServer.CachedContentKey))
                            {
                                processor.AddOfflineClass();
                            }

                            // Inject preload scripts in HTML content
                            foreach (var preloadScript in this.PreloadScripts.OrderByDescending(p => p.Priority))
                            {
                                processor.InjectHtml(preloadScript.Script);
                            }

                            htmlContent = processor.GetContent();
                        }
                        else if (mediaSubType == "css")
                        {
                            htmlContent = Regex.Replace(
                                htmlContent,
                                @"(?<=url\((?<quote>['""])?)(?<url>[^'""]+?)(?=(\k<quote>)?\))",
                                (match) =>
                                {
                                    var rewriteUri = this.BuildCurrentProxyUri(response.RequestMessage.RequestUri, match.Groups["url"].Value);
                                    return rewriteUri.ToString();
                                });
                        }
                    }

                    response.Content.Dispose();
                    response.Content = new StringContent(htmlContent);
                    response.Content.Headers.ContentType = contentType;
                }
            }
        }

        private async Task WriteResponseAsync(StreamSocket socket, HttpResponseMessage response, Guid requestId, string setCookieHeaders)
        {
            if (response == null)
            {
                return;
            }

            // need to disable chunked transfer encoding
            response.Headers.TransferEncodingChunked = false;

            using (var writer = new DataWriter(socket.OutputStream))
            {
                // ContentLength is lazily evaluated - it needs to be accessed before
                // serializing the response; otherwise the Content-Length header is not generated
                if (response.Content != null)
                {
                    var contentLength = response.Content.Headers.ContentLength;
                }

                try
                {
                    writer.WriteString(string.Format("HTTP/1.1 {0} {1}\r\n", (int)response.StatusCode, response.ReasonPhrase));
                    if (response.Content != null)
                    {
                        writer.WriteString(response.Content.Headers.ToString());
                    }

                    writer.WriteString(response.Headers.ToString());
                    writer.WriteString(setCookieHeaders);
                    writer.WriteString("\r\n");
                    if (response.Content != null)
                    {
                        writer.WriteBytes(await response.Content.ReadAsByteArrayAsync());
                    }

                    await writer.StoreAsync();
                    await writer.FlushAsync();
                }
                catch (Exception)
                {
                }
            }

            Trace.Verbose(requestId, "Data sent to: {0}, status: {1} - header:\r\n{2}{3}{4}", socket.Information.RemoteHostName.DisplayName, response.StatusCode, response.Content != null ? response.Content.Headers.ToString() : string.Empty, response.Headers, setCookieHeaders);
        }

        private class HttpRequestMessageBuilder : HttpRequestMessage
        {
            public readonly IDictionary<string, object> ContentHeaders = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
