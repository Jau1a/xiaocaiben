// 指数模块：A股指数实时行情（网易）+ 日K线（腾讯）+ MACD自算
const Market = {
  indexes: [
    { name: '上证指数', secid: '1.000001', tx: 'sh000001' },
    { name: '深证成指', secid: '0.399001', tx: 'sz399001' },
    { name: '创业板指', secid: '0.399006', tx: 'sz399006' },
    { name: '沪深300', secid: '1.000300', tx: 'sh000300' },
    { name: '科创50', secid: '1.000688', tx: 'sh000688' }
  ],
  current: 'sh000001',
  _chart: null,
  init() {
    const box = document.getElementById('indexChips');
    box.innerHTML = this.indexes.map(i => '<button class="chip ' + (i.tx === this.current ? 'on' : '') + '" data-tx="' + i.tx + '">' + i.name + '</button>').join('');
    box.querySelectorAll('.chip').forEach(b => b.onclick = () => {
      this.current = b.dataset.tx;
      box.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.refresh();
    });
    this.refresh();
  },
  cur() { return this.indexes.find(i => i.tx === this.current); },
  async refresh() {
    const idx = this.cur();
    document.getElementById('quoteCard').innerHTML = '<div class="quote-name">' + idx.name + '</div><div class="quote-price">加载中…</div>';
    // 1) 日K（最稳，用于图表与涨跌基准）
    let kline = null;
    try {
      kline = await this.loadKline(idx.tx, 320);
      this.renderChart(kline, idx);
    } catch (e) {
      document.getElementById('klineChart').innerHTML = '<p class="empty">K线加载失败：' + esc(e.message) + '</p>';
    }
    // 2) 分时接口取最新价（盘中实时，休市显示最近交易时段）
    let live = null;
    try {
      const r = await fetch('https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=' + idx.tx);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const d = j.data && j.data[idx.tx] && j.data[idx.tx].data;
      const rows = d && d.data;
      if (rows && rows.length) {
        const last = rows[rows.length - 1].split(' ');
        live = { time: last[0], price: parseFloat(last[1]), date: d.date ? String(d.date) : '' };
      }
    } catch (e) { /* 分时失败则用日K收盘兜底 */ }
    if (live) this.renderQuoteLive(live, kline, idx);
    else this.renderQuoteFromKline(kline, idx);
  },
  normDate(s) {
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    return s;
  },
  renderQuoteLive(live, kline, idx) {
    const sessionDate = this.normDate(live.date);
    let prevClose = null;
    if (kline && kline.length >= 2) {
      const i = kline.findIndex(x => x.date === sessionDate);
      if (i > 0) prevClose = kline[i - 1].close;
      else if (kline[kline.length - 1].date === sessionDate) prevClose = kline[kline.length - 2].close;
      else prevClose = kline[kline.length - 1].close;
    }
    const updown = prevClose ? live.price - prevClose : 0;
    const percent = prevClose ? updown / prevClose * 100 : 0;
    const up = updown >= 0;
    const isToday = sessionDate === today();
    const hm = live.time.slice(0, 2) + ':' + live.time.slice(2, 4);
    const label = isToday ? '盘中 ' + hm : sessionDate + ' 最近交易时段';
    document.getElementById('quoteCard').innerHTML =
      '<div class="quote-name">' + esc(idx.name) + '</div>' +
      '<div class="quote-price ' + (up ? 'up' : 'down') + '">' + fmt(live.price) + '</div>' +
      '<div class="quote-sub ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + fmt(updown) + '　' + (up ? '+' : '') + percent.toFixed(2) + '%</div>' +
      '<div class="quote-time">' + label + '</div>';
  },
  renderQuoteFromKline(kline, idx) {
    if (!kline || kline.length < 2) {
      document.getElementById('quoteCard').innerHTML = '<div class="quote-name">' + idx.name + '</div><div class="quote-price">行情获取失败</div><div class="quote-time">请点右上角刷新重试</div>';
      return;
    }
    const last = kline[kline.length - 1];
    const prev = kline[kline.length - 2];
    const updown = last.close - prev.close;
    const percent = prev.close ? updown / prev.close * 100 : 0;
    const up = updown >= 0;
    document.getElementById('quoteCard').innerHTML =
      '<div class="quote-name">' + esc(idx.name) + ' <span style="color:#bbb">（实时接口暂不可用，显示最新收盘）</span></div>' +
      '<div class="quote-price ' + (up ? 'up' : 'down') + '">' + fmt(last.close) + '</div>' +
      '<div class="quote-sub ' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + fmt(updown) + '　' + (up ? '+' : '') + percent.toFixed(2) + '%</div>' +
      '<div class="quote-time">' + last.date + ' 收盘</div>';
  },
  async loadKline(code, n) {
    const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + code + ',day,,,' + n + ',qfq';
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const d = j.data && j.data[code];
    const rows = (d && (d.day || d.qfqday)) || [];
    if (!rows.length) throw new Error('无K线数据');
    return rows.map(x => ({ date: x[0], open: +x[1], close: +x[2], high: +x[3], low: +x[4], vol: +x[5] || 0 }));
  },
  calcMA(closes, n) {
    const out = [];
    for (let i = 0; i < closes.length; i++) {
      if (i < n - 1) { out.push(null); continue; }
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += closes[j];
      out.push(+(s / n).toFixed(3));
    }
    return out;
  },
  calcMACD(closes) {
    const ema = (arr, n) => {
      const k = 2 / (n + 1), out = [arr[0]];
      for (let i = 1; i < arr.length; i++) out.push(arr[i] * k + out[i - 1] * (1 - k));
      return out;
    };
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const dif = closes.map((_, i) => e12[i] - e26[i]);
    const dea = ema(dif, 9);
    return {
      dif: dif.map(x => +x.toFixed(3)),
      dea: dea.map(x => +x.toFixed(3)),
      macd: dif.map((v, i) => +((v - dea[i]) * 2).toFixed(3))
    };
  },
  renderChart(kline, idx) {
    const el = document.getElementById('klineChart');
    if (!window.echarts) { el.innerHTML = '<p class="empty">图表库未加载</p>'; return; }
    if (!this._chart) this._chart = window.echarts.init(el);
    const dates = kline.map(x => x.date);
    const ohlc = kline.map(x => [x.open, x.close, x.low, x.high]);
    const closes = kline.map(x => x.close);
    const vols = kline.map(x => ({ value: x.vol, itemStyle: { color: x.close >= x.open ? '#e05252' : '#3fae6b' } }));
    const m = this.calcMACD(closes);
    const bars = m.macd.map(v => ({ value: v, itemStyle: { color: v >= 0 ? '#e05252' : '#3fae6b' } }));
    const axisX = [0, 1, 2].map(i => ({
      type: 'category', gridIndex: i, data: dates, boundaryGap: true,
      axisLine: { lineStyle: { color: '#ccc' } },
      axisLabel: i === 2 ? { fontSize: 9 } : { show: false },
      axisTick: { show: false }
    }));
    this._chart.setOption({
      animation: false,
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
      grid: [
        { left: 48, right: 12, top: 16, height: '42%' },
        { left: 48, right: 12, top: '54%', height: '12%' },
        { left: 48, right: 12, top: '70%', height: '16%' }
      ],
      xAxis: axisX,
      yAxis: [
        { scale: true, gridIndex: 0, splitLine: { lineStyle: { color: '#f0f0f0' } } },
        { gridIndex: 1, axisLabel: { show: false }, splitLine: { show: false } },
        { scale: true, gridIndex: 2, splitLine: { lineStyle: { color: '#f0f0f0' } } }
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0, 1, 2], start: 55, end: 100 },
        { type: 'slider', xAxisIndex: [0, 1, 2], bottom: 0, height: 14, start: 55, end: 100 }
      ],
      series: [
        { name: idx.name, type: 'candlestick', data: ohlc, xAxisIndex: 0, yAxisIndex: 0, itemStyle: { color: '#e05252', color0: '#3fae6b', borderColor: '#e05252', borderColor0: '#3fae6b' } },
        { name: 'MA5', type: 'line', data: this.calcMA(closes, 5), xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#f0a020' } },
        { name: 'MA10', type: 'line', data: this.calcMA(closes, 10), xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#3b8ff0' } },
        { name: 'MA20', type: 'line', data: this.calcMA(closes, 20), xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: '#b05ce0' } },
        { name: '成交量', type: 'bar', data: vols, xAxisIndex: 1, yAxisIndex: 1, barWidth: '60%' },
        { name: 'MACD', type: 'bar', data: bars, xAxisIndex: 2, yAxisIndex: 2, barWidth: '60%' },
        { name: 'DIF', type: 'line', data: m.dif, xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, lineStyle: { width: 1, color: '#f0a020' } },
        { name: 'DEA', type: 'line', data: m.dea, xAxisIndex: 2, yAxisIndex: 2, showSymbol: false, lineStyle: { width: 1, color: '#3b8ff0' } }
      ]
    }, true);
    this._chart.resize();
  }
};
