namespace WatExtensions.SuperCache.Config
{
    using System.Collections.Generic;
    using System.Runtime.Serialization;
    using Newtonsoft.Json;
    using Newtonsoft.Json.Converters;

    [DataContract]
    public sealed class SuperCacheConfig
    {
        internal const string AutomaticProxyUriConfiguration = "Auto";

        public SuperCacheConfig()
        {
            this.ProxyUri = AutomaticProxyUriConfiguration;
            this.BypassUrlPatterns = new List<string>();
        }

        [DataMember(Name = "enabled")]
        public bool IsEnabled { get; set; }

        [DataMember(Name = "enableDynamicImageHandler")]
        public bool EnableDynamicImageHandler { get; set; }

        [DataMember(Name = "enableRedirectWindowOpen")]
        public bool EnableRedirectWindowOpen { get; set; }

        [DataMember(Name = "enableXhrInterceptor")]
        public bool EnableXhrInterceptor { get; set; }

        [DataMember(Name = "traceLevel")]
        [JsonConverter(typeof(StringEnumConverter))]
        public WatExtensions.Diagnostics.TraceLevel TraceLevel { get; set; }

        public string ProxyUri { get; set; }

        [DataMember(Name = "bypassUrlPatterns")]
        public IList<string> BypassUrlPatterns { get; private set; }
    }
}
