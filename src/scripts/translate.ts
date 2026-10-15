// 日本語・英語の切り替え（03 §6.2、D-88）。英語を選んだときだけ Google 翻訳の部品を読み込む
// 選んだ言葉は Google の Cookie googtrans（/ja/en）で覚える。日本語のままなら Google に何も送らない
const COOKIE = 'googtrans';
const ENGLISH = '/ja/en';
const SCRIPT = 'https://translate.google.com/translate_a/element.js?cb=ginowankuTranslateInit';

declare global {
  interface Window {
    ginowankuTranslateInit?: () => void;
    google?: {
      translate: {
        TranslateElement: new (options: Record<string, unknown>, id: string) => unknown;
      };
    };
  }
}

const isEnglish = () => document.cookie.split('; ').some((c) => c === `${COOKIE}=${ENGLISH}`);

/** Google はホスト名と「.ホスト名」の両方に付けるので、どちらも消す */
function clearCookie() {
  const host = location.hostname;
  for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) {
    document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
  }
}

const english = isEnglish();
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-lang-toggle]')) {
  button.hidden = false;
  button.setAttribute('aria-label', english ? '日本語' : 'English');
  const text = button.querySelector('[data-lang-text]');
  if (text) text.textContent = english ? '日本語' : 'EN';
  button.addEventListener('click', () => {
    if (english) clearCookie();
    else document.cookie = `${COOKIE}=${ENGLISH}; path=/; samesite=lax`;
    location.reload();
  });
}

if (english) {
  const holder = document.createElement('div');
  holder.id = 'google-translate';
  holder.hidden = true;
  document.body.append(holder);
  window.ginowankuTranslateInit = () => {
    if (!window.google) return;
    new window.google.translate.TranslateElement(
      { pageLanguage: 'ja', includedLanguages: 'en', autoDisplay: false },
      'google-translate',
    );
  };
  const script = document.createElement('script');
  script.src = SCRIPT;
  script.async = true;
  document.head.append(script);
}

export {};
