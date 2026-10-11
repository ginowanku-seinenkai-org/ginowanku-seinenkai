// 通信の再試行（03 §3.5・§4.1：1秒・2秒・4秒の間隔で3回まで）
export const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export async function withRetry<T>(
  task: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean = () => true,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !shouldRetry(error)) throw error;
      await sleep(delay);
    }
  }
}

export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && new URL(metaUrl).pathname === new URL(`file://${entry}`).pathname;
}
