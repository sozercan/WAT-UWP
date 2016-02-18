namespace WatExtensions.SuperCache
{
    using System.Collections.Generic;
    using System.Threading;

    internal class StorageQueue<T>
    {
        private readonly object gate = new object();
        private readonly int maxCapacity;
        private readonly Queue<T> queue = new Queue<T>();

        public StorageQueue(int maxCapacity)
        {
            this.maxCapacity = maxCapacity;
        }

        public int Count
        {
            get
            {
                lock (this.gate)
                {
                    return this.queue.Count;
                }
            }
        }

        public void Enqueue(T item)
        {
            lock (this.gate)
            {
                while (this.queue.Count >= this.maxCapacity)
                {
                    Monitor.Wait(this.gate);
                }

                this.queue.Enqueue(item);

                if (this.queue.Count == 1)
                {
                    Monitor.PulseAll(this.gate);
                }
            }
        }

        public T Dequeue()
        {
            lock (this.gate)
            {
                while (this.queue.Count == 0)
                {
                    Monitor.Wait(this.gate);
                }

                T item = this.queue.Dequeue();

                if (this.queue.Count == this.maxCapacity - 1)
                {
                    Monitor.PulseAll(this.gate);
                }

                return item;
            }
        }
    }
}
