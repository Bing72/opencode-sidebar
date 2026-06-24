export function createCoalescer<T>(
  ms: number,
  flush: (items: ReadonlyArray<T>) => void,
): { readonly schedule: (item: T) => void; readonly dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let items: T[] = [];
  const run = (): void => {
    timer = undefined;
    const batch = items;
    items = [];
    flush(batch);
  };
  return {
    schedule(item): void {
      items.push(item);
      if (timer === undefined) timer = setTimeout(run, ms);
    },
    dispose(): void {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      items = [];
    },
  };
}
