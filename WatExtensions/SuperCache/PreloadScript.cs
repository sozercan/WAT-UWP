namespace WatExtensions.SuperCache
{
    public sealed class PreloadScript
    {
        public PreloadScript(string script)
            : this(script, 0)
        { 
        }

        public PreloadScript(string script, int priority)
        {
            this.Script = script;
            this.Priority = priority;
        }

        public string Script { get; set; }

        public int Priority { get; set; }
    }
}
