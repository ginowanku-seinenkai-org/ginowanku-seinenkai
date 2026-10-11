// Lighthouse CI の設定（07 NF-01、05 §2.2 のジョブ lighthouse）。lhci は require() で読むため CommonJS（.cjs）にする
// build:fixture の dist を配信し、各 URL を3回測って中央値で判定する。既定でモバイルを想定して測る
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 3,
      url: [
        'http://localhost/index.html',
        'http://localhost/news/15.html',
        'http://localhost/activities/19.html',
        'http://localhost/contact.html',
      ],
    },
    assert: {
      assertions: {
        'largest-contentful-paint': [
          'error',
          { maxNumericValue: 2500, aggregationMethod: 'median' },
        ],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci/reports',
    },
  },
};
