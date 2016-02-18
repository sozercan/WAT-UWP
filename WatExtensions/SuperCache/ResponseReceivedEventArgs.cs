namespace WatExtensions.SuperCache
{
    using System;

    public sealed class ResponseReceivedEventArgs
    {
        internal ResponseReceivedEventArgs(Guid requestId, Uri requestUri, string contentType, string content)
        {
            this.RequestId = requestId;
            this.RequestUri = requestUri;
            this.ContentType = contentType;
            this.Content = content;
        }

        public Guid RequestId { get; private set; }

        public Uri RequestUri { get; private set; }

        public string ContentType { get; private set; }

        public string Content { get; set; }
    }
}
