namespace WatExtensions.SuperCache
{
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Net;
    using System.Net.Http;
    using System.Net.Http.Headers;
    using System.Threading.Tasks;
#if SILVERLIGHT
    using Microsoft.Phone.Net.NetworkInformation;
#endif
    using Newtonsoft.Json;
    using WatExtensions.Diagnostics;
    using Windows.Networking.Connectivity;
    using Windows.Storage;
    using Windows.Storage.Streams;

    internal sealed class OfflineRequestResolver : PassThroughRequestResolver
    {
        private const string CacheFolderName = "wat-cache";
        private const string CacheIndexFileName = "wat-cache.index";

        private Dictionary<string, OfflineEntry> cacheIndex;
        private StorageQueue<OfflineEntry> storageQueue = new StorageQueue<OfflineEntry>(100);
        private bool isInternetAvailable = true;

        public OfflineRequestResolver()
        {
            // start a background task to cache HTTP responses to storage
            var t = Task.Run(async () => { await SaveCacheEntriesAsync(); });

            // handle network status changes
            NetworkInformation.NetworkStatusChanged += this.OnNetworkStatusChanged;
            this.OnNetworkStatusChanged(this);
        }

        public override async Task<HttpResponseMessage> ResolveRequestAsync(HttpRequestMessage request, Guid requestId)
        {
            if (this.cacheIndex == null)
            {
                await this.RestoreCacheIndexAsync(requestId);
            }

            var entry = this.GetCacheEntry(request.RequestUri, requestId);

            if (this.IsOnline())
            {
                // request content from target site
                var response = await base.ResolveRequestAsync(request, requestId);

                var noStore = request.GetWatCacheControlHeader().NoStore;

                // store retrieved content for offline use (support offline redirects)
                if ((response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.Redirect) && !noStore)
                {
                    entry.ReadyEvent.Reset();
                    entry.ContentTypeHeader = response.Content.Headers.ContentType.ToString();

                    // Store statuscode and location header to support offline redirects
                    entry.StatusCode = response.StatusCode;
                    entry.LocationHeader = response.Headers.Location;
                    entry.Content = await response.Content.ReadAsByteArrayAsync();
                    this.storageQueue.Enqueue(entry);
                }

                return response;
            }

            if (entry.ReadyEvent.WaitOne(5000))
            {
                if (entry.Path != null)
                {
                    Trace.Information(requestId, "URL: {0} - Retrieving cached content from path '{1}'", request.RequestUri, entry.Path);

                    // Wait for the cache file to be ready
                    // Create new cached response 
                    var cacheFolder = await ApplicationData.Current.LocalFolder.CreateFolderAsync(CacheFolderName, CreationCollisionOption.OpenIfExists);
                    var file = await cacheFolder.GetFileAsync(entry.Path);
                    var cachedResponse = await RetrieveOfflineResponseMessageAsync(request, entry, file);

                    return cachedResponse;
                }
            }

            return null;
        }

        private static async Task WriteBytesAsync(StorageFile file, byte[] data)
        {
            using (var fs = await file.OpenAsync(FileAccessMode.ReadWrite))
            {
                using (var outStream = fs.GetOutputStreamAt(0))
                {
                    using (var dataWriter = new DataWriter(outStream))
                    {
                        dataWriter.WriteBytes(data);
                        await dataWriter.StoreAsync();
                        dataWriter.DetachStream();
                    }

                    await outStream.FlushAsync();
                }
            }
        }

        private static async Task WriteTextAsync(StorageFile file, string data)
        {
            using (var fs = await file.OpenAsync(FileAccessMode.ReadWrite))
            {
                using (var outStream = fs.GetOutputStreamAt(0))
                {
                    using (var dataWriter = new DataWriter(outStream))
                    {
                        dataWriter.WriteString(data);
                        await dataWriter.StoreAsync();
                        dataWriter.DetachStream();
                    }

                    await outStream.FlushAsync();
                }
            }
        }

        private static async Task<byte[]> ReadBytesAsync(StorageFile file)
        {
            using (var fs = await file.OpenAsync(FileAccessMode.Read))
            {
                using (var inStream = fs.GetInputStreamAt(0))
                {
                    using (var dataReader = new DataReader(inStream))
                    {
                        await dataReader.LoadAsync((uint)fs.Size);
                        var data = new byte[dataReader.UnconsumedBufferLength];
                        dataReader.ReadBytes(data);
                        dataReader.DetachStream();
                        return data;
                    }
                }
            }
        }

        private static async Task<HttpResponseMessage> RetrieveOfflineResponseMessageAsync(HttpRequestMessage request, OfflineEntry entry, StorageFile file)
        {
            var cachedByteArray = await ReadBytesAsync(file);
            var response = new HttpResponseMessage(entry.StatusCode);
            response.RequestMessage = request;
            response.Content = new ByteArrayContent(cachedByteArray);
            
            MediaTypeHeaderValue contentTypeHeader;
            if (MediaTypeHeaderValue.TryParse(entry.ContentTypeHeader, out contentTypeHeader))
            {
                response.Content.Headers.ContentType = contentTypeHeader;
            }

            if (entry.LocationHeader != null)
            {
                response.Headers.Location = entry.LocationHeader;
            }

            response.Content.Headers.Add(WebServer.CachedContentKey, "true");

            return response;
        }

#if SILVERLIGHT
        private void OnNetworkStatusChanged(object sender)
        {
            this.isInternetAvailable = NetworkInterface.NetworkInterfaceType != NetworkInterfaceType.None;
            Trace.Information(Guid.Empty, "Networks status change: {0}", this.isInternetAvailable ? "ONLINE" : "OFFLINE");
        }
#else
        private void OnNetworkStatusChanged(object sender)
        {
            ConnectionProfile profile = NetworkInformation.GetInternetConnectionProfile();

            if (profile != null)
            {
                var connectivityLevel = profile.GetNetworkConnectivityLevel();

                // TODO: decide whether ConstrainedAccess and LocalAccess should  
                // also be taken as an indication that a network is available - probably not for most apps
                this.isInternetAvailable = connectivityLevel == NetworkConnectivityLevel.InternetAccess;
                SuperCacheManager.UseOffline = false;
            }
            else
            {
                this.isInternetAvailable = false;
            }

            Trace.Information(Guid.Empty, "Networks status change: {0}", this.isInternetAvailable ? "ONLINE" : "OFFLINE");
        }
#endif

        private async Task SaveCacheIndexAsync()
        {
            if (this.cacheIndex != null)
            {
                var cacheFolder = await ApplicationData.Current.LocalFolder.CreateFolderAsync(CacheFolderName, CreationCollisionOption.OpenIfExists);
                var file = await cacheFolder.CreateFileAsync(CacheIndexFileName, CreationCollisionOption.ReplaceExisting);
                var data = JsonConvert.SerializeObject(this.cacheIndex);
                await WriteTextAsync(file, data);
            }
        }

        private async Task RestoreCacheIndexAsync(Guid requestId)
        {
            Trace.Verbose(requestId, "Restoring cache index...");
            var cacheFolder = await ApplicationData.Current.LocalFolder.CreateFolderAsync(CacheFolderName, CreationCollisionOption.OpenIfExists);
            var file = await cacheFolder.CreateFileAsync(CacheIndexFileName, CreationCollisionOption.OpenIfExists);
            var data = await file.ReadTextAsync();
            this.cacheIndex = JsonConvert.DeserializeObject<Dictionary<string, OfflineEntry>>(data);
            if (this.cacheIndex == null)
            {
                this.cacheIndex = new Dictionary<string, OfflineEntry>();
            }
            else
            {
                // Set all files as ready
                foreach (var e in this.cacheIndex.Values)
                {
                    e.ReadyEvent.Set();
                }
            }
        }

        private async Task SaveCacheEntriesAsync()
        {
            var cacheFolder = await ApplicationData.Current.LocalFolder.CreateFolderAsync(CacheFolderName, CreationCollisionOption.OpenIfExists);

            while (true)
            {
                Guid requestId = Guid.Empty;

                try
                {
                    var entry = this.storageQueue.Dequeue();
                    requestId = entry.RequestId;

                    // Check for null Content only. Redirects has zero length content, not null.
                    if (entry.Content != null)
                    {
                        var path = entry.Path ?? Guid.NewGuid().ToString();
                        var file = await cacheFolder.CreateFileAsync(path, CreationCollisionOption.ReplaceExisting);
                        await WriteBytesAsync(file, entry.Content);
                        entry.Content = null;
                        entry.Path = path;
                        entry.ReadyEvent.Set();

                        if (!this.cacheIndex.ContainsKey(entry.Key))
                        {
                            this.cacheIndex.Add(entry.Key, entry);
                        }

                        Trace.Information(requestId, "URL: {0} - Cached content at '{1}'", entry.Key, entry.Path);
                    }

                    if (this.storageQueue.Count == 0)
                    {
                        Trace.Verbose(requestId, "Flushing cache index...");
                        await this.SaveCacheIndexAsync();
                    }
                }
                catch (Exception ex)
                {
                    Trace.Exception(requestId, ex);
                }
            }
        }

        private OfflineEntry GetCacheEntry(Uri uri, Guid requestId)
        {
            var filteredQueryParameters = uri.ParseQueryString()
                .Where(p => p.Key != "_")

                // Sanitize empty values (query string wo value)
                .Select(p => p.Key + (p.Value != null ? "=" : string.Empty) + (string.IsNullOrEmpty(p.Value) ? string.Empty : p.Value));

            var mappedUri = new UriBuilder(uri);
            mappedUri.Query = string.Join("&", filteredQueryParameters);

            // TODO: review if trimming trailing slash is correct
            var flatString = mappedUri.Uri.ToString().TrimEnd('/');

            OfflineEntry entry = null;
            lock (this.cacheIndex)
            {
                if (!this.cacheIndex.TryGetValue(flatString, out entry))
                {
                    entry = new OfflineEntry { RequestId = requestId, Key = flatString };
                }
            }

            return entry;
        }

        private bool IsOnline()
        {
            if (SuperCacheManager.UseOffline)
            {
                return false;
            }
            else
            {
                var maxRetryCount = 100;
                while (!this.isInternetAvailable && maxRetryCount-- > 0)
                {
                    Task.Delay(100).Wait();
                }

                return !SuperCacheManager.UseOffline && this.isInternetAvailable;
            }
        }
    }
}
