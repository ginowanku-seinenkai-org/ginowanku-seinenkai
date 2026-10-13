// 画面の固定文言（文面の正は 06 §4。変えるときは 06 を先に直す）

export const SITE_NAME = '宜野湾区青年会';

/** meta description の固定文（06 §4.5） */
export const DESCRIPTIONS = {
  top: '沖縄県宜野湾市の宜野湾区青年会の公式サイトです。エイサーの演舞、行事予定、メンバー募集、演舞依頼の受付をご案内します。',
  news: '宜野湾区青年会のお知らせ、行事予定、募集の一覧です。',
  newsCategory: {
    news: '宜野湾区青年会からのお知らせの一覧です。',
    event: '宜野湾区青年会の行事予定の一覧です。',
    recruit: '宜野湾区青年会の募集の一覧です。',
  },
  activities: '宜野湾区青年会のエイサーの演舞や地域の行事など、活動の記録です。',
  contact:
    '宜野湾区青年会への演舞依頼、入会希望、その他のお問い合わせを受け付けています。1週間以内に返信します。',
  privacy: '宜野湾区青年会のホームページでお預かりする個人情報の取り扱いについてご案内します。',
} as const;

/** 一覧が空のとき（06 §4.6） */
export const EMPTY = {
  upcomingEvents: '予定されている行事はありません。決まり次第お知らせします。',
  topNews: 'お知らせはまだありません。',
  news: '記事はまだありません。',
  newsCategory: 'このカテゴリの記事はまだありません。',
  activities: '活動記録はまだありません。',
} as const;

/** 問い合わせフォーム上部の案内（06 §4.1） */
export const CONTACT_NOTICE = {
  reply: {
    before: '1週間以内に返信します。返信がない場合は',
    link: 'InstagramのDM',
    after: 'でご連絡ください。',
  },
  autoReply:
    '送信後、受付確認の自動返信メールをお送りします。迷惑メールの設定や1日の送信数の上限により、自動返信メールが届かない場合があります。送信完了の画面が表示されれば、お問い合わせは受け付けています。',
  required: '「必須」の項目は必ず入力してください。',
} as const;

/** 問い合わせの種類（06 §4.1） */
export type InquiryKind = 'performance' | 'join' | 'other';
export const INQUIRY_KINDS: readonly { value: InquiryKind; label: string }[] = [
  { value: 'performance', label: '演舞依頼' },
  { value: 'join', label: '入会希望' },
  { value: 'other', label: 'その他' },
];

/** 問い合わせフォームの項目（06 §4.1「項目」）。種類で変わるものは種類ごとに持つ */
export const CONTACT_FIELDS = {
  kind: { label: 'お問い合わせの種類' },
  organization: {
    label: '団体名',
    placeholder: '例：〇〇自治会、〇〇株式会社',
    hint: {
      performance: '個人でのご依頼の場合は「個人」と入力してください。',
      other: '団体としてのお問い合わせの場合に入力してください。',
    },
  },
  name: {
    label: { performance: '担当者名', join: 'お名前', other: 'お名前' },
    placeholder: '例：宜野湾 太郎',
  },
  age: {
    label: '年齢',
    placeholder: '例：18',
    hint: (joinAgeLabel: string) =>
      `入会の対象は${joinAgeLabel}です。18歳未満の方は、保護者の方にもご確認ください。`,
  },
  email: {
    label: 'メールアドレス',
    placeholder: '例：example@example.com',
    hint: '返信はこのアドレスにお送りします。',
  },
  phone: {
    label: '電話番号',
    placeholder: '例：090-1234-5678',
    hint: '急ぎの連絡が必要な場合にお電話することがあります。',
  },
  preferred_datetime: {
    label: '希望日時',
    placeholder: '例：2027年8月20日（金）18時〜、または8月21日（土）の夕方',
    hint: '候補が複数ある場合は、すべて書いてください。',
  },
  venue: {
    label: '場所',
    placeholder: '例：〇〇公園（宜野湾市〇〇）',
    hint: '屋内か屋外かも書いてください。',
  },
  event_summary: {
    label: 'イベント内容',
    placeholder: '例：地域の夏祭り。来場者は約300人の予定です。',
    hint: 'イベントの名前、目的、来場者の数などを書いてください。',
  },
  performance_length: { label: '希望演舞時間', placeholder: '例：15分程度' },
  message: {
    label: { performance: '備考', join: '自由記入', other: 'お問い合わせ内容' },
    placeholder: {
      performance: '例：駐車場の有無、謝礼の予定など',
      join: '例：経験はありませんが興味があります',
      other: 'お問い合わせの内容を書いてください',
    },
  },
} as const;

/** 文字数の上限（06 §4.1。01 §3.8 と同じ） */
export const CONTACT_MAX_LENGTH = {
  organization: 100,
  name: 50,
  email: 254,
  phone: 20,
  preferred_datetime: 200,
  venue: 200,
  event_summary: 1000,
  performance_length: 50,
  message: 2000,
} as const;

/** 入会希望の案内（06 §4.1） */
export const JOIN_GUIDE = {
  lines: (joinAgeLabel: string) => [
    `入会の対象は${joinAgeLabel}です。`,
    '18歳未満の方は、保護者の方にもご確認ください。',
  ],
  under18: '保護者の方にもご確認のうえ、送信してください。',
} as const;

/** プライバシーポリシーへの同意（06 §4.1） */
export const PRIVACY_AGREEMENT = {
  link: 'プライバシーポリシー',
  after: 'に同意します（必須）',
} as const;

/** 送信ボタンと状態による案内（06 §4.1「状態による案内」） */
export const CONTACT_STATE = {
  submit: '送信する',
  sending: '送信しています…',
  sendingStatus: '送信しています。',
  slow: '時間がかかっています。画面を閉じずに、そのままお待ちください。',
  preview: 'プレビュー環境では送信できません。',
  noscript: {
    before: 'フォームの送信にはJavaScriptが必要です。お手数ですが、',
    after: 'でご連絡ください。',
  },
  turnstileLoadFailed:
    '「人間であることの確認」を読み込めませんでした。ページを再読み込みしてください。',
} as const;

/** 入力のエラーメッセージ（06 §4.1） */
export const CONTACT_ERRORS = {
  required: (label: string) => `${label}を入力してください。`,
  kind: 'お問い合わせの種類を選んでください。',
  tooLong: (max: number, count: number) =>
    `${max}文字以内で入力してください（いま${count}文字です）。`,
  email: 'メールアドレスの形式が正しくありません。例：example@example.com',
  phone: '電話番号は数字とハイフン（-）で入力してください。',
  age: (joinAgeLabel: string) =>
    `年齢は15から99までの数字で入力してください。入会の対象は${joinAgeLabel}です。`,
  privacy: '送信するには、プライバシーポリシーへの同意が必要です。',
  turnstilePending:
    '「人間であることの確認」が終わるまでお待ちください。表示されない場合は、ページを再読み込みしてください。',
  generic: (label: string) => `${label}の内容を確認してください。`,
  summary: '入力内容を確認してください。',
} as const;

/** 送信失敗・回数制限（06 §4.3）。本文の「InstagramのDM」はリンクにする */
export type SubmitFailure =
  'invalid' | 'turnstile' | 'rate_limited' | 'busy' | 'server' | 'network' | 'timeout';
export const SUBMIT_FAILURES: Record<SubmitFailure, { heading: string; body: string }> = {
  invalid: {
    heading: '入力内容を確認してください',
    body: '入力内容に誤りがあります。赤字の項目を直して、もう一度送信してください。',
  },
  turnstile: {
    heading: '確認に失敗しました',
    body: '「人間であることの確認」ができませんでした。もう一度送信してください。続く場合は、ページを再読み込みしてください。',
  },
  rate_limited: {
    heading: 'しばらく時間をおいてお試しください',
    body: '短い時間に送信が続いたため、受け付けできませんでした。時間をおいて、もう一度お試しください。お急ぎの場合は、InstagramのDMでご連絡ください。',
  },
  busy: {
    heading: 'ただいま混み合っています',
    body: 'ただいまフォームからのお問い合わせが混み合っているため、受け付けできませんでした。お手数ですが、明日以降にもう一度送信するか、InstagramのDMでご連絡ください。',
  },
  server: {
    heading: '送信できませんでした',
    body: 'お問い合わせを受け付けできませんでした。時間をおいて、もう一度送信してください。続けて送信できない場合は、InstagramのDMでご連絡ください。',
  },
  network: {
    heading: '送信できませんでした',
    body: '通信できませんでした。電波の状態を確認して、もう一度送信してください。お問い合わせが届いている場合もあります。同じ内容が重複して届いた場合は、こちらで確認しますのでご安心ください。',
  },
  timeout: {
    heading: '応答がありませんでした',
    body: '時間内に応答がなかったため、送信を中断しました。お問い合わせは届いている可能性があります。1週間を過ぎても返信がない場合は、InstagramのDMでご連絡ください。急ぎの場合は、もう一度送信してもかまいません（同じ内容が重複して届いた場合は、こちらで確認します）。',
  },
};

/** 本文の中でリンクにする語（06 §4.1・§4.3） */
export const INSTAGRAM_DM = 'InstagramのDM';
