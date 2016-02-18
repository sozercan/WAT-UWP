namespace WatExtensions.SuperCache
{
    using System;

    public sealed class NavigatingEventArgs
    {
        public NavigatingEventArgs(string uri)
        {
            this.Uri = new Uri(uri);
        }

        public Uri Uri { get; private set; }
        
        public Uri TargetUri { get; set; }
    }
}
