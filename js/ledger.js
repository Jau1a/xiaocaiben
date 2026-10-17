// 记账模块：分类收支、月度统计、支出构成饼图
const Ledger = {
  _month: null,
  _selCat: null,
  _pie: null,
  getCats() {
    return {
      expense: Store.get('cats_exp', [
        { name: '餐饮', icon: '🍜' }, { name: '交通', icon: '🚗' }, { name: '购物', icon: '🛍️' },
        { name: '居住', icon: '🏠' }, { name: '娱乐', icon: '🎮' }, { name: '医疗', icon: '💊' },
        { name: '教育', icon: '📚' }, { name: '人情', icon: '🎁' }, { name: '其他', icon: '📦' }
      ]),
      income: Store.get('cats_in', [
        { name: '工资', icon: '💼' }, { name: '理财', icon: '📈' }, { name: '其他', icon: '💰' }
      ])
    };
  },
  entries() { return Store.get('entries', []); },
  save(l) { Store.set('entries', l); },
  add(e) { const l = this.entries(); l.push(Object.assign({ id: Store.uid(), ts: Date.now() }, e)); this.save(l); },
  del(id) { this.save(this.entries().filter(x => x.id !== id)); },
  monthStr() {
    if (!this._month) this._month = today().slice(0, 7);
    return this._month;
  },
  shiftMonth(d) {
    const p = this.monthStr().split('-').map(Number);
    const dt = new Date(p[0], p[1] - 1 + d, 1);
    this._month = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    this.render();
  },
  monthEntries() {
    const ms = this.monthStr();
    return this.entries().filter(e => e.date.startsWith(ms)).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  },
  render() {
    document.getElementById('mLabel').textContent = this.monthStr();
    const list = this.monthEntries();
    let inc = 0, exp = 0;
    const byCat = {};
    list.forEach(e => {
      if (e.type === 'income') { inc += +e.amount; }
      else { exp += +e.amount; byCat[e.cat] = (byCat[e.cat] || 0) + +e.amount; }
    });
    document.getElementById('ledgerSummary').innerHTML =
      '<div class="sum-item"><span>收入</span><b class="up">' + fmt(inc) + '</b></div>' +
      '<div class="sum-item"><span>支出</span><b class="down">' + fmt(exp) + '</b></div>' +
      '<div class="sum-item"><span>结余</span><b>' + fmt(inc - exp) + '</b></div>';

    const pieData = Object.entries(byCat).map(([k, v]) => ({ name: k, value: +v.toFixed(2) }));
    if (window.echarts) {
      const el = document.getElementById('ledgerPie');
      if (!this._pie) this._pie = window.echarts.init(el);
      this._pie.setOption({
        title: { text: '支出构成', left: 'center', textStyle: { fontSize: 13, color: '#888' } },
        tooltip: { trigger: 'item', formatter: '{b}: {c}元 ({d}%)' },
        series: [{
          type: 'pie', radius: ['36%', '62%'], center: ['50%', '56%'],
          label: { formatter: '{b}\n{d}%', fontSize: 10 },
          data: pieData.length ? pieData : [{ name: '暂无支出', value: 1, itemStyle: { color: '#f0f0f0' }, label: { show: false } }]
        }]
      }, true);
    }

    const ul = document.getElementById('ledgerList');
    if (!list.length) { ul.innerHTML = '<p class="empty">本月还没有记录，点右上角"记一笔"开始</p>'; return; }
    ul.innerHTML = list.map(e => {
      const arr = e.type === 'income' ? this.getCats().income : this.getCats().expense;
      const cat = arr.find(c => c.name === e.cat);
      return '<div class="row">' +
        '<div class="row-main"><span class="cat-icon">' + (cat ? cat.icon : '📄') + '</span>' +
        '<div style="min-width:0"><div class="row-title">' + esc(e.cat) + (e.note ? ' <span class="row-note">' + esc(e.note) + '</span>' : '') + '</div>' +
        '<div class="row-date">' + e.date + '</div></div></div>' +
        '<div class="row-amt ' + (e.type === 'income' ? 'up' : 'down') + '">' + (e.type === 'income' ? '+' : '-') + fmt(e.amount) + '</div>' +
        '<button class="row-del" data-id="' + e.id + '">✕</button></div>';
    }).join('');
    ul.querySelectorAll('.row-del').forEach(b => b.onclick = () => {
      if (confirm('删除这条记录？')) { this.del(b.dataset.id); this.render(); }
    });
  },
  openForm() {
    let type = 'expense';
    const cats = this.getCats();
    const draw = () => {
      const cc = type === 'income' ? cats.income : cats.expense;
      const sel = this._selCat || cc[0].name;
      document.getElementById('modalBox').innerHTML =
        '<h3>记一笔</h3>' +
        '<div class="seg">' +
        '<button class="' + (type === 'expense' ? 'on' : '') + '" data-t="expense">支出</button>' +
        '<button class="' + (type === 'income' ? 'on' : '') + '" data-t="income">收入</button></div>' +
        '<div class="chips">' + cc.map(c => '<button class="chip ' + (sel === c.name ? 'on' : '') + '" data-c="' + c.name + '">' + c.icon + ' ' + c.name + '</button>').join('') + '</div>' +
        '<input id="fAmount" type="number" step="0.01" min="0.01" placeholder="金额（元）" class="inp">' +
        '<input id="fNote" type="text" placeholder="备注（可不填）" class="inp">' +
        '<input id="fDate" type="date" class="inp" value="' + today() + '">' +
        '<div class="btn-row"><button id="fCancel" class="btn ghost">取消</button><button id="fSave" class="btn">保存</button></div>';
      document.querySelectorAll('#modalBox .seg button').forEach(b => b.onclick = () => { type = b.dataset.t; draw(); });
      document.querySelectorAll('#modalBox .chip').forEach(b => b.onclick = () => { this._selCat = b.dataset.c; draw(); });
      document.getElementById('fCancel').onclick = closeModal;
      document.getElementById('fSave').onclick = () => {
        const amount = parseFloat(document.getElementById('fAmount').value);
        if (!amount || amount <= 0) { toast('请填写金额'); return; }
        this.add({ type: type, cat: this._selCat || cc[0].name, amount: amount, note: document.getElementById('fNote').value.trim(), date: document.getElementById('fDate').value || today() });
        this._selCat = null;
        closeModal(); this.render();
      };
    };
    draw();
    openModal();
  }
};
