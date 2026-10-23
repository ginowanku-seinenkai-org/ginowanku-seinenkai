// 通信の再試行（03 §3.5・§4.1：1秒・2秒・4秒の間隔で3回まで）
/** 再試行の前に待つ時間（ミリ秒）。要素の数が再試行の回数 */
export const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/**
 * 処理を、失敗したら RETRY_DELAYS_MS の間隔で再試行する（最初の1回と再試行3回）
 * @param task 行う処理
 * @param shouldRetry 再試行するエラーかを決める関数（既定はすべて再試行）
 * @param sleep 待つ関数（テストで差し替える）
 * @returns 処理の結果
 * @throws 再試行しないエラーか、最後の再試行でも失敗したときのエラー
 */
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

/**
 * このファイルが tsx などで直接実行されたか（import されたのではないか）を調べる
 * @param metaUrl 調べるファイルの import.meta.url
 * @returns 直接実行されたなら true
 */
export function isMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && new URL(metaUrl).pathname === new URL(`file://${entry}`).pathname;
}
