namespace WatExtensions.SuperCache
{
    using System;

    public sealed class OfflinePageUnavailableEventArgs
    {
        internal OfflinePageUnavailableEventArgs(Guid requestId, Uri requestUri)
        {
            this.RequestId = requestId;
            this.RequestUri = requestUri;
        }

        public Guid RequestId { get; private set; }

        public Uri RequestUri { get; private set; }
    }
}
