namespace WatExtensions.SuperCache
{
    using System.Collections.Generic;
    using System.Net.Http;
    using System.Net.Http.Headers;

    internal static class HttpHeaderExtensions
    {
        private const string CacheControlHeaderName = "WAT-Cache-Control";
        
        public static CacheControlHeaderValue GetWatCacheControlHeader(this HttpRequestMessage request)
        {
            IEnumerable<string> headerValues;
            if (request.Headers.TryGetValues(CacheControlHeaderName, out headerValues))
            {
                foreach (var header in headerValues)
                {
                    CacheControlHeaderValue cacheControlHeader;
                    if (CacheControlHeaderValue.TryParse(header, out cacheControlHeader))
                    {
                        return cacheControlHeader;
                    }
                }
            }

            return new CacheControlHeaderValue();
        }

        public static void SetWatCacheControlHeader(this HttpRequestMessage request, string value)
        {
            var headers = request.Headers;
            if (headers.Contains(CacheControlHeaderName))
            {
                headers.Remove(CacheControlHeaderName);
            }

            if (value != null)
            {
                headers.Add(CacheControlHeaderName, value);
            }
        }
    }
}
