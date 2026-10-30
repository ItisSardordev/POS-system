'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { db, money, type Product, type Sale, type Expense, type StockMove } from '@/lib/db';

type CartLine = { product: Product; qty: number };
type Tab = 'sale' | 'products' | 'stock' | 'expenses' | 'reports';
const now = () => new Date().toISOString();
const receiptNo = () => `SP-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.floor(Math.random()*90+10)}`;

export default function POS() {
  const [tab, setTab] = useState<Tab>('sale');
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stockMoves, setStockMoves] = useState<StockMove[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [barcode, setBarcode] = useState('');
  const [notice, setNotice] = useState('');
  const [cash, setCash] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [productForm, setProductForm] = useState({ barcode: '', name: '', unit: 'pcs' as Product['unit'], price: '', cost: '', stock: '' });
  const [stockForm, setStockForm] = useState({ barcode: '', qty: '1', cost: '', note: '' });
  const [expenseForm, setExpenseForm] = useState({ category: 'Прочее', amount: '', note: '' });
  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const cameraControlsRef = useRef<{ stop: () => void } | null>(null);

  const refresh = useCallback(async () => {
    const [p, s, e, m] = await Promise.all([db.products.toArray(), db.sales.orderBy('createdAt').reverse().toArray(), db.expenses.orderBy('createdAt').reverse().toArray(), db.stockMoves.toArray()]);
    setProducts(p); setSales(s); setExpenses(e); setStockMoves(m);
  }, []);
  useEffect(() => { refresh().catch(console.error); }, [refresh]);
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  useEffect(() => { if (tab === 'sale' && !cameraOpen) inputRef.current?.focus(); }, [tab, cameraOpen]);
  useEffect(() => { if (notice) { const t = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(t); } }, [notice]);
  useEffect(() => () => { cameraControlsRef.current?.stop(); cameraControlsRef.current = null; }, []);

  const addByBarcode = useCallback((code: string) => {
    const normalized = code.trim(); if (!normalized) return;
    const p = products.find(x => x.barcode === normalized);
    if (!p) { setNotice(`Штрихкод ${normalized} не найден. Добавь товар в каталоге.`); setProductForm(f => ({ ...f, barcode: normalized })); setBarcode(''); return; }
    setCart(current => {
      const line = current.find(x => x.product.id === p.id);
      if (line) return current.map(x => x.product.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...current, { product: p, qty: 1 }];
    });
    setBarcode(''); setNotice(`Добавлено: ${p.name}`); inputRef.current?.focus();
  }, [products]);

  const total = useMemo(() => cart.reduce((sum, line) => sum + line.product.price * line.qty, 0), [cart]);
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const stockValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
  const totalPurchaseSpend = stockMoves.filter(m => m.kind === 'purchase').reduce((sum, m) => sum + Math.abs(m.qty) * m.unitCost, 0);
  const productPurchaseSpend = (productId?: number) => stockMoves.filter(m => m.productId === productId && m.kind === 'purchase').reduce((sum, m) => sum + Math.abs(m.qty) * m.unitCost, 0);
  const todaySales = sales.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString());
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayExpenses = expenses.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).reduce((sum, e) => sum + e.amount, 0);
  const grossProfit = todaySales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.price - i.cost) * i.qty, 0), 0);

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    const p = { barcode: productForm.barcode.trim(), name: productForm.name.trim(), unit: productForm.unit, price: Number(productForm.price), cost: Number(productForm.cost || 0), stock: Number(productForm.stock || 0), updatedAt: now() };
    if (!p.barcode || !p.name || !Number.isFinite(p.price) || p.price < 0 || p.stock < 0) { setNotice('Проверь штрихкод, название, цену и остаток.'); return; }
    const existing = await db.products.where('barcode').equals(p.barcode).first();
    if (existing?.id) await db.products.update(existing.id, { ...p, id: existing.id }); else await db.products.add(p);
    setProductForm({ barcode: '', name: '', unit: 'pcs', price: '', cost: '', stock: '' }); await refresh(); setNotice(existing ? 'Товар обновлён' : 'Товар добавлен');
  }
  async function removeProduct(p: Product) {
    if (!p.id || !window.confirm(`Удалить «${p.name}» из каталога? История продаж останется.`)) return;
    await db.products.delete(p.id); setCart(c => c.filter(x => x.product.id !== p.id)); await refresh(); setNotice('Товар удалён из каталога');
  }
  async function checkout() {
    if (!cart.length) { setNotice('Корзина пуста'); return; }
    const paid = Number(cash || total);
    if (!Number.isFinite(paid) || paid < total) { setNotice('Полученная сумма меньше итога'); return; }
    try {
      const sale: Sale = { receiptNo: receiptNo(), items: cart.map(({ product, qty }) => ({ productId: product.id!, barcode: product.barcode, name: product.name, qty, price: product.price, cost: product.cost })), total, paid, change: paid - total, createdAt: now(), fiscalStatus: 'not_fiscalized' };
      await db.transaction('rw', db.products, db.sales, db.stockMoves, async () => {
        for (const line of cart) {
          const p = await db.products.get(line.product.id!);
          if (!p || p.stock < line.qty) throw new Error(`Недостаточно остатка: ${line.product.name}. В наличии: ${p?.stock ?? 0}`);
        }
        await db.sales.add(sale);
        for (const line of cart) {
          const p = await db.products.get(line.product.id!); if (!p) continue;
          await db.products.update(p.id!, { stock: p.stock - line.qty, updatedAt: now() });
          await db.stockMoves.add({ productId: p.id!, kind: 'sale', qty: -line.qty, unitCost: p.cost, note: sale.receiptNo, createdAt: now() });
        }
      });
      setCart([]); setCash(''); await refresh(); setNotice(`Продажа сохранена: ${sale.receiptNo}`);
      printReceipt(sale);
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Не удалось провести продажу'); }
  }
  function printReceipt(s: Sale) {
    const rows = s.items.map(i => `<tr><td>${escapeHtml(i.name)} × ${i.qty}</td><td>${money(i.price * i.qty)}</td></tr>`).join('');
    const w = window.open('', '_blank', 'width=420,height=650');
    if (!w) { setNotice('Браузер заблокировал окно чека. Разреши всплывающие окна для печати.'); return; }
    w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Чек ${s.receiptNo}</title><style>body{font:14px monospace;max-width:300px;margin:20px auto;color:#111}h2,p{text-align:center}table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px dashed #aaa}td:last-child{text-align:right}.total{font-size:18px;font-weight:bold}small{color:#555}</style></head><body><h2>МАГАЗИН</h2><p>ВНУТРЕННИЙ ЧЕК<br>${new Date(s.createdAt).toLocaleString('ru-RU')}<br>${s.receiptNo}</p><table>${rows}</table><p class="total">ИТОГО: ${money(s.total)}</p><p>Оплачено: ${money(s.paid)}<br>Сдача: ${money(s.change)}</p><p><small>НЕ ФИСКАЛЬНЫЙ ЧЕК</small></p><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }
  function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c)); }
  async function saveStock(e: React.FormEvent, kind: 'purchase' | 'writeoff') {
    e.preventDefault(); const p = await db.products.where('barcode').equals(stockForm.barcode.trim()).first(); const qty = Number(stockForm.qty); const cost = Number(stockForm.cost || p?.cost || 0);
    if (!p?.id) { setNotice('Товар с таким штрихкодом не найден'); return; }
    if (!Number.isFinite(qty) || qty <= 0) { setNotice('Количество должно быть больше нуля'); return; }
    if (kind === 'writeoff' && p.stock < qty) { setNotice('Нельзя списать больше, чем есть на складе'); return; }
    await db.transaction('rw', db.products, db.stockMoves, async () => {
      await db.products.update(p.id!, { stock: p.stock + (kind === 'purchase' ? qty : -qty), cost: kind === 'purchase' ? cost : p.cost, updatedAt: now() });
      await db.stockMoves.add({ productId: p.id!, kind, qty: kind === 'purchase' ? qty : -qty, unitCost: cost, note: stockForm.note || (kind === 'purchase' ? 'Приход товара' : 'Списание товара'), createdAt: now() });
    });
    setStockForm({ barcode: '', qty: '1', cost: '', note: '' }); await refresh(); setNotice(kind === 'purchase' ? 'Приход сохранён' : 'Списание сохранено');
  }
  async function saveExpense(e: React.FormEvent) {
    e.preventDefault(); const amount = Number(expenseForm.amount); if (!Number.isFinite(amount) || amount <= 0) { setNotice('Сумма расхода должна быть больше нуля'); return; }
    await db.expenses.add({ ...expenseForm, amount, createdAt: now() }); setExpenseForm({ category: 'Прочее', amount: '', note: '' }); await refresh(); setNotice('Расход сохранён');
  }
  async function startCamera() {
    if (cameraOpen) {
      cameraControlsRef.current?.stop();
      cameraControlsRef.current = null;
      setCameraOpen(false);
      return;
    }
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setNotice('Камера недоступна. Открой сайт по HTTPS и разреши доступ к камере. USB-сканер продолжит работать.');
      return;
    }
    if (!window.isSecureContext) {
      setNotice('Браузер блокирует камеру: открой StorePOS через HTTPS. USB-сканер продолжит работать.');
      return;
    }
    setCameraOpen(true);
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      await new Promise(resolve => window.setTimeout(resolve, 250));
      const video = document.getElementById('barcode-video') as HTMLVideoElement | null;
      if (!video) throw new Error('Не найдено видео для камеры');
      const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (result) {
          cameraControlsRef.current?.stop();
          cameraControlsRef.current = null;
          setCameraOpen(false);
          addByBarcode(result.getText());
        }
      });
      cameraControlsRef.current = controls;
    } catch (err) {
      cameraControlsRef.current?.stop();
      cameraControlsRef.current = null;
      setCameraOpen(false);
      const message = err instanceof Error ? err.message : 'проверь разрешение браузера';
      setNotice(`Не удалось открыть камеру: ${message}`);
    }
  }
  const nav: {id: Tab; label: string; icon: string}[] = [{id:'sale',label:'Касса',icon:'▣'},{id:'products',label:'Товары',icon:'▦'},{id:'stock',label:'Склад',icon:'⇄'},{id:'expenses',label:'Расходы',icon:'₽'},{id:'reports',label:'Отчёты',icon:'▤'}];

  return <main className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">S</div><div><b>StorePOS</b><small>КАССА И СКЛАД</small></div></div><nav>{nav.map(n=><button key={n.id} className={tab===n.id?'nav-item active':'nav-item'} onClick={()=>setTab(n.id)}><span>{n.icon}</span>{n.label}</button>)}</nav><div className="side-bottom"><span className="online-dot"/> Локальный режим <small>Данные хранятся на этом устройстве</small></div></aside>
    <section className="main-panel"><header className="topbar"><div><div className="eyebrow">МАГАЗИН / УПРАВЛЕНИЕ</div><h1>{nav.find(n=>n.id===tab)?.label}</h1></div><div className="top-meta"><span className="offline-pill"><span className="online-dot"/> Офлайн готов</span><span>{new Date().toLocaleDateString('ru-RU')}</span></div></header>
    {notice && <div className="notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Закрыть">×</button></div>}
    {tab==='sale' && <div className="sale-layout"><section className="panel catalog-panel"><div className="section-heading"><div><h2>Новая продажа</h2><p>Сканируй товар или найди его в каталоге</p></div><span className="count-badge">{products.length} товаров</span></div><form className="scan-form" onSubmit={e=>{e.preventDefault();addByBarcode(barcode);}}><span className="scan-icon">⌗</span><input ref={inputRef} value={barcode} onChange={e=>setBarcode(e.target.value)} placeholder="Сканировать или ввести штрихкод…" autoComplete="off"/><button className="btn btn-primary" type="submit">Добавить</button></form><div className="scan-actions"><button className="btn btn-light" onClick={startCamera}>{cameraOpen?'Закрыть камеру':'▣ Сканировать камерой'}</button><span>USB-сканер работает как клавиатура</span></div>{cameraOpen&&<div className="camera-box"><video id="barcode-video" autoPlay muted playsInline/><p>Наведи камеру на штрихкод</p></div>}<div className="product-grid">{products.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(p=><button className="product-tile" key={p.id} onClick={()=>addByBarcode(p.barcode)}><span className="product-code">{p.barcode}</span><b>{p.name}</b><strong>{money(p.price)}</strong><small className={p.stock<=3?'low-stock':''}>Остаток: {p.stock} {p.unit==='pcs'?'шт.':p.unit}</small></button>)}</div>{products.length===0&&<div className="empty-state"><div className="empty-icon">▦</div><b>Каталог пока пуст</b><p>Добавь первые товары во вкладке «Товары».</p><button className="btn btn-primary" onClick={()=>setTab('products')}>Добавить товары</button></div>}</section>
      <aside className="panel cart-panel"><div className="section-heading"><div><h2>Текущий чек</h2><p>{cartCount.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ед. · {cart.length} позиций</p></div><button className="text-btn" onClick={()=>setCart([])} disabled={!cart.length}>Очистить</button></div><div className="cart-lines">{cart.map(line=><div className="cart-line" key={line.product.id}><div className="cart-product"><b>{line.product.name}</b><small>{money(line.product.price)} за {line.product.unit==='pcs'?'шт.':line.product.unit}</small></div><div className="qty-controls"><button onClick={()=>setCart(c=>c.map(x=>x.product.id===line.product.id?{...x,qty:Math.round((x.qty-(x.product.unit==='kg'||x.product.unit==='l'?0.1:1))*1000)/1000}:x).filter(x=>x.qty>0))}>−</button><span>{line.qty}</span><button onClick={()=>setCart(c=>c.map(x=>x.product.id===line.product.id?{...x,qty:Math.round((x.qty+(x.product.unit==='kg'||x.product.unit==='l'?0.1:1))*1000)/1000}:x))}>+</button></div><b className="line-total">{money(line.product.price*line.qty)}</b></div>)}{!cart.length&&<div className="cart-empty">Корзина пуста<br/><small>Отсканированные товары появятся здесь</small></div>}</div><div className="checkout"><div className="total-row"><span>К оплате</span><strong>{money(total)}</strong></div><label className="field-label" htmlFor="cash">Получено от покупателя</label><input id="cash" className="field-input" type="number" min={0} value={cash} onChange={e=>setCash(e.target.value)} placeholder={String(total)}/><div className="change-row"><span>Сдача</span><b>{money(Math.max(0, Number(cash||total)-total))}</b></div><button className="btn btn-primary checkout-btn" onClick={checkout} disabled={!cart.length}>Завершить продажу <span>→</span></button><p className="fiscal-warning">Внутренний чек. Фискализация пока не подключена.</p></div></aside></div>}
    {tab==='products'&&<div className="single-column"><section className="panel"><div className="section-heading"><div><h2>Каталог товаров</h2><p>Штрихкод должен быть уникальным</p></div></div><form className="form-grid" onSubmit={saveProduct}><label>Штрихкод<input required value={productForm.barcode} onChange={e=>setProductForm({...productForm,barcode:e.target.value})} placeholder="4601234567890"/></label><label>Название<input required value={productForm.name} onChange={e=>setProductForm({...productForm,name:e.target.value})} placeholder="Название товара"/></label><label>Единица измерения<select value={productForm.unit} onChange={e=>setProductForm({...productForm,unit:e.target.value as Product['unit']})}><option value="pcs">Штука (шт.)</option><option value="kg">Килограмм (кг)</option><option value="g">Грамм (г)</option><option value="l">Литр (л)</option></select></label><label>Цена продажи за единицу, сум<input required type="number" min="0" step="0.01" value={productForm.price} onChange={e=>setProductForm({...productForm,price:e.target.value})} placeholder="15000"/></label><label>Закупочная цена, сум<input type="number" min="0" value={productForm.cost} onChange={e=>setProductForm({...productForm,cost:e.target.value})} placeholder="10000"/></label><label>Начальный остаток ({productForm.unit==='pcs'?'шт.':productForm.unit})<input type="number" min="0" step={productForm.unit==='pcs'?'1':'0.001'} value={productForm.stock} onChange={e=>setProductForm({...productForm,stock:e.target.value})} placeholder="0"/></label><button className="btn btn-primary form-submit">Сохранить товар</button></form></section><section className="panel"><div className="section-heading"><div><h2>Все товары</h2><p>{products.length} записей</p></div></div><div className="table-wrap"><table><thead><tr><th>Штрихкод</th><th>Название</th><th>Закупка</th><th>Продажа</th><th>Остаток</th><th></th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td className="mono">{p.barcode}</td><td><b>{p.name}</b></td><td>{money(p.cost)} / {p.unit==='pcs'?'шт.':p.unit}</td><td>{money(p.price)} / {p.unit==='pcs'?'шт.':p.unit}</td><td><span className={p.stock<=3?'stock-chip low':'stock-chip'}>{p.stock} {p.unit==='pcs'?'шт.':p.unit}</span></td><td><button className="delete-btn" onClick={()=>removeProduct(p)}>Удалить</button></td></tr>)}</tbody></table>{!products.length&&<p className="table-empty">Товары ещё не добавлены.</p>}</div></section></div>}
    {tab==='stock'&&<div className="single-column"><section className="panel"><div className="section-heading"><div><h2>Приход товара</h2><p>Добавляет количество к остатку и обновляет закупочную цену</p></div></div><form className="form-grid" onSubmit={e=>saveStock(e,'purchase')}><label>Штрихкод<input required value={stockForm.barcode} onChange={e=>setStockForm({...stockForm,barcode:e.target.value})}/></label><label>Количество<input required type="number" min="0.001" step="0.001" value={stockForm.qty} onChange={e=>setStockForm({...stockForm,qty:e.target.value})}/></label><label>Закупочная цена за единицу, сум<input type="number" min="0" step="0.01" value={stockForm.cost} onChange={e=>setStockForm({...stockForm,cost:e.target.value})}/></label><label>Примечание<input value={stockForm.note} onChange={e=>setStockForm({...stockForm,note:e.target.value})} placeholder="Номер накладной"/></label><button className="btn btn-primary form-submit">Оформить приход</button></form></section><section className="panel"><div className="section-heading"><div><h2>Списание</h2><p>Порча, потеря или внутреннее использование</p></div></div><form className="form-grid" onSubmit={e=>saveStock(e,'writeoff')}><label>Штрихкод<input required value={stockForm.barcode} onChange={e=>setStockForm({...stockForm,barcode:e.target.value})}/></label><label>Количество<input required type="number" min="0.001" step="0.001" value={stockForm.qty} onChange={e=>setStockForm({...stockForm,qty:e.target.value})}/></label><label className="wide-field">Причина<input value={stockForm.note} onChange={e=>setStockForm({...stockForm,note:e.target.value})} placeholder="Причина списания"/></label><button className="btn btn-danger form-submit">Подтвердить списание</button></form></section><section className="panel"><div className="section-heading"><div><h2>Остатки</h2><p>Текущий складской баланс</p><p><b>Общая стоимость товаров на складе: {money(stockValue)}</b></p><p>Всего потрачено на закупки за время учёта: <b>{money(totalPurchaseSpend)}</b></p></div></div><div className="table-wrap"><table><thead><tr><th>Товар</th><th>Штрихкод</th><th>Остаток</th><th>Стоимость остатка</th><th>Всего потрачено на закупку</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.name}</td><td className="mono">{p.barcode}</td><td>{p.stock} {p.unit==='pcs'?'шт.':p.unit}</td><td>{money(p.stock*p.cost)}</td><td>{money(productPurchaseSpend(p.id))}</td></tr>)}</tbody></table></div></section></div>}
    {tab==='expenses'&&<div className="single-column"><section className="panel"><div className="section-heading"><div><h2>Добавить расход</h2><p>Аренда, зарплата, коммунальные услуги и другие затраты</p></div></div><form className="form-grid" onSubmit={saveExpense}><label>Категория<select value={expenseForm.category} onChange={e=>setExpenseForm({...expenseForm,category:e.target.value})}><option>Прочее</option><option>Аренда</option><option>Зарплата</option><option>Коммунальные услуги</option><option>Доставка</option><option>Ремонт</option><option>Банковская комиссия</option></select></label><label>Сумма, сум<input required type="number" min="1" value={expenseForm.amount} onChange={e=>setExpenseForm({...expenseForm,amount:e.target.value})}/></label><label className="wide-field">Комментарий<input value={expenseForm.note} onChange={e=>setExpenseForm({...expenseForm,note:e.target.value})} placeholder="Описание расхода"/></label><button className="btn btn-primary form-submit">Сохранить расход</button></form></section><section className="panel"><div className="section-heading"><div><h2>История расходов</h2><p>{expenses.length} записей</p></div></div><div className="table-wrap"><table><thead><tr><th>Дата</th><th>Категория</th><th>Комментарий</th><th>Сумма</th></tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td>{new Date(e.createdAt).toLocaleString('ru-RU')}</td><td>{e.category}</td><td>{e.note||'—'}</td><td>{money(e.amount)}</td></tr>)}</tbody></table></div></section></div>}
    {tab==='reports'&&<div className="report-layout"><div className="metric-grid"><div className="metric-card"><span>Выручка сегодня</span><strong>{money(todayRevenue)}</strong><small>{todaySales.length} продаж</small></div><div className="metric-card"><span>Валовая прибыль*</span><strong>{money(grossProfit)}</strong><small>До учёта расходов</small></div><div className="metric-card"><span>Расходы сегодня</span><strong>{money(todayExpenses)}</strong><small>{expenses.filter(e=>new Date(e.createdAt).toDateString()===new Date().toDateString()).length} операций</small></div><div className="metric-card"><span>Стоимость склада</span><strong>{money(stockValue)}</strong><small>Остаток × закупочная цена</small></div></div><section className="panel"><div className="section-heading"><div><h2>История продаж</h2><p>Последние чеки на этом устройстве</p></div></div><div className="table-wrap"><table><thead><tr><th>Дата</th><th>Номер чека</th><th>Позиций</th><th>Сумма</th><th>Статус</th><th></th></tr></thead><tbody>{sales.map(s=><tr key={s.id}><td>{new Date(s.createdAt).toLocaleString('ru-RU')}</td><td className="mono">{s.receiptNo}</td><td>{s.items.reduce((a,i)=>a+i.qty,0)}</td><td><b>{money(s.total)}</b></td><td><span className="status-chip">Не фискализирован</span></td><td><button className="text-btn" onClick={()=>printReceipt(s)}>Печать</button></td></tr>)}</tbody></table>{!sales.length&&<p className="table-empty">Продаж пока нет.</p>}</div><p className="footnote">* Валовая прибыль считается по сохранённой закупочной цене товара на момент продажи. Итоговая прибыль должна также учитывать списания, закупки, налоги и другие корректировки.</p></section><button className="btn btn-light" onClick={async()=>{const data={exportedAt:now(),products:await db.products.toArray(),sales:await db.sales.toArray(),expenses:await db.expenses.toArray()};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`storepos-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);}}>↓ Экспортировать резервную копию JSON</button></div>}
    <footer className="app-footer"><span>StorePOS MVP · v0.1.0</span><span>Локальное хранение · UZS</span></footer></section>
  </main>;
}
