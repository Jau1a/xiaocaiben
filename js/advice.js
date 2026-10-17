// 建议模块：大盘信号 + 基金信号 + 规则化建议（补/持有/撤），嵌入单页布局
const Advice = {
  _marketScore: 0,
  valMap() { return Store.get('fund_val', {}); },
  saveVal(code, pct) {
    const m = this.valMap();
    m[code] = { pct: +pct, date: today() };
    Store.set('fund_val', m);
  },

  async render() {
    await this.renderMarketSig();
    this.renderFundAdvice();
  },

  async renderMarketSig() {
    const el = document.getElementById('advMarket');
    el.innerHTML = '<p class="empty">加载中…</p>';
    let score = 0;
    try {
      const sigs = await this.marketSignals();
      score = sigs.score;
      el.innerHTML = sigs.lines.map(s =>
        '<div class="sig-row"><span>' + esc(s.name) + '</span><span class="advice-tag ' + s.tagCls + '">' + esc(s.tag) + '</span><span class="sig-desc">' + esc(s.desc) + '</span></div>'
      ).join('');
    } catch (e) {
      el.innerHTML = '<p class="empty">大盘信号获取失败：' + esc(e.message) + '</p>';
    }
    this._marketScore = score;
  },

  renderFundAdvice() {
    const rows = Fund.positionRows().map(r => Fund.calc(r));
    const el = document.getElementById('advFunds');
    if (!rows.length) {
      el.innerHTML = '<p class="empty">添加基金并录入持仓后，这里自动给出信号与建议</p>';
      return;
    }
    el.innerHTML = rows.map(r => this.fundBlock(r, this._marketScore)).join('');
    el.querySelectorAll('.val-save').forEach(b => b.onclick = () => {
      const code = b.dataset.code;
      const inp = el.querySelector('.val-input[data-code="' + code + '"]');
      const v = parseFloat(inp.value);
      if (isNaN(v) || v < 0 || v > 100) { toast('估值分位填0-100的数字'); return; }
      this.saveVal(code, v);
      toast('估值分位已保存');
      this.renderFundAdvice();
    });
  },

  // 大盘：上证+创业板，各算趋势分
  async marketSignals() {
    const items = [
      { name: '上证指数', tx: 'sh000001' },
      { name: '创业板指', tx: 'sz399006' }
    ];
    let score = 0;
    const lines = [];
    for (const it of items) {
      try {
        const kline = await Market.loadKline(it.tx, 120);
        const closes = kline.map(x => x.close);
        const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const m = Market.calcMACD(closes);
        const last = closes[closes.length - 1];
        const dif = m.dif[m.dif.length - 1], dea = m.dea[m.dea.length - 1];
        const above = last >= ma20 ? 1 : -1;
        const golden = dif >= dea ? 1 : -1;
        const s = above + golden;
        score += s;
        const tag = s >= 2 ? '偏多' : s >= 0 ? '偏强' : s <= -2 ? '偏空' : '偏弱';
        lines.push({
          name: it.name,
          tag: tag,
          tagCls: s >= 0 ? 'tag-up' : 'tag-down',
          desc: (above > 0 ? '站上' : '跌破') + '20日线，MACD' + (golden > 0 ? '金叉' : '死叉') + '，收 ' + fmt(last)
        });
      } catch (e) {
        lines.push({ name: it.name, tag: '—', tagCls: 'tag-flat', desc: '获取失败' });
      }
    }
    return { score: score, lines: lines };
  },

  fundSignal(r) {
    const navs = Fund.navs()[r.code] || [];
    if (navs.length < 25) return { score: 0, tag: '数据不足', tagCls: 'tag-flat', desc: '净值历史不足25天' };
    const closes = navs.map(x => x.n);
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const m = Market.calcMACD(closes);
    const last = closes[closes.length - 1];
    const dif = m.dif[m.dif.length - 1], dea = m.dea[m.dea.length - 1];
    const above = last >= ma20 ? 1 : -1;
    const golden = dif >= dea ? 1 : -1;
    const s = above + golden;
    const tag = s >= 2 ? '偏多' : s >= 0 ? '偏强' : s <= -2 ? '偏空' : '偏弱';
    return {
      score: s, tag: tag, tagCls: s >= 0 ? 'tag-up' : 'tag-down',
      desc: '净值' + (above > 0 ? '站上' : '跌破') + '20日线，MACD' + (golden > 0 ? '金叉' : '死叉') + '，最新净值 ' + fmt(last, 4)
    };
  },

  adviceByTrend(c) {
    if (c >= 2) return '补：趋势偏强，可分批加仓定投';
    if (c <= -2) return '撤：趋势偏弱，可减仓观望或暂停定投';
    return '持有：震荡格局，按原计划定投';
  },

  fundBlock(r, marketScore) {
    const sig = this.fundSignal(r);
    const combined = sig.score + marketScore;
    const val = this.valMap()[r.code];
    let sug;
    if (val) {
      if (val.pct < 30) sug = combined >= -1 ? '补：处于低估区（' + val.pct + '%分位），可分批加仓定投' : '持有：低估但趋势弱，可小额定投、不加仓';
      else if (val.pct > 70) sug = combined <= 1 ? '撤：处于高估区（' + val.pct + '%分位），可分批止盈' : '持有：高估但趋势强，可持有观望、不加仓';
      else sug = this.adviceByTrend(combined) + '（估值' + val.pct + '%分位）';
    } else {
      sug = this.adviceByTrend(combined);
    }
    const tagCls = sug.startsWith('补') ? 'tag-up' : sug.startsWith('撤') ? 'tag-down' : 'tag-flat';
    const adviceTag = sug.slice(0, sug.indexOf('：'));
    return '<div class="sig-card">' +
      '<div class="sig-head"><b>' + esc(r.name) + '</b><span class="advice-tag ' + tagCls + '">' + adviceTag + '</span></div>' +
      '<div class="sig-row"><span>趋势</span><span class="advice-tag ' + sig.tagCls + '">' + sig.tag + '</span><span class="sig-desc">' + esc(sig.desc) + '</span></div>' +
      '<div class="sig-desc">' + esc(sug) + '</div>' +
      '<div class="sig-row" style="margin-top:6px"><span>估值分位(%)</span>' +
      '<input class="inp val-input" data-code="' + r.code + '" type="number" min="0" max="100" placeholder="选填，如 45" value="' + (val ? val.pct : '') + '" style="width:110px;margin:0 8px 0 0;padding:6px 8px;font-size:12px">' +
      '<button class="topbtn val-save" data-code="' + r.code + '" style="color:#3b5bdb;background:#e8effd">保存</button></div>' +
      '</div>';
  }
};
