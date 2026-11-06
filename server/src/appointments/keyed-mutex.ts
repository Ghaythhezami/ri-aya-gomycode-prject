/**
 * In-process FIFO mutex per key. Bookings of one doctor queue up here before they
 * open a SERIALIZABLE transaction, so a burst of requests for one slot does not
 * exhaust the connection pool or thrash on serialization failures. The database
 * constraint remains the cross-instance guarantee.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(fn);
    this.tails.set(key, current);
    try {
      return await current;
    } finally {
      if (this.tails.get(key) === current) this.tails.delete(key);
    }
  }
}
