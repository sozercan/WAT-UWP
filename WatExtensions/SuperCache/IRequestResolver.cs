namespace WatExtensions.SuperCache
{
    using System;
    using System.Net.Http;
    using System.Threading.Tasks;
    
    internal interface IRequestResolver
    {
        Task<HttpResponseMessage> ResolveRequestAsync(HttpRequestMessage request, Guid requestId);
    }
}
