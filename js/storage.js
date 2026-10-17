// 本地存储封装（单机版，数据只存在本机浏览器）
const Store = {
  _prefix: 'xc_',
  get(key, def) {
    try {
      const v = localStorage.getItem(this._prefix + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  set(key, val) {
    localStorage.setItem(this._prefix + key, JSON.stringify(val));
  },
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
};
