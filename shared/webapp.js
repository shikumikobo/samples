// Web アプリの画面の共通の部品（Google の外に置く画面で使う。build.py が samples/_web-app-src/shared/ にコピーする）。
// 処理は GAS の Web アプリ（受け口 doPost）に fetch で送る。考え方は samples/_shared/gas/modules/webapp.js の頭。
//
// 画面の URL：<画面>.html?s=<受け口のデプロイID>&k=<合言葉>
//   s と k は台帳の「設定」から作る（メニュー「〜の画面の URL を出す」）。画面のファイルには、お客さんごとの値を書かない。
//
// 使い方：<script src="../shared/webapp.js"></script> のあとに、画面のスクリプトで
//   WebApp.ready() … URL が正しいか（正しくなければ画面に理由を出して false）
//   WebApp.call('photo', 'sites', payload) … 処理を呼ぶ（Promise。失敗は Error の message に画面に出す言葉）
//   WebApp.shrinkImage(file, 1600) … 写真の長い辺を縮め、JPEG の base64 にする（Promise）
//   WebApp.shrinkImage(file, [1600, 240]) … 大きさを並べると、それぞれの base64 を並べて返す（写真を読むのは1回）
//   WebApp.digest(file) … 元のファイルの SHA-256（同じ写真かを見分ける。Promise）
//   WebApp.readBase64(file) … ファイルをそのまま base64 にする（PDF など、縮めないもの。Promise）
//   WebApp.link('list.html', {site: 'S-2611-05'}) … 同じ置き場所の画面への URL（s と k を付ける）
//   WebApp.param('site') … URL の値
//   WebApp.remember('who') … 入力の値をこの端末に覚える（名前など）
//   WebApp.show(text, isError) … 画面の下の知らせの欄（id="out"）に出す

(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const deploymentId = params.get('s') || '';
  const key = params.get('k') || '';
  const endpoint = 'https://script.google.com/macros/s/' + encodeURIComponent(deploymentId) + '/exec';
  // 送ってから返事を待つ長さ。写真を送るときは GAS の処理に数秒かかる
  const TIMEOUT_MS = 60 * 1000;

  function show(text, isError) {
    const out = document.getElementById('out');
    if (!out) return;
    out.hidden = false;
    out.textContent = text;
    out.className = isError ? 'msg err' : 'msg';
  }

  /** URL に受け口と合言葉が付いているか。なければ画面にそう出す。 */
  function ready() {
    if (/^[\w-]{20,}$/.test(deploymentId) && /^[a-z0-9]{6,}$/.test(key)) return true;
    show('この URL では送れません。送られてきた URL を、そのまま開いてください。', true);
    document.querySelectorAll('button, input, select, textarea').forEach(function (el) { el.disabled = true; });
    return false;
  }

  /**
   * 処理を呼ぶ。本文は text/plain のまま送る（JSON の形にすると、送る前の確認（preflight）が要り、GAS が受けられない）。
   * Google のログインの情報（クッキー）は付けない（credentials: 'omit'）。付くと、ログインしているブラウザで止まる。
   */
  function call(app, action, payload) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    return fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      redirect: 'follow',
      body: JSON.stringify({ app: app, action: action, key: key, payload: payload || {} }),
      signal: controller ? controller.signal : undefined,
    }).then(function (res) {
      if (!res.ok) throw new Error('http ' + res.status);
      return res.json();
    }).catch(function () {
      throw new Error('送れませんでした。電波のよいところで、もう一度送ってください');
    }).then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.error) || '送れませんでした。もう一度送ってください');
      return data.result;
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  /**
   * 写真の長い辺を max ピクセルに縮め、JPEG の base64（data: の後ろ）にする。
   * max に大きさを並べると、それぞれに縮めた base64 を並べて返す（小さいものは画質を下げて軽くする）。
   */
  function shrinkImage(file, max) {
    const sizes = Array.isArray(max) ? max : [max];
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const out = sizes.map(function (size) {
          const s = Math.min(1, size / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', size <= 400 ? 0.7 : 0.85).split(',')[1];
        });
        URL.revokeObjectURL(url);
        resolve(Array.isArray(max) ? out : out[0]);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('写真を読めませんでした（iPhone は「設定」→「カメラ」→「フォーマット」を「互換性優先」にすると送れます）'));
      };
      img.src = url;
    });
  }

  /** 元のファイルの SHA-256（16進の64文字）。計算できないブラウザでは空（同じ写真を見分けない）。 */
  function digest(file) {
    if (!(window.crypto && crypto.subtle && file.arrayBuffer)) return Promise.resolve('');
    return file.arrayBuffer().then(function (buf) {
      return crypto.subtle.digest('SHA-256', buf);
    }).then(function (hash) {
      return Array.from(new Uint8Array(hash)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }).catch(function () { return ''; });
  }

  /** ファイルをそのまま base64（data: の後ろ）にする。 */
  function readBase64(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1] || ''); };
      reader.onerror = function () { reject(new Error('ファイルを読めませんでした')); };
      reader.readAsDataURL(file);
    });
  }

  /** 同じ置き場所の、ほかの画面への URL（受け口と合言葉を付ける）。 */
  function link(page, extra) {
    const q = new URLSearchParams({ s: deploymentId, k: key });
    Object.keys(extra || {}).forEach(function (name) { if (extra[name]) q.set(name, extra[name]); });
    return page + '?' + q.toString();
  }

  function param(name) {
    return params.get(name) || '';
  }

  /** 入力の値をこの端末に覚える（次に開いたときに入っている）。 */
  function remember(id) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      el.value = localStorage.getItem('webapp.' + id) || el.value;
      el.addEventListener('change', function () { localStorage.setItem('webapp.' + id, el.value); });
    } catch (e) {
      // 覚えられないブラウザ（プライベートの画面など）では、毎回入れてもらう
    }
  }

  window.WebApp = {
    ready: ready, call: call, shrinkImage: shrinkImage, digest: digest, readBase64: readBase64, link: link, param: param, remember: remember, show: show,
  };
})();
