namespace WatExtensions.SuperCache
{
    using System;
    using System.Collections.Generic;
    using System.Net.Http;
    using System.Net.Http.Headers;

    public sealed class SendingRequestEventArgs
    {
        private HttpRequestMessage request;

        internal SendingRequestEventArgs(Guid requestId, HttpRequestMessage request)
        {
            this.RequestId = requestId;
            this.request = request;
        }

        public Guid RequestId { get; private set; }

        public Uri RequestUri
        {
            get
            {
                return this.request.RequestUri;
            }

            set
            {
                this.request.RequestUri = value;
            }
        }

        public bool DoNotCache
        {
            get
            {
                return this.request.GetWatCacheControlHeader().NoStore;
            }
            
            set
            {
                this.request.SetWatCacheControlHeader("no-store");
            }
        }

        public byte[] ContentAsByteArray
        {
            get
            {
                if (this.request.Content != null)
                {
                    return this.request.Content.ReadAsByteArrayAsync().Result;
                }

                return new byte[0];
            }

            set
            {
                var content = new ByteArrayContent(value);
                this.request.Content = this.InitializeHttpHeaders(content);
            }
        }

        public string ContentAsString
        {
            get
            {
                if (this.request.Content != null)
                {
                    return this.request.Content.ReadAsStringAsync().Result;
                }

                return string.Empty;
            }

            set
            {
                var content = new StringContent(value);
                this.request.Content = this.InitializeHttpHeaders(content);
            }
        }

        public string Method
        {
            get
            {
                return this.request.Method.Method;
            }

            set
            {
                this.request.Method = new HttpMethod(value);
            }
        }

        public IEnumerable<KeyValuePair<string, IEnumerable<string>>> Headers
        {
            get
            {
                return this.request.Headers;
            }
        }

        private HttpContent InitializeHttpHeaders(HttpContent content)
        {
            HttpContentHeaders currentHeaders = null;
            if (this.request.Content.Headers != null)
            {
                currentHeaders = this.request.Content.Headers;
            }

            var headers = content.Headers;
            foreach (var header in currentHeaders)
            {
                if (string.Compare(header.Key, "Content-Length", StringComparison.OrdinalIgnoreCase) != 0)
                {
                    if (headers.Contains(header.Key))
                    {
                        headers.Remove(header.Key);
                    }

                    headers.Add(header.Key, header.Value);
                }
            }

            return content;
        }
    }
}
