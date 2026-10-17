// 应用入口（单页版）：行情 / 估值刷新、定时更新、PWA 注册
function initApp() {
  document.getElementById('tbRefreshM').onclick = () => { Market.refresh(); Advice.renderMarketSig(); };
  document.getElementById('tbRefreshF').onclick = () => { Fund.refreshAll().then(() => Advice.render()).catch(() => Advice.render()); };
  Market.init();
  Fund.init();
  Advice.render();
  // 盘中每5分钟自动刷新基金估值与建议
  setInterval(() => {
    Fund.refreshAll().then(() => Advice.render()).catch(() => {});
  }, 5 * 60 * 1000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
document.addEventListener('DOMContentLoaded', initApp);
