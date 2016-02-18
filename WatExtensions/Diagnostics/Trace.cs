namespace WatExtensions.Diagnostics
{
    using System;
    using System.Diagnostics;

    internal class Trace
    {
        static Trace()
        {
            TraceLevel = TraceLevel.Info;
        }

        public static TraceLevel TraceLevel { get; set; }

        public static void Exception(Guid activityId, Exception exception)
        {
            var timeStamp = Environment.TickCount;
            Debug.WriteLineIf(Trace.TraceLevel >= TraceLevel.Error, string.Format("{3:0000000000} [{0}] ({1,4}) {2}", activityId, Environment.CurrentManagedThreadId, exception, timeStamp));
        }

        public static void Error(Guid activityId, string format, params object[] args)
        {
            var timeStamp = Environment.TickCount;
            Debug.WriteLineIf(Trace.TraceLevel >= TraceLevel.Error, string.Format("{2:0000000000} [{0}] ({1,4}) ", activityId, Environment.CurrentManagedThreadId, timeStamp) + string.Format(format, args));
        }

        public static void Warning(Guid activityId, string format, params object[] args)
        {
            var timeStamp = Environment.TickCount;
            Debug.WriteLineIf(Trace.TraceLevel >= TraceLevel.Warning, string.Format("{2:0000000000} [{0}] ({1,4}) ", activityId, Environment.CurrentManagedThreadId, timeStamp) + string.Format(format, args));
        }

        public static void Information(Guid activityId, string format, params object[] args)
        {
            var timeStamp = Environment.TickCount;
            Debug.WriteLineIf(Trace.TraceLevel >= TraceLevel.Info, string.Format("{2:0000000000} [{0}] ({1,4}) ", activityId, Environment.CurrentManagedThreadId, timeStamp) + string.Format(format, args));
        }

        public static void Verbose(Guid activityId, string format, params object[] args)
        {
            var timeStamp = Environment.TickCount;
            Debug.WriteLineIf(Trace.TraceLevel >= TraceLevel.Verbose, string.Format("{2:0000000000} [{0}] ({1,4}) ", activityId, Environment.CurrentManagedThreadId, timeStamp) + string.Format(format, args));
        }
    }
}
