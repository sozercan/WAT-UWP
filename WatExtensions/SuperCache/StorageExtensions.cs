namespace WatExtensions.SuperCache
{
    using System;
    using System.Threading.Tasks;
    using Windows.Storage;
    using Windows.Storage.Streams;

    public static class StorageExtensions
    {
        internal static async Task<string> ReadTextAsync(this StorageFile file)
        {
            using (var fs = await file.OpenAsync(FileAccessMode.Read))
            {
                using (var inStream = fs.GetInputStreamAt(0))
                {
                    using (var dataReader = new DataReader(inStream))
                    {
                        await dataReader.LoadAsync((uint)fs.Size);
                        var data = dataReader.ReadString((uint)fs.Size);
                        dataReader.DetachStream();
                        return data;
                    }
                }
            }
        }
    }
}
