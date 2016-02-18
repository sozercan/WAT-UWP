namespace WatExtensions.SuperCache
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Linq;
    using System.Reflection;
    using System.Text.RegularExpressions;

    using HtmlAgilityPack;
    using Windows.Storage;

    internal class HtmlProcessor
    {
        private WebServer server;
        private HtmlDocument document;

        public HtmlProcessor(WebServer server)
        {
            this.server = server;
        }

        public HtmlProcessor(string html, WebServer server)
            : this(server)
        {
            this.document = new HtmlDocument();
            this.document.LoadHtml(html);
        }

        public void RedirectLinks(Uri baseUri)
        {
            if (this.document.DocumentNode != null)
            {
                var nodes = this.document.DocumentNode.Descendants()
                    .Where(p => 
                    {
                        if (p.Name == "a" && p.GetAttributeValue("href", null) != null)
                        {
                            return true;
                        }
                        else if (p.Name == "link" && p.GetAttributeValue("rel", null) == "stylesheet")
                        {
                            return true;
                        }
                        else if ((p.Name == "script" || p.Name == "img" || p.Name == "iframe") && p.GetAttributeValue("src", null) != null)
                        {
                            return true;
                        }
                        else if (p.Name == "form" && p.GetAttributeValue("action", null) != null)
                        {
                            return true;
                        }

                        return false;
                    });

                foreach (var element in nodes)
                {
                    var attributeName = element.Name == "a" || element.Name == "link" ? "href" : (element.Name == "form" ? "action" : "src");
                    var attribute = element.GetAttributeValue(attributeName, null);
                    if (attribute != null)
                    {
                        var linkUrl = this.server.BuildCurrentProxyUri(baseUri, attribute);
                        if (linkUrl != null)
                        {
                            element.SetAttributeValue(attributeName, linkUrl.ToString());
                        }
                    }
                }
            }
        }

        public void InjectHtml(string script)
        {
            if (this.document.DocumentNode != null)
            {
                var head = this.document.DocumentNode.Descendants().FirstOrDefault(p => p.Name == "head");
                if (head != null)
                {
                    var scriptNode = this.document.CreateTextNode(script);
                    head.PrependChild(scriptNode);
                }
            }
        }

        public string GetContent()
        {
            string result = null;
            using (var writer = new StringWriter())
            {
                this.document.Save(writer);
                result = writer.ToString();
            }

            return result;
        }

        public void AddOfflineClass()
        {
            if (this.document.DocumentNode != null)
            {
                var body = this.document.DocumentNode.Descendants().FirstOrDefault(p => p.Name == "body");
                if (body != null)
                {
                    var classes = body.GetAttributeValue("class", string.Empty);
                    classes = string.Concat("wat_offlinemode ", classes).Trim();

                    body.SetAttributeValue("class", classes);
                }
            }
        }
    }
}
