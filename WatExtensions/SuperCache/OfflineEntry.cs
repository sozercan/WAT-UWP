namespace WatExtensions.SuperCache
{
    using System;
    using System.Net;
    using System.Net.Http.Headers;
    using System.Runtime.Serialization;
    using System.Threading;

    [DataContract]
    internal sealed class OfflineEntry
    {
        private ManualResetEvent readyEvent;

        [DataMember]
        public string Path { get; set; }

        [DataMember]
        public string Key { get; set; }

        [DataMember]
        public Uri LocationHeader { get; set; }

        [DataMember]
        public HttpStatusCode StatusCode { get; set; }

        [DataMember]
        public string ContentTypeHeader { get; set; }

        public byte[] Content { get; set; }

        public System.Guid RequestId { get; set; }

        internal ManualResetEvent ReadyEvent
        {
            get { return this.readyEvent ?? (this.readyEvent = new ManualResetEvent(false)); }
        }
    }
}
