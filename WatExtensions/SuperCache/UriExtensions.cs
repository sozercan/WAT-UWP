namespace WatExtensions.SuperCache
{
    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Net;
    using Windows.Foundation.Metadata;

    public static class UriExtensions
    {
        public static Uri AddQueryParam(this Uri uri, string name, string paramValue)
        {
            Uri tempRoot = null;
            var tempUri = uri;

            // If Uri is not absolute, UriBuilder won't work so we add a temp host
            if (!uri.IsAbsoluteUri)
            {
                tempRoot = new Uri("http://temp.org/");
                tempUri = new Uri(tempRoot, uri);
            }

            // apending params: http://msdn.microsoft.com/en-us/library/system.uribuilder.query(v=vs.110).aspx
            var uriBuilder = new UriBuilder(tempUri);
            uriBuilder.Query = (string.IsNullOrEmpty(uriBuilder.Query) ? string.Empty : (uriBuilder.Query.TrimStart('?') + "&")) + name + "=" + paramValue;
            tempUri = uriBuilder.Uri;

            // If the original Uri was relative, we'll remove the temporal host added. Also, remove the leading slash if necessary
            if (tempRoot != null)
            {
                // Check if uri was rooted
                var relativeUri = uri.OriginalString.StartsWith("/") ? tempUri.PathAndQuery : tempUri.PathAndQuery.TrimStart('/');

                // then add the parent level string segments that the uri had before its processing
                var parentLevelCount = CountUriParentLevels(uri);
                relativeUri = string.Concat(Enumerable.Repeat("../", parentLevelCount)) + relativeUri;
                tempUri = new Uri(relativeUri, UriKind.Relative);
            }

            return tempUri;
        }

        public static IDictionary<string, string> ParseQueryString(this Uri uri)
        {
            return ParseQueryString(uri.OriginalString);
        }

        [DefaultOverloadAttribute]
        public static IDictionary<string, string> ParseQueryString(this string stringUri)
        {
            var queryItems = new Dictionary<string, string>();
            var index = stringUri.IndexOf('?');
            if (index >= 0)
            {
                var queryParameters = stringUri.Substring(index + 1)
                    .Split(new[] { '&' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (var parameter in queryParameters)
                {
                    var queryPair = parameter.Split(new[] { '=' }, 2, StringSplitOptions.RemoveEmptyEntries);
                    var queryPairValue = queryPair.Length == 1 ? string.Empty : WebUtility.UrlDecode(queryPair[1]);
                    queryItems.Add(queryPair[0], queryPairValue);
                }
            }

            return queryItems;
        }

        private static int CountUriParentLevels(Uri uri)
        {
            var parentLevelCount = 0;
            var uriString = uri.OriginalString;
            while (uriString.StartsWith("../"))
            {
                uriString = uriString.Remove(0, "../".Length);
                parentLevelCount++;
            }

            return parentLevelCount;
        }
    }
}
