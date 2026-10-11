// アクセス計測（03 §9）。ページの読み込みごとに1回、sendBeacon で送る。結果は見ない
import { buildTrackPayload, shouldTrack } from '../lib/track.ts';

interface PrivacyNavigator extends Navigator {
  globalPrivacyControl?: boolean;
}

function send() {
  const root = document.documentElement.dataset;
  const endpoint = root['trackEndpoint'];
  const nav = navigator as PrivacyNavigator;
  if (
    !endpoint ||
    !shouldTrack({
      siteEnv: root['siteEnv'] ?? '',
      hostname: location.hostname,
      webdriver: nav.webdriver,
      globalPrivacyControl: nav.globalPrivacyControl,
      doNotTrack: nav.doNotTrack,
    })
  )
    return;
  const payload = buildTrackPayload(location.pathname, document.referrer);
  if (!payload) return;
  const body = JSON.stringify(payload);
  try {
    // 文字列を渡すと text/plain になり、CORS の事前確認が起きない。apikey は付けない（D-34）
    if (typeof nav.sendBeacon === 'function' && nav.sendBeacon(endpoint, body)) return;
    void fetch(endpoint, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'Content-Type': 'text/plain' },
    }).catch(() => undefined);
  } catch {
    // 失敗しても何もしない
  }
}

const doc = document as Document & { prerendering?: boolean };
if (doc.prerendering) {
  // 先読み表示中は、実際に表示されてから送る
  doc.addEventListener('prerenderingchange', send, { once: true });
} else {
  send();
}
// 戻る操作でページがそのまま復元されたとき（pageshow の persisted）は送らない。最初の読み込みは上で送った
