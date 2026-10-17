// 基金模块：持仓记录（买入/卖出）、估值刷新（天天基金）、持仓盈亏
const Fund = {
  _chart: null,
  _selected: null,
  trades() { return Store.get('fund_trades', []); },
  saveTrades(l) { Store.set('fund_trades', l); },
  names() { return Store.get('fund_names', {}); },
  saveName(code, name) { const n = this.names(); n[code] = name; Store.set('fund_names', n); },
  navs() { return Store.get('fund_navs', {}); },
  saveNavs(code, arr) { const n = this.navs(); n[code] = arr; Store.set('fund_navs', n); },
  cache() { return Store.get('fund_cache', {}); },
  saveCache(c) { Store.set('fund_cache', c); },
  fundList() { return Store.get('fund_list', []); },
  saveFundList(l) { Store.set('fund_list', l); },
  addTrade(t) { const l = this.trades(); l.push(Object.assign({ id: Store.uid(), ts: Date.now() }, t)); this.saveTrades(l); },
  delTrade(id) { this.saveTrades(this.trades().filter(x => x.id !== id)); },

  init() {
    document.getElementById('fundAddBtn').onclick = () => this.addFund();
    document.getElementById('fundCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.addFund(); });
    this.render();
    this.refreshAll();
  },

  async addFund() {
    const inp = document.getElementById('fundCodeInput');
    const code = inp.value.trim();
    if (!/^\d{6}$/.test(code)) { toast('请输入6位基金代码'); return; }
    toast('正在查询基金信息…');
    try {
      const info = await this.loadPingzhong(code);
      this.saveName(code, info.name);
      this.saveNavs(code, info.navs.slice(-160));
      const fl = this.fundList();
      if (!fl.includes(code)) fl.push(code);
      this.saveFundList(fl);
      inp.value = '';
      toast('已添加：' + info.name + '，请录入持仓');
      this.render(); this.refreshAll();
      this.openTrade('buy', code); // 直接弹出买入录入
    } catch (e) { toast('查询失败：' + e.message); }
  },

  // 天天基金净值历史（脚本加载方式，无跨域限制）
  loadPingzhong(code) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://fund.eastmoney.com/pingzhongdata/' + code + '.js';
      const t = setTimeout(() => { s.remove(); reject(new Error('查询超时')); }, 15000);
      s.onload = () => {
        clearTimeout(t);
        try {
          const navs = (window.Data_netWorthTrend || []).map(x => {
            const d = new Date(x.x);
            return { d: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), n: +x.y };
          });
          if (!navs.length) throw new Error('无净值数据');
          resolve({ name: window.fS_name || code, navs: navs });
        } catch (e) { reject(e); }
      };
      s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('代码不存在或网络错误')); };
      document.head.appendChild(s);
    });
  },

  async refreshAll() {
    const codes = Object.keys(this.positionRows().reduce((a, r) => { a[r.code] = 1; return a; }, {}));
    for (const code of codes) {
      try {
        const d = await jsonp('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?pageIndex=1&pageSize=1&plat=Android&appType=ttjj&product=EFund&Version=1&deviceid=xc123456&Fcodes=' + code);
        const it = d && d.Datas && d.Datas[0];
        if (it) {
          const c = this.cache();
          c[code] = {
            nav: it.GSZ ? +it.GSZ : +it.NAV,
            date: it.GZTIME || it.PDATE || '',
            gszzl: it.GSZZL ? +it.GSZZL : (+it.NAVCHGRT || 0),
            name: it.SHORTNAME || ''
          };
          this.saveCache(c);
        }
      } catch (e) { /* 接口失败时沿用缓存或净值历史 */ }
    }
    this.render();
  },

  positionRows() {
    const codes = [...new Set([...this.fundList(), ...this.trades().map(t => t.code)])];
    return codes.map(code => {
      const r = { code: code, name: this.names()[code] || code, buyAmt: 0, buyShares: 0 };
      this.trades().forEach(t => {
        if (t.code !== code || t.type !== 'buy') return;
        r.buyAmt += +t.amount * (1 - (+t.feeRate || 0));
        r.buyShares += +t.shares;
      });
      return r;
    });
  },

  latestNav(code) {
    const c = this.cache()[code];
    if (c && c.nav) return { nav: c.nav, date: c.date, gszzl: c.gszzl, name: c.name };
    const navs = this.navs()[code];
    if (navs && navs.length) { const last = navs[navs.length - 1]; return { nav: last.n, date: last.d, gszzl: 0 }; }
    return null;
  },

  calc(r) {
    const nav = this.latestNav(r.code);
    r.nav = nav ? nav.nav : 0;
    r.navDate = nav ? nav.date : '';
    r.gzszl = nav ? nav.gszzl : 0;
    r.avgCost = r.buyShares > 0 ? r.buyAmt / r.buyShares : 0;
    const sells = this.trades().filter(t => t.type === 'sell' && t.code === r.code);
    r.sellShares = sells.reduce((s, t) => s + (+t.shares || 0), 0);
    r.shares = r.buyShares - r.sellShares;
    r.costVal = r.avgCost * r.shares;
    r.val = r.nav * r.shares;
    r.pnl = r.val - r.costVal;
    r.pnlRate = r.costVal > 0 ? r.pnl / r.costVal : 0;
    r.realized = sells.reduce((s, t) => s + (+t.shares || 0) * ((+t.nav || 0) - r.avgCost), 0);
    return r;
  },

  render() {
    const rows = this.positionRows().map(r => this.calc(r));
    let totalVal = 0, totalCost = 0;
    rows.forEach(r => { totalVal += r.val; totalCost += r.costVal; });
    const pnl = totalVal - totalCost;
    document.getElementById('fundSummary').innerHTML =
      '<div class="sum-item"><span>持仓市值</span><b>' + fmt(totalVal) + '</b></div>' +
      '<div class="sum-item"><span>持仓成本</span><b>' + fmt(totalCost) + '</b></div>' +
      '<div class="sum-item"><span>浮动盈亏</span><b class="' + (pnl >= 0 ? 'up' : 'down') + '">' + fmt(pnl) + '</b></div>';

    const ul = document.getElementById('fundList');
    if (!rows.length) {
      ul.innerHTML = '<p class="empty">还没有基金，输入代码添加（如 110022 易方达消费行业股票）</p>';
      document.getElementById('fundChart').innerHTML = '';
      return;
    }
    ul.innerHTML = rows.map(r => {
      const c = (r.pnl >= 0 ? 'up' : 'down');
      return '<div class="row" data-code="' + r.code + '">' +
        '<div class="row-main" style="min-width:0"><div>' +
        '<div class="row-title">' + esc(r.name) + ' <span class="row-note">' + r.code + '</span></div>' +
        '<div class="row-sub">份额 ' + fmt(r.shares, 0) + '　净值 ' + fmt(r.nav, 4) + '　' + esc(r.navDate || '') + '</div>' +
        '<div class="row-sub ' + c + '">' +
        (r.buyShares > 0
          ? '盈亏 ' + fmt(r.pnl) + '（' + fmtPct(r.pnlRate * 100) + '）' + (r.gzszl ? '　今日' + fmtPct(r.gzszl) : '')
          : '未录入持仓，点击"买入"') + '</div></div></div>' +
        '<div class="fund-ops">' +
        '<button class="op-buy" data-op="buy" data-code="' + r.code + '">买入</button>' +
        (r.shares > 0
          ? '<button class="op-sell" data-op="sell" data-code="' + r.code + '">卖出</button>'
          : '<button class="op-init" data-op="init" data-code="' + r.code + '">录持仓</button>') +
        '<button class="op-del" data-op="del" data-code="' + r.code + '">✕</button>' +
        '</div></div>';
    }).join('');
    ul.querySelectorAll('.row').forEach(row => row.onclick = () => { this._selected = row.dataset.code; this.renderChart(); });
    ul.querySelectorAll('.op-buy').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); this.openTrade('buy', b.dataset.code); });
    ul.querySelectorAll('.op-sell').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); this.openTrade('sell', b.dataset.code); });
    ul.querySelectorAll('.op-init').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); this.openInitial(b.dataset.code); });
    ul.querySelectorAll('.op-del').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); this.deleteFund(b.dataset.code); });
    if (!this._selected || !rows.some(r => r.code === this._selected)) this._selected = rows[0].code;
    this.renderChart();
  },

  renderChart() {
    const el = document.getElementById('fundChart');
    const r = this.positionRows().map(x => this.calc(x)).find(x => x.code === this._selected);
    if (!r || !window.echarts) { el.innerHTML = ''; return; }
    const navs = this.navs()[r.code] || [];
    if (!this._chart) this._chart = window.echarts.init(el);
    this._chart.setOption({
      title: { text: esc(r.name) + ' 净值走势（黄线=成本 ' + fmt(r.avgCost, 4) + '）', left: 'center', textStyle: { fontSize: 12, color: '#888' } },
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 16, top: 36, bottom: 26 },
      xAxis: { type: 'category', data: navs.map(x => x.d), axisLabel: { fontSize: 9 } },
      yAxis: { scale: true, splitLine: { lineStyle: { color: '#f0f0f0' } } },
      dataZoom: [{ type: 'inside', start: 55, end: 100 }],
      series: [{
        type: 'line', data: navs.map(x => x.n), showSymbol: false,
        lineStyle: { color: '#3b5bdb', width: 1.5 },
        markLine: r.avgCost > 0 ? { symbol: 'none', lineStyle: { color: '#f0a020', type: 'dashed' }, data: [{ yAxis: +r.avgCost.toFixed(4) }] } : { silent: true, data: [] }
      }]
    }, true);
    this._chart.resize();
  },

  navOn(date, code) {
    const navs = this.navs()[code] || [];
    const hit = navs.find(x => x.d === date);
    if (hit) return hit.n;
    if (navs.length) return navs[navs.length - 1].n;
    const c = this.latestNav(code);
    return c ? c.nav : '';
  },

  deleteFund(code) {
    if (!confirm('删除该基金及其全部交易记录？')) return;
    this.saveFundList(this.fundList().filter(c => c !== code));
    this.saveTrades(this.trades().filter(t => t.code !== code));
    const n = this.names(); delete n[code]; Store.set('fund_names', n);
    const v = this.navs(); delete v[code]; Store.set('fund_navs', v);
    const c = this.cache(); delete c[code]; Store.set('fund_cache', c);
    if (this._selected === code) this._selected = null;
    toast('已删除');
    this.render();
  },

  openInitial(code) {
    const r = this.positionRows().map(x => this.calc(x)).find(x => x.code === code);
    const navNow = this.navOn(today(), code);
    let mode = 'total'; // total=按成本+市值 / unit=按份额+单价
    const draw = () => {
      document.getElementById('modalBox').innerHTML =
        '<h3>录入已有持仓：' + esc(r.name) + '</h3>' +
        '<p style="color:#888;font-size:12px;margin-bottom:8px">最新净值 ' + (navNow || '未知') + '，两种方式任选</p>' +
        '<div class="seg">' +
        '<button class="' + (mode === 'total' ? 'on' : '') + '" data-m="total">按成本+市值</button>' +
        '<button class="' + (mode === 'unit' ? 'on' : '') + '" data-m="unit">按份额+单价</button></div>' +
        (mode === 'total'
          ? '<input id="tCost" type="number" step="0.01" min="0" placeholder="投入成本（元）" class="inp">' +
            '<input id="tValue" type="number" step="0.01" min="0" placeholder="当前市值（元）" class="inp">'
          : '<input id="tShares" type="number" step="0.01" min="0.01" placeholder="持有份额" class="inp">' +
            '<input id="tUnit" type="number" step="0.0001" min="0" placeholder="成本单价（元/份）" class="inp" value="' + navNow + '">') +
        '<input id="tDate" type="date" class="inp" value="' + today() + '">' +
        '<div id="tPreview" style="color:#3b5bdb;font-size:12px;min-height:18px;margin:0 2px 8px"></div>' +
        '<div class="btn-row"><button id="tCancel" class="btn ghost">取消</button><button id="tSave" class="btn">保存</button></div>';
      document.querySelectorAll('#modalBox .seg button').forEach(b => b.onclick = () => { mode = b.dataset.m; draw(); });
      const upd = () => {
        const p = document.getElementById('tPreview');
        if (mode === 'total') {
          const cost = parseFloat(document.getElementById('tCost').value);
          const val = parseFloat(document.getElementById('tValue').value);
          if (navNow && cost > 0 && val > 0) {
            const shares = val / navNow;
            const unit = cost / shares;
            p.textContent = '将生成：份额 ' + fmt(shares, 2) + '，成本单价 ' + fmt(unit, 4) + '，当前盈亏 ' + fmt(val - cost) + '（' + fmtPct((val - cost) / cost * 100) + '）';
          } else p.textContent = '';
        } else {
          const shares = parseFloat(document.getElementById('tShares').value);
          const unit = parseFloat(document.getElementById('tUnit').value);
          if (shares > 0 && unit > 0) {
            const cost = shares * unit;
            p.textContent = '成本 ' + fmt(cost) + '，当前市值 ' + (navNow ? fmt(shares * navNow) : '未知') + (navNow ? '，盈亏 ' + fmt(shares * navNow - cost) + '（' + fmtPct((shares * navNow - cost) / cost * 100) + '）' : '');
          } else p.textContent = '';
        }
      };
      ['tCost', 'tValue', 'tShares', 'tUnit'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.oninput = upd;
      });
      document.getElementById('tCancel').onclick = closeModal;
      document.getElementById('tSave').onclick = () => {
        const date = document.getElementById('tDate').value || today();
        let shares, cost;
        if (mode === 'total') {
          const c = parseFloat(document.getElementById('tCost').value);
          const v = parseFloat(document.getElementById('tValue').value);
          if (!c || c <= 0) { toast('请填写投入成本'); return; }
          if (!v || v <= 0) { toast('请填写当前市值'); return; }
          if (!navNow) { toast('无法获取净值，请改用"按份额+单价"'); return; }
          shares = v / navNow;
          cost = c / shares;
        } else {
          shares = parseFloat(document.getElementById('tShares').value);
          cost = parseFloat(document.getElementById('tUnit').value);
          if (!shares || shares <= 0) { toast('请填写份额'); return; }
          if (!cost || cost <= 0) { toast('请填写成本单价'); return; }
        }
        this.addTrade({ code: code, name: r.name, type: 'buy', date: date, amount: shares * cost, feeRate: 0, nav: cost, shares: shares, note: '存量持仓' });
        closeModal(); this.render();
      };
    };
    draw();
    openModal();
  },

  openTrade(type, code) {
    const r = this.positionRows().map(x => this.calc(x)).find(x => x.code === code);
    const isBuy = type === 'buy';
    const navDefault = this.navOn(today(), code);
    document.getElementById('modalBox').innerHTML =
      '<h3>' + (isBuy ? '买入' : '卖出') + '：' + esc(r.name) + '</h3>' +
      '<input id="tDate" type="date" class="inp" value="' + today() + '">' +
      (isBuy
        ? '<input id="tAmount" type="number" step="0.01" min="0.01" placeholder="买入金额（元）" class="inp">' +
          '<input id="tFee" type="number" step="0.0001" min="0" placeholder="申购费率（如 0.0015，可不填）" class="inp">' +
          '<input id="tNav" type="number" step="0.0001" min="0" placeholder="当日净值（自动带出，可改）" class="inp" value="' + navDefault + '">'
        : '<input id="tShares" type="number" step="0.01" min="0.01" placeholder="卖出份额" class="inp">' +
          '<input id="tNav" type="number" step="0.0001" min="0" placeholder="卖出净值（自动带出，可改）" class="inp" value="' + navDefault + '">') +
      '<div class="btn-row"><button id="tCancel" class="btn ghost">取消</button><button id="tSave" class="btn">保存</button></div>';
    document.getElementById('tCancel').onclick = closeModal;
    document.getElementById('tDate').onchange = () => {
      const d = document.getElementById('tDate').value;
      const n = this.navOn(d, code);
      if (n) document.getElementById('tNav').value = n;
    };
    document.getElementById('tSave').onclick = () => {
      const date = document.getElementById('tDate').value || today();
      const nav = parseFloat(document.getElementById('tNav').value);
      if (!nav || nav <= 0) { toast('请填写净值'); return; }
      if (isBuy) {
        const amount = parseFloat(document.getElementById('tAmount').value);
        if (!amount || amount <= 0) { toast('请填写金额'); return; }
        const fee = parseFloat(document.getElementById('tFee').value) || 0;
        this.addTrade({ code: code, name: r.name, type: 'buy', date: date, amount: amount, feeRate: fee, nav: nav, shares: amount * (1 - fee) / nav });
      } else {
        const shares = parseFloat(document.getElementById('tShares').value);
        if (!shares || shares <= 0) { toast('请填写份额'); return; }
        this.addTrade({ code: code, name: r.name, type: 'sell', date: date, shares: shares, nav: nav });
      }
      closeModal(); this.render();
    };
    openModal();
  }
};
