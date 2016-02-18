namespace WatExtensions.SuperCache
{
    using System;
    using System.Net;
    using System.Net.Http;
    using System.Threading.Tasks;
    using WatExtensions.Diagnostics;

    internal class PassThroughRequestResolver : IRequestResolver
    {
        private static readonly HttpClient HttpClient;

        static PassThroughRequestResolver()
        {
            var handler = new HttpClientHandler();
            handler.AutomaticDecompression = DecompressionMethods.Deflate | DecompressionMethods.GZip;
            handler.UseCookies = false;
            handler.AllowAutoRedirect = false;
            HttpClient = new HttpClient(handler);
        }

        public virtual async Task<HttpResponseMessage> ResolveRequestAsync(HttpRequestMessage request, Guid requestId)
        {
            var response = await HttpClient.SendAsync(request);
            Trace.Verbose(requestId, "URL: {0} - Request sent to target host", request.RequestUri);
            return response;
        }
    }
}
