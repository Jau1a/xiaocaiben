// 通用工具：格式化、JSONP、弹窗
function fmt(n, digits) {
  if (digits === undefined) digits = 2;
  const v = Number(n || 0);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n) {
  const v = Number(n || 0);
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function jsonp(url, timeout) {
  return new Promise((resolve, reject) => {
    const cb = '__cb' + Date.now() + Math.floor(Math.random() * 1e4);
    const s = document.createElement('script');
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    const t = setTimeout(() => { cleanup(); reject(new Error('请求超时')); }, timeout || 10000);
    function cleanup() { try { delete window[cb]; } catch (e) {} s.remove(); clearTimeout(t); }
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error('网络错误')); };
    document.head.appendChild(s);
  });
}
function loadScript(url, timeout) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    const t = setTimeout(() => { s.remove(); reject(new Error('加载超时')); }, timeout || 15000);
    s.onload = () => { clearTimeout(t); resolve(); };
    s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('加载失败')); };
    document.head.appendChild(s);
  });
}
function openModal() { document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); document.getElementById('modalBox').innerHTML = ''; }
let __toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(__toastTimer);
  __toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}
