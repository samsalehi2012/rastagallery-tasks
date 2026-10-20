/*! رستا — پروتوتایپ وب. طراحی و توسعه: سکان (teamsokan.ir) */
/* Rasta web runtime — renders the prototype templates in a plain browser.
   Templates use {{holes}}, <sc-if value>, <sc-for list as>; handlers come from renderVals(). */
(function () {
  'use strict';

  /* ---------- tiny component base (same contract as the design tool) ---------- */
  class DCLogic {
    constructor(props) { this.props = props || {}; this.tos = this.tos || {}; this.ivs = this.ivs || {}; }
    setState(p) {
      const patch = typeof p === 'function' ? p(this.state) : p;
      if (patch) Object.assign(this.state, patch);
      if (this.__host) this.__host.schedule();
    }
  }
  window.DCLogic = DCLogic;

  /* ---------- template compile ---------- */
  const EVT = {onClick: 'click', onChange: 'change', onKeyDown: 'keydown', onBlur: 'blur', onDragStart: 'dragstart', onDragEnd: 'dragend',
    onDragOver: 'dragover', onDragLeave: 'dragleave', onDrop: 'drop', onPointerDown: 'pointerdown', onPointerMove: 'pointermove',
    onPointerUp: 'pointerup', onPointerLeave: 'pointerleave'};

  function prep(src) {
    return src
      .replace(/<textarea([^>]*?)\svalue="(\{\{[^}]+\}\})"([^>]*)><\/textarea>/g, '<textarea$1$3>$2</textarea>')
      .replace(/<select([^>]*?)\svalue="(\{\{[^}]+\}\})"/g, '<select$1 data-value="$2"')
      .replace(/\sautoFocus="\{\{\s*true\s*\}\}"/g, ' data-autofocus=""')
      .replace(/\shint-placeholder-(val|count)="[^"]*"/g, '');
  }
  const RX = /<sc-(if|for)\b([^>]*)>|<\/sc-(if|for)>/g;
  function parse(str) {
    const root = {kids: []}, st = [root]; let last = 0, m; RX.lastIndex = 0;
    while ((m = RX.exec(str))) {
      if (m.index > last) st[st.length - 1].kids.push({t: 'txt', v: str.slice(last, m.index)});
      last = RX.lastIndex;
      if (m[1]) {
        const n = {t: m[1], kids: []};
        if (m[1] === 'if') n.path = m[2].match(/value="\{\{\s*([^}]+?)\s*\}\}"/)[1];
        else { n.path = m[2].match(/list="\{\{\s*([^}]+?)\s*\}\}"/)[1]; n.as = m[2].match(/as="(\w+)"/)[1]; }
        st[st.length - 1].kids.push(n); st.push(n);
      } else st.pop();
    }
    if (last < str.length) st[st.length - 1].kids.push({t: 'txt', v: str.slice(last)});
    return root;
  }
  function get(ctx, path) {
    if (path === 'true') return true; if (path === 'false') return false;
    let o = ctx; const ks = path.split('.');
    for (let i = 0; i < ks.length; i++) { if (o == null) return undefined; o = o[ks[i]]; }
    return o;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  const RX_EV = /\s(on[A-Z]\w*)="\{\{\s*([^}]+?)\s*\}\}"/g;
  const RX_BOOL = /\s(disabled|checked)="\{\{\s*([^}]+?)\s*\}\}"/g;
  const RX_HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  function fill(txt, ctx, reg) {
    if (txt.indexOf('{{') < 0) return txt;
    txt = txt.replace(RX_EV, (a, n, p) => { const f = get(ctx, p); const ev = EVT[n]; if (typeof f !== 'function' || !ev) return ''; reg.push(f); return ' data-e-' + ev + '="' + (reg.length - 1) + '"'; });
    txt = txt.replace(RX_BOOL, (a, n, p) => get(ctx, p) ? ' ' + n : '');
    return txt.replace(RX_HOLE, (a, p) => { const v = get(ctx, p); if (v == null || typeof v === 'function' || typeof v === 'object') return ''; return esc(v); });
  }
  function render(node, ctx, reg) {
    let s = '';
    for (const k of node.kids) {
      if (k.t === 'txt') s += fill(k.v, ctx, reg);
      else if (k.t === 'if') { if (get(ctx, k.path)) s += render(k, ctx, reg); }
      else {
        const arr = get(ctx, k.path);
        if (Array.isArray(arr)) for (let i = 0; i < arr.length; i++) { const cx = Object.create(ctx); cx[k.as] = arr[i]; s += render(k, cx, reg); }
      }
    }
    return s;
  }

  /* ---------- host: mounts a component into an element ---------- */
  class Host {
    constructor(el, Comp, props, opts) {
      this.el = el; this.opts = opts || {};
      this.tree = parse(prep(opts.template));
      this.reg = [];
      this.focusSeen = new WeakSet();
      this.comp = new Comp(props || {});
      this.comp.__host = this;
      if (opts.onInit) opts.onInit(this.comp);
      this.bind();
      this.flush();
    }
    schedule() { if (this.pending || this.dead) return; this.pending = true; queueMicrotask(() => { this.pending = false; if (!this.dead) this.flush(); }); }
    flush() {
      let vals;
      try { vals = this.comp.renderVals(); } catch (e) { console.error('[rasta] renderVals failed', e); return; }
      const reg = [];
      const html = render(this.tree, vals, reg);
      this.reg = reg;
      if (!this.mounted) { this.el.innerHTML = html; this.mounted = true; }
      else {
        window.morphdom(this.el, '<div>' + html + '</div>', {
          childrenOnly: true,
          onBeforeElUpdated: (from, to) => {
            if (from.isEqualNode && from.isEqualNode(to)) return false;
            return true;
          }
        });
      }
      this.after();
      if (this.opts.onRender) this.opts.onRender(this.comp);
    }
    after() {
      const sels = this.el.querySelectorAll('select[data-value]');
      for (const s of sels) { const v = s.getAttribute('data-value'); if (s.value !== v) s.value = v; }
      const af = this.el.querySelectorAll('[data-autofocus]');
      for (const a of af) {
        if (this.focusSeen.has(a)) continue;
        this.focusSeen.add(a);
        try { a.focus({preventScroll: false}); if (a.setSelectionRange && typeof a.value === 'string') { const n = a.value.length; a.setSelectionRange(n, n); } } catch (e) {}
      }
    }
    bind() {
      const bubble = ['click', 'input', 'change', 'keydown', 'dragstart', 'dragend', 'dragover', 'dragleave', 'drop', 'pointerdown', 'pointermove', 'pointerup'];
      this.handlers = [];
      const add = (type, fn, cap) => { this.el.addEventListener(type, fn, cap); this.handlers.push([type, fn, cap]); };
      for (const t of bubble) add(t, e => this.dispatch(e, t), false);
      add('focusout', e => this.dispatch(e, 'blur', true), true);
      add('pointerleave', e => this.dispatch(e, 'pointerleave', true), true);
    }
    dispatch(e, type, exact) {
      if (type === 'change') {
        const t = e.target;
        if (!t || !(t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'radio' || t.type === 'file')) return;
      }
      const attr = type === 'input' || type === 'change' ? 'data-e-change' : 'data-e-' + type;
      const reg = this.reg;
      let el = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
      let stopped = false;
      while (el && el !== this.el.parentNode) {
        const id = el.getAttribute ? el.getAttribute(attr) : null;
        if (id != null && reg[id]) {
          const cur = el;
          const proxy = new Proxy(e, {get(t, k) {
            if (k === 'currentTarget') return cur;
            if (k === 'stopPropagation') return () => { stopped = true; t.stopPropagation(); };
            const v = Reflect.get(t, k); return typeof v === 'function' ? v.bind(t) : v;
          }});
          try { reg[id](proxy); } catch (err) { console.error('[rasta] handler failed', err); }
          e.__rastaHandled = true;
          if (stopped) break;
        }
        if (exact) break;
        el = el.parentElement;
      }
    }
    destroy() {
      this.dead = true;
      for (const [t, fn, cap] of this.handlers) this.el.removeEventListener(t, fn, cap);
      try { this.comp.componentWillUnmount && this.comp.componentWillUnmount(); } catch (e) {}
      this.el.innerHTML = '';
    }
  }
  window.RastaHost = Host;
})();

class RastaDesktop extends DCLogic {
C = {
  MONTHS: ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'],
  WD: ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'],
  WDS: ['ش','ی','د','س','چ','پ','ج'],
  TYPES: {ring:['انگشتر','a-ring'], necklace:['گردنبند','a-necklace'], bracelet:['دستبند','a-bracelet'], earring:['گوشواره','a-hoops'], bangle:['النگو','a-bangle'], set:['سرویس','a-set'], pendant:['آویز','a-pendant'], other:['سایر','a-coin']},
  CH: {phone:['تلفن','i-phone'], inperson:['حضوری','i-store'], wa:['واتساپ','i-wa'], tg:['تلگرام','i-tg'], bale:['بله','i-bale'], rub:['روبیکا','i-rub'], site:['سایت','i-globe']},
  SEND: {wa:['واتساپ','i-wa'], tg:['تلگرام','i-tg'], bale:['بله','i-bale'], sms:['پیامک','i-sms'], inperson:['حضوری','i-store']},
  RS: {defect:'نقص در کار', taste:'تغییر سلیقه‌ی مشتری', mgr:'تغییر نظر مدیر', info:'اطلاعات ناقص از مرحله‌ی قبل'},
  RSL: {defect:'L-r', taste:'L-b', mgr:'L-p', info:'L-y'},
  RSH: {defect:'#CF7B74', taste:'#86A3CF', mgr:'#AE98CF', info:'#E2C276'},
  RSP: {defect:'P-rs', taste:'P-b', mgr:'P-ps', info:'P-ys'},
  GR: [['great','عالی','تمیز و کامل؛ چیزی برای گفتن نیست'],['good','خوب','چند جزئیات کوچک، ولی قابل قبول'],['ok','قابل قبول','کار راه می‌افتد ولی جای بهتر شدن دارد']],
  DR: {ok:['طبق برنامه','dot-g','P-gs'], behind:['کمی عقبم','dot-y','P-ys'], stuck:['گیر کرده‌ام','dot-r','P-rs'], note:['یادداشت','dot-b','P-b'], auto:['خودکار','dot-g','P-gs'], none:['ثبت نشده','dot-n','P-n']},
  BGS: [['#2B2320','اسپرسو'],['#8A6735','برنز طلایی'],['#3E5F4C','زمرد'],['#3D5370','یاقوت کبود'],['#7A3B3F','گارنت'],['#5A4A6E','آمتیست'],['#2F5F63','فیروزه'],['#8B6458','رزگلد'],['#5C554F','دودی']],
  TEAMC: [['#8A6735','طلایی'],['#5A4A6E','آمتیست'],['#3E5F4C','زمرد'],['#7A3B3F','گارنت'],['#A0703F','کهربا'],['#9A6A72','رزگلد'],['#2F5F63','فیروزه'],['#5C554F','دودی']],
  AVC: ['#9A5B72','#4F7D63','#B07A45','#4C6E8F','#6D5A8C','#3F7479','#8A5A3C','#A0524C','#5E4A7A','#3F6A55'],
  WL: [['L-y','art-sketch'],['L-o','art-line'],['L-p','art-render'],['L-s','art-photo'],['L-k','art-line'],['L-l','art-render'],['L-b','art-photo']],
  TLL: {in:'L-n', doing:'L-b', done:'L-g'},
  FILES: [['img','عکس نمونه'],['pdf','اندازه‌ها'],['img','طرح مرجع'],['file','توضیحات مشتری']],
  HOURS: [10, 12, 14, 17, 20],
  MET: ['تحویل به‌موقع','تأیید در اولین بررسی','نمره‌ی کیفی مدیر','حجم کار با وزن سختی'],
  PLAIN: ['چند درصد کارها پیش از تاریخ تحویل رسیده‌اند.','چند درصد کارها بی‌ارجاعِ «نقص در کار» تأیید شده‌اند.','میانگین نمره‌هایی که مدیر هنگام تأیید داده.','تعداد کارها با در نظر گرفتن سختی هر کدام.'],
  MGR: {id:'mehdi', name:'خانم پورعبدالله', init:'پ‌ع', bg:'#8A6735', greet:'خانم پورعبدالله عزیز'},
  CANCEL: ['مشتری منصرف شد','بیعانه پرداخت نشد','سفارش تکراری','سایر'],
  URG: ['مشتری عجله دارد','مراسم نزدیک است','سفارش ویژه']
};
state = this.seed();
tos = {};
ivs = {};

/* ================= seed ================= */
tlDefault(extra) {
  const ls = [{id:'in', name:'صف', role:'in'}, {id:'doing', name:'در حال انجام', role:'doing'}];
  return ls.concat(extra || []).concat([{id:'done', name:'انجام شد', role:'done'}]);
}
seed() {
  const L = (id, name, kind, x) => Object.assign({id, name, kind}, x || {});
  const dev = this.props && this.props.device;
  return {
    device: dev || 'desktop',
    today: 0, now: 680,
    logged: true, login: {step:'phone', phone:'', code:'', err:'', timer:0},
    role: 'mgr', me: 'maryam',
    page: 'board', boardId: 'orders', teamId: 'sk', pid: null, pageState: 'ok', view: 'k',
    empty: false, offline: false, dark: false, demo: false, side: dev === 'tablet' ? 'min' : 'auto',
    hdr: {boards:false, create:false, notif:false, user:false}, nf: 'all', search: '',
    filter: {who:null, flag:null}, filterOpen: false, onlyMine: false,
    qm: null, quick: null, quickText: '', quickRefs: [], over: null, drag: null, flash: null,
    lEdit: null, lMenu: null, addL: null, repOpen: false, repNote: null,
    cb: null, cbPop: null, cbx: this.cbxInit(),
    dlg: null, m: {}, cal: null, toast: null, play: {id:null, pos:0},
    repF: 'all', tdOk: false,
    arTab: 'done', arQ: '', arRange: 'all', arCustom: null,
    rpRange: 'q', rpCustom: null, rpBusy: false,
    stTab: 'teams', smsSel: 'new', scSec: 'sk',
    trial: false, gName: 'گالری طلای رستا',
    levels: [70, 80, 90], minTasks: 5,
    weights: {sk:[30,30,25,15], d2:[30,30,25,15], d3:[25,30,30,15], photo:[35,25,25,15], edit:[30,30,25,15]},
    set: {dailyAuto:true, dailyRemind:true, dailyReq:false, dailyStuck:true, remTime:'18'},
    teams: [
      {id:'design', name:'واحد طراحی', bg:'#8A6735'},
      {id:'content', name:'واحد تولید محتوا', bg:'#5A4A6E'}
    ],
    sections: [
      {id:'sk', team:'design', name:'اسکچ', bg:'#9A7440', lists: this.tlDefault()},
      {id:'d2', team:'design', name:'دوبعدی', bg:'#4F7259', lists: this.tlDefault()},
      {id:'d3', team:'design', name:'سه‌بعدی', bg:'#3F617A', lists: this.tlDefault([{id:'render', name:'رندر', role:null}])},
      {id:'photo', team:'content', name:'عکاسی', bg:'#7E4A44', lists: this.tlDefault()},
      {id:'edit', team:'content', name:'تدوین و طراحی پست', bg:'#7A5A78', lists: this.tlDefault()}
    ],
    boards: [
      {id:'orders', name:'سفارش‌های ساخت', team:'design', bg:'#2F5F63', prefix:'ر', lists:[
        L('queue','صف','queue',{lbl:'L-n', style:'art-photo'}),
        L('sketch','اسکچ','work',{sec:'sk', lbl:'L-y', style:'art-sketch', days:[1,2,3]}),
        L('2d','دوبعدی','work',{sec:'d2', optional:true, lbl:'L-o', style:'art-line', days:[1,2,3]}),
        L('3d','سه‌بعدی','work',{sec:'d3', lbl:'L-p', style:'art-render', days:[2,3,5]}),
        L('cust','در انتظار مشتری','cust',{lbl:'L-b', style:'art-render'})
      ]},
      {id:'content', name:'تولید محتوا', team:'content', bg:'#4A3D52', prefix:'م', lists:[
        L('idea','ایده‌ها','queue',{lbl:'L-n', style:'art-photo'}),
        L('shoot','عکاسی','work',{sec:'photo', lbl:'L-s', style:'art-photo', days:[1,2,3]}),
        L('edit','تدوین و طراحی پست','work',{sec:'edit', lbl:'L-k', style:'art-line', days:[1,2,3]}),
        L('pub','آماده‌ی انتشار','final',{lbl:'L-g', style:'art-photo'})
      ]}
    ],
    staff: [
      {id:'maryam', name:'مریم احمدی', init:'م‌ا', bg:'#9A5B72', phone:'09171234567', secs:['sk'], active:true, tasks:14, metrics:[84,64,80,78]},
      {id:'elham', name:'الهام نوری', init:'ا‌ن', bg:'#4F7D63', phone:'09172345678', secs:['sk','d2'], active:true, tasks:3, metrics:[88,70,80,40]},
      {id:'sara', name:'سارا کریمی', init:'س‌ک', bg:'#B07A45', phone:'09173456781', secs:['d2'], active:true, tasks:11, metrics:[90,82,92,88]},
      {id:'amir', name:'امیر رضایی', init:'ا‌ر', bg:'#4C6E8F', phone:'09174567812', secs:['d3'], active:true, tasks:16, metrics:[96,90,94,92]},
      {id:'hossein', name:'حسین مرادی', init:'ح‌م', bg:'#6D5A8C', phone:'09175678123', secs:['d3'], active:true, tasks:12, metrics:[78,82,84,80]},
      {id:'niloofar', name:'نیلوفر صادقی', init:'ن‌ص', bg:'#3F7479', phone:'09176781234', secs:['photo'], active:true, tasks:8, metrics:[80,86,82,70]},
      {id:'reza', name:'رضا جعفری', init:'ر‌ج', bg:'#8A5A3C', phone:'09177812345', secs:['edit','photo'], active:true, tasks:9, metrics:[74,80,78,76]}
    ],
    cards: this.seedCards(),
    returns: [
      {id:'r1', who:'maryam', cid:139, title:'گوشواره میخی گل', reason:'defect', t:-4, m:600, mgr:'نگین‌ها هم‌اندازه نبودند.', obj:null},
      {id:'r2', who:'maryam', cid:126, title:'انگشتر سنگ عقیق', reason:'taste', t:-12, m:760, mgr:'مشتری رکاب پهن‌تر خواست.', obj:null},
      {id:'r3', who:'sara', cid:143, title:'آویز ماه و ستاره', reason:'defect', t:-1, m:700, mgr:'خطوط ستاره قرینه نیست.', obj:{text:'قرینه نبودن را خود مشتری خواسته بود؛ در توضیحات سفارش آمده.', status:'pending', t:-1, m:820, note:''}},
      {id:'r4', who:'elham', cid:149, title:'النگوی طرح‌دار گل و بوته', reason:'info', t:-1, m:700, mgr:'عرض النگو در سفارش ۱۲ میلی‌متر بود.', obj:null},
      {id:'r5', who:'hossein', cid:118, title:'گردنبند اسم لاتین', reason:'defect', t:-9, m:760, mgr:'حروف در رندر به هم چسبیده‌اند.', obj:{text:'فاصله‌ی حروف مطابق طرح دوبعدی تأییدشده بود.', status:'acc', t:-8, m:600, note:'حق با شماست؛ از امتیاز کم نمی‌شود.'}},
      {id:'r6', who:'reza', cid:497, title:'پست جشنواره‌ی پاییز', reason:'defect', t:-6, m:640, mgr:'لوگو روی عکس کم‌رنگ است.', obj:null}
    ],
    notifs: [
      {id:'n1', to:'mgr', text:'مریم احمدی نسخه‌ی ۱ «انگشتر سولیتر با نگین زمرد» را فرستاد.', t:0, m:580, unread:true, act:true, cid:145},
      {id:'n2', to:'mgr', text:'نیلوفر صادقی: گیر کرده‌ام — «استودیو امروز آزاد نیست»', t:0, m:610, unread:true, act:true, cid:501},
      {id:'n3', to:'mgr', text:'رضا جعفری نسخه‌ی ۱ «پست اینستاگرام: گردنبند پروانه» را فرستاد.', t:0, m:600, unread:true, act:true, cid:502},
      {id:'n4', to:'mgr', text:'تاریخ تحویل «نیم‌ست برگ زیتون» دیروز گذشت.', t:0, m:5, unread:false, act:true, cid:141},
      {id:'n5', to:'mgr', text:'سارا کریمی به یک ارجاع اعتراض کرد.', t:-1, m:820, unread:false, act:true, page:'members'},
      {id:'d0', to:'maryam', text:'کار تازه برای کل تیم اسکچ: «گوشواره میخی ستاره». هر کس برمی‌دارد، روی کارت بزند.', t:0, m:560, unread:true, act:true, cid:154},
      {id:'d1', to:'maryam', text:'کار تازه: «گردنبند اسم با خط نستعلیق» تا امروز ساعت ۱۷.', t:-1, m:610, unread:true, act:true, cid:147},
      {id:'d2', to:'maryam', text:'یادآوری: امروز روز تحویل «گردنبند اسم با خط نستعلیق» است.', t:0, m:540, unread:false, act:false, cid:147},
      {id:'d3', to:'elham', text:'«النگوی طرح‌دار گل و بوته» برای اصلاح برگشت؛ بازخورد را ببینید.', t:-1, m:700, unread:true, act:true, cid:149},
      {id:'d4', to:'sara', text:'«نیم‌ست برگ زیتون» از تاریخ تحویل گذشته است.', t:0, m:5, unread:true, act:true, cid:141},
      {id:'d5', to:'amir', text:'کار تازه: «دستبند کارتیه با پلاک اسم» با حسین مرادی · سه‌بعدی.', t:-3, m:600, unread:false, act:false, cid:138},
      {id:'d6', to:'niloofar', text:'کار تازه: «عکاسی محصول: انگشتر نشان خانوادگی».', t:-1, m:900, unread:false, act:false, cid:501}
    ],
    sms: [
      {id:'new', rec:'پرسنل', ev:'کار تازه سپرده شد', on:true, text:'{نام} عزیز، کار تازه‌ی {کد} تا {تاریخ} به شما سپرده شد.'},
      {id:'ret', rec:'پرسنل', ev:'برگشت برای اصلاح', on:true, text:'{نام} عزیز، {کد} برای اصلاح برگشت. بازخورد را در برنامه ببینید.'},
      {id:'due', rec:'پرسنل', ev:'یادآوری روز تحویل', on:true, text:'یادآوری: امروز روز تحویل {کد} است.'},
      {id:'daily', rec:'پرسنل', ev:'یادآوری گزارش روزانه', on:true, text:'{نام} عزیز، وضعیت کارهای امروز را با یک ضربه ثبت کنید.'},
      {id:'order', rec:'مشتری', ev:'ثبت سفارش', on:true, text:'{نام} گرامی، سفارش شما با کد {کد} در {گالری} ثبت شد. سپاس از اعتماد شما.'},
      {id:'ready', rec:'مشتری', ev:'آماده شدن طرح', on:false, text:'{نام} گرامی، طرح سفارش {کد} آماده است و برایتان فرستاده شد.'}
    ],
    nextId: 155
  };
}
cbxInit() { return {ups:[], upNote:'', upErr:false, upFocus:false, cmt:'', cst:null, cfiles:[], chkAdding:false, chkText:'', details:false, cnQ:null, cnErr:false, ugQ:null, xBoard:null, xTitle:'', tEdit:false, tText:''}; }
seedCards() {
  const V = (list, n, by, t, m, status, style, extra) => Object.assign({list, n, by, t, m, status, style}, extra || {});
  const A = (by, t, m, k, text, extra) => Object.assign({by, t, m, k, text}, extra || {});
  const K = arr => arr.map(x => ({t: x[0], on: !!x[1]}));
  const F = (id, kind, name, by, t, extra) => Object.assign({id, kind, name, by, t, m: 600}, extra || {});
  const cards = [
    {id:153, board:'orders', list:'queue', title:'حلقه‌ی ازدواج ست', type:'ring', art:'a-band', cust:null, acts:[A('mehdi',0,600,'sys','این کارت را به «صف» اضافه کرد')]},
    {id:152, board:'orders', list:'queue', title:'گوشواره حلقه‌ای ساده', type:'earring', art:'a-hoops', att:[F('f1','img','عکس نمونه‌ی مشتری','cust',0,{art:'a-hoops', ref:true})], cust:{name:'خانم سمیرا رحیمی', phone:'09121234567', ch:'wa'}, karat:18, weight:'۳', desc:'حلقه‌ی ساده با قطر ۲۰ میلی‌متر، قفل فنری.', acts:[A('mehdi',0,520,'sys','این کارت را به «صف» اضافه کرد')]},
    {id:150, board:'orders', list:'queue', title:'سرویس عروس طرح کلاسیک', type:'set', art:'a-set', att:[F('f2','img','عکس نمونه‌ی مشتری','cust',-1,{art:'a-set', ref:true}),F('f3','img','الهام از کاتالوگ','mehdi',-1,{art:'a-necklace', ref:true})], cust:{name:'خانم الناز مرادی', phone:'09129876543', ch:'inperson'}, karat:18, weight:'۲۸', desc:'گردنبند، گوشواره و دستبند هماهنگ. نگین سفید ریز. تاریخ عقد: ۲۰ آبان.', acts:[A('mehdi',-1,700,'sys','این کارت را به «صف» اضافه کرد')]},
    {id:154, board:'orders', list:'sketch', st:'doing', pool:true, whos:[], tl:'in', due:2, dueH:14, title:'گوشواره میخی ستاره', type:'earring', art:'a-drops', att:[F('f4','img','عکس نمونه‌ی مشتری','cust',0,{art:'a-drops', ref:true})], cust:{name:'خانم ژیلا امیری', phone:'09141239876', ch:'wa'}, karat:18, weight:'۲', desc:'ستاره‌ی پنج‌پر کوچک با نگین وسط. جفت.',
      acts:[A('mehdi',0,555,'sys','این کارت را به «صف» اضافه کرد'),A('mehdi',0,560,'move','کارت را به کل تیم اسکچ سپرد · خودشان تقسیم کنند')]},
    {id:145, board:'orders', list:'sketch', st:'wait', whos:['maryam'], tl:'done', due:1, dueH:16, title:'انگشتر سولیتر با نگین زمرد', type:'ring', art:'a-ring', att:[F('f5','img','عکس نمونه‌ی مشتری','cust',-2,{art:'a-ring', ref:true})], cust:{name:'آقای کامران فرهادی', phone:'09351112233', ch:'phone'}, karat:18, weight:'۴', desc:'نگین زمرد ۶ میلی‌متری از خود مشتری. رکاب ظریف و ساده، بدون نگین ریز کنار. سایز انگشت ۵۴.',
      chk:K([['طرح کلی رکاب',1],['سه نما (رو، بغل، بالا)',1],['اندازه‌گذاری نگین',1],['نسخه‌ی تمیز برای بررسی',1]]),
      vers:[V('sketch',1,'maryam',0,580,'wait','art-sketch',{note:'رکاب را کمی باریک‌تر گرفتم.'})],
      acts:[A('mehdi',-2,600,'sys','این کارت را به «صف» اضافه کرد'),A('mehdi',-2,640,'move','کارت را به مریم احمدی سپرد · اسکچ'),A('maryam',-1,700,'minor','مورد «طرح کلی رکاب» را انجام داد',{chk:1}),A('maryam',0,560,'minor','۳ مورد چک‌لیست را انجام داد',{chk:3}),A('maryam',0,580,'ver','نسخه‌ی ۱ را برای بررسی فرستاد',{body:'رکاب را کمی باریک‌تر گرفتم.'})]},
    {id:147, board:'orders', list:'sketch', st:'doing', whos:['maryam'], tl:'doing', due:0, dueH:17, title:'گردنبند اسم با خط نستعلیق', type:'necklace', art:'a-necklace', cust:{name:'خانم نیلوفر شریفی', phone:'09361234455', ch:'tg'}, karat:18, weight:'۵', desc:'اسم «نیلوفر» با خط نستعلیق، ضخامت ۰٫۸ میلی‌متر. زنجیر ونیزی ۴۵ سانت.',
      chk:K([['دو پیشنهاد خط',1],['اتصال حلقه‌ها',0],['نسخه‌ی تمیز برای بررسی',0]]),
      acts:[A('mehdi',-1,600,'sys','این کارت را به «صف» اضافه کرد'),A('mehdi',-1,610,'move','کارت را به مریم احمدی سپرد · اسکچ'),A('mehdi',-1,611,'cmt','',{body:'حرف «ف» آخر کشیده باشد؛ مشتری روی این تأکید داشت.', files:[F('f6','img','نمونه‌ی خط','mehdi',-1,{art:'a-necklace'})]}),A('maryam',-1,900,'minor','مورد «دو پیشنهاد خط» را انجام داد',{chk:1})]},
    {id:149, board:'orders', list:'sketch', st:'returned', whos:['elham'], tl:'doing', due:2, dueH:14, title:'النگوی طرح‌دار گل و بوته', type:'bangle', art:'a-bangle', att:[F('f7','pdf','اندازه‌های النگو','mehdi',-3)], cust:{name:'خانم مهسا تهرانی', phone:'09127654321', ch:'inperson'}, karat:18, weight:'۱۲', desc:'عرض ۱۲ میلی‌متر، نقش گل و بوته‌ی ریز دور تا دور. سایز دست متوسط.',
      chk:K([['اصلاح عرض به ۱۲ میلی‌متر',0],['درشت‌تر کردن گل‌ها',0]]),
      vers:[V('sketch',1,'elham',-1,620,'ret','art-sketch')],
      fb:[{list:'sketch', n:1, by:'mehdi', t:-1, m:700, reason:'info', voice:14, text:'عرض النگو در سفارش ۱۲ میلی‌متر نوشته شده بود، نه ۸. با همین عرض دوباره بکشید و گل‌ها را درشت‌تر کنید.', anno:[{tool:'circle', pts:[[50,62],[64,62]]},{tool:'arrow', pts:[[18,22],[36,44]]}]}],
      acts:[A('mehdi',-3,600,'sys','این کارت را به «صف» اضافه کرد'),A('mehdi',-3,620,'move','کارت را به الهام نوری سپرد · اسکچ'),A('elham',-1,620,'ver','نسخه‌ی ۱ را برای بررسی فرستاد'),A('mehdi',-1,700,'ret','نسخه‌ی ۱ را برای اصلاح برگرداند · اطلاعات ناقص از مرحله‌ی قبل')]},
    {id:141, board:'orders', list:'2d', st:'doing', whos:['sara'], tl:'doing', due:-1, dueH:14, title:'نیم‌ست برگ زیتون', type:'set', art:'a-set', cust:{name:'خانم پریسا نوروزی', phone:'09137778899', ch:'wa'}, karat:18, weight:'۱۴', desc:'گردنبند و گوشواره با نقش برگ زیتون؛ برگ‌ها مات و ساقه براق.',
      chk:K([['طرح خطی گردنبند',1],['طرح خطی گوشواره',1],['اندازه‌گذاری',0]]),
      vers:[V('sketch',1,'elham',-6,700,'ok','art-sketch',{grade:'good'})],
      acts:[A('elham',-6,700,'ver','نسخه‌ی ۱ اسکچ را فرستاد'),A('mehdi',-5,600,'ok','اسکچ را تأیید کرد · خوب'),A('mehdi',-5,610,'move','کارت را به سارا کریمی سپرد · دوبعدی'),A('sara',-2,640,'minor','۲ مورد چک‌لیست را انجام داد',{chk:2}),A('sara',0,630,'cmt','',{daily:true, st:'behind', body:'منتظر جواب مشتری درباره‌ی اندازه‌ی برگ‌ها هستم.', files:[]})]},
    {id:143, board:'orders', list:'2d', st:'wait', whos:['sara'], tl:'done', due:1, dueH:14, urgent:true, urgentWhy:'مراسم نزدیک است', title:'آویز ماه و ستاره', type:'pendant', art:'a-pendant', cust:{name:'آقای سعید کریمی', phone:'09121112222', ch:'bale'}, karat:18, weight:'۳', desc:'ماه و ستاره‌ی نامتقارن، طبق عکس نمونه‌ی مشتری. هدیه‌ی تولد؛ ۵ آبان لازم است.',
      chk:K([['اصلاح خطوط ستاره',1],['اندازه‌گذاری',1]]),
      vers:[V('sketch',1,'maryam',-5,620,'ok','art-sketch',{grade:'great'}),V('2d',1,'sara',-2,600,'ret','art-line'),V('2d',2,'sara',0,610,'wait','art-line',{note:'خطوط ستاره را صاف کردم؛ عدم تقارن را طبق عکس نگه داشتم.'})],
      fb:[{list:'2d', n:1, by:'mehdi', t:-1, m:700, reason:'defect', voice:0, text:'خطوط ستاره قرینه نیست؛ لبه‌ها را صاف‌تر کنید.', anno:[{tool:'circle', pts:[[72,62],[82,62]]}]}],
      acts:[A('mehdi',-4,600,'move','کارت را به سارا کریمی سپرد · دوبعدی'),A('sara',-2,600,'ver','نسخه‌ی ۱ را برای بررسی فرستاد'),A('mehdi',-1,700,'ret','نسخه‌ی ۱ را برای اصلاح برگرداند · نقص در کار'),A('sara',0,610,'ver','نسخه‌ی ۲ را برای بررسی فرستاد',{body:'خطوط ستاره را صاف کردم؛ عدم تقارن را طبق عکس نگه داشتم.'})]},
    {id:136, board:'orders', list:'3d', st:'wait', whos:['amir'], tl:'done', due:1, dueH:18, title:'انگشتر مردانه رکاب‌دار', type:'ring', art:'a-band', cust:{name:'آقای حمید صالحی', phone:'09125554433', ch:'phone'}, karat:18, weight:'۹', desc:'رکاب پهن با نگین عقیق بیضی. سطح کناری مات.',
      chk:K([['مدل سه‌بعدی',1],['رندر از سه زاویه',1]]),
      vers:[V('sketch',1,'maryam',-8,600,'ok','art-sketch',{grade:'good'}),V('2d',1,'sara',-6,600,'ok','art-line',{grade:'great'}),V('3d',1,'amir',0,540,'wait','art-render')],
      acts:[A('mehdi',-3,600,'move','کارت را به امیر رضایی سپرد · سه‌بعدی'),A('amir',0,530,'minor','۲ مورد چک‌لیست را انجام داد',{chk:2}),A('amir',0,540,'ver','نسخه‌ی ۱ را برای بررسی فرستاد')]},
    {id:138, board:'orders', list:'3d', st:'doing', whos:['hossein','amir'], tl:'render', due:3, dueH:14, skipped:['2d'], title:'دستبند کارتیه با پلاک اسم', type:'bracelet', art:'a-bracelet', cust:{name:'خانم رویا امینی', phone:'09124443322', ch:'site'}, karat:18, weight:'۷', desc:'زنجیر کارتیه، پلاک مستطیل با اسم «رویا» به لاتین.',
      chk:K([['مدل زنجیر (حسین)',1],['پلاک و حروف (امیر)',0],['رندر',0]]),
      vers:[V('sketch',1,'maryam',-4,600,'ok','art-sketch',{grade:'great'})],
      acts:[A('mehdi',-3,600,'ok','اسکچ را تأیید کرد · عالی'),A('mehdi',-3,605,'sys','«دوبعدی» برای این کارت رد شد'),A('mehdi',-3,610,'move','کارت را به حسین مرادی و امیر رضایی سپرد · سه‌بعدی'),A('hossein',0,600,'cmt','',{daily:true, st:'ok', body:'مدل زنجیر تمام شد؛ پلاک با امیر.', files:[]})]},
    {id:128, board:'orders', list:'cust', st:'sent', sent:{t:-2, m:640, via:'wa'}, link:502, title:'گردنبند پروانه با نگین', type:'necklace', art:'a-butterfly', cust:{name:'خانم ترانه بهرامی', phone:'09381234567', ch:'wa'}, karat:18, weight:'۶', desc:'پروانه با بال‌های مشبک و نگین سفید روی بدنه.',
      vers:[V('sketch',1,'maryam',-12,600,'ok','art-sketch',{grade:'good'}),V('2d',1,'sara',-9,600,'ok','art-line',{grade:'great'}),V('3d',1,'amir',-3,600,'ok','art-render',{grade:'great'})],
      acts:[A('mehdi',-3,620,'ok','سه‌بعدی را تأیید کرد · عالی'),A('mehdi',-2,640,'move','برای مشتری فرستاد · واتساپ')]},
    {id:131, board:'orders', list:'cust', st:'sent', sent:{t:0, m:520, via:'tg'}, title:'سکه‌ی آویز تولد', type:'pendant', art:'a-coin', cust:{name:'آقای بهزاد کیانی', phone:'09195556677', ch:'tg'}, karat:21, weight:'۸', desc:'سکه با نقش ماه تولد (آذر) و تاریخ پشت آن.',
      vers:[V('sketch',1,'elham',-10,600,'ok','art-sketch',{grade:'good'}),V('3d',1,'hossein',-1,600,'ok','art-render',{grade:'good'})],
      acts:[A('mehdi',0,520,'move','برای مشتری فرستاد · تلگرام')]},
    {id:120, board:'orders', list:'cust', st:'sent', arch:'done', archAt:-3, title:'انگشتر نشان خانوادگی', type:'ring', art:'a-ring', cust:{name:'آقای فرهاد نیک‌نام', phone:'09120001122', ch:'inperson'}, vers:[V('3d',1,'amir',-6,600,'ok','art-render',{grade:'great'})], acts:[A('mehdi',-3,700,'ok','مشتری تأیید کرد · کارت بایگانی شد')]},
    {id:117, board:'orders', list:'cust', st:'sent', arch:'done', archAt:-12, title:'سرویس نیم‌ست گل رز', type:'set', art:'a-set', cust:{name:'خانم شیوا رضوی', phone:'09123334455', ch:'wa'}, vers:[V('3d',1,'hossein',-15,600,'ok','art-render',{grade:'good'})], acts:[]},
    {id:112, board:'orders', list:'cust', st:'sent', arch:'done', archAt:-40, title:'النگوی ساده‌ی کودک', type:'bangle', art:'a-bangle', cust:{name:'خانم زهره اکبری', phone:'09127778811', ch:'phone'}, vers:[V('3d',1,'amir',-44,600,'ok','art-render',{grade:'good'})], acts:[]},
    {id:125, board:'orders', list:'sketch', st:'doing', arch:'cancel', archAt:-5, cancelWhy:'مشتری منصرف شد', title:'گوشواره آویز اشک', type:'earring', art:'a-drops', cust:{name:'خانم لیلا فتحی', phone:'09134445566', ch:'tg'}, acts:[]},
    {id:119, board:'orders', list:'queue', arch:'cancel', archAt:-20, cancelWhy:'بیعانه پرداخت نشد', title:'دستبند زنجیری ساده', type:'bracelet', art:'a-bracelet', cust:{name:'آقای کیوان مهری', phone:'09136667788', ch:'phone'}, acts:[]},
    {id:503, board:'content', list:'idea', title:'ریلز معرفی کالکشن پاییز', art:'a-reel', desc:'۱۵ ثانیه، نور گرم، پنج قطعه‌ی کالکشن پشت سر هم.', acts:[A('mehdi',-1,800,'sys','این کارت را به «ایده‌ها» اضافه کرد')]},
    {id:504, board:'content', list:'idea', title:'پست آموزشی: تشخیص عیار طلا', art:'a-post', desc:'اسلایدی، ۵ صفحه.', acts:[A('mehdi',0,500,'sys','این کارت را به «ایده‌ها» اضافه کرد')]},
    {id:501, board:'content', list:'shoot', st:'doing', whos:['niloofar'], tl:'doing', due:1, dueH:13, link:120, title:'عکاسی محصول: انگشتر نشان خانوادگی', art:'a-photo', desc:'پنج زاویه روی زمینه‌ی کرم + یک عکس روی دست.',
      chk:K([['نورپردازی',0],['پنج زاویه',0],['عکس روی دست',0]]),
      acts:[A('mehdi',-1,900,'move','کارت را به نیلوفر صادقی سپرد · عکاسی'),A('niloofar',0,605,'cmt','',{daily:true, st:'stuck', body:'استودیو امروز آزاد نیست؛ فردا صبح عکاسی می‌کنم.', files:[F('f8','img','برنامه‌ی استودیو','niloofar',0,{art:'a-photo'})]})]},
    {id:502, board:'content', list:'edit', st:'wait', whos:['reza'], tl:'done', due:0, dueH:16, link:128, title:'پست اینستاگرام: گردنبند پروانه', art:'a-post', desc:'کاروسل سه‌تایی با رندر و عکس روی گردن.',
      chk:K([['ادیت رنگ',1],['کپشن',1]]),
      vers:[V('shoot',1,'niloofar',-2,600,'ok','art-photo',{grade:'good'}),V('edit',1,'reza',0,600,'wait','art-line')],
      acts:[A('mehdi',-1,600,'move','کارت را به رضا جعفری سپرد · تدوین و طراحی پست'),A('reza',0,590,'minor','۲ مورد چک‌لیست را انجام داد',{chk:2}),A('reza',0,600,'ver','نسخه‌ی ۱ را برای بررسی فرستاد')]},
    {id:500, board:'content', list:'pub', st:'ready', title:'استوری: پیشنهاد هدیه‌ی روز مادر', art:'a-post', vers:[V('edit',1,'reza',-1,600,'ok','art-line',{grade:'great'})], acts:[A('mehdi',-1,700,'ok','تأیید کرد · آماده‌ی انتشار')]},
    {id:498, board:'content', list:'pub', st:'ready', arch:'done', archAt:-6, title:'پست معرفی سرویس عروس', art:'a-post', vers:[V('edit',1,'reza',-8,600,'ok','art-line',{grade:'good'})], acts:[]}
  ];
  return cards.map(c => this.blankCard(c));
}
blankCard(o) { return Object.assign({st:'unassigned', whos:[], pool:false, tl:null, due:null, dueH:14, urgent:false, paused:false, karat:18, weight:'', desc:'', chk:[], vers:[], fb:[], acts:[], att:[], skipped:[], cust:null, link:null, arch:null, type:'other', art:'a-coin'}, o); }

/* ================= helpers ================= */
fa(x) { return String(x == null ? '' : x).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/\./g, '٫'); }
en(x) { return String(x || '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.'); }
hm(m) { m = ((Math.round(m) % 1440) + 1440) % 1440; return this.fa(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')); }
ymd(off) {
  const Ls = [31,31,31,31,31,31,30,30,30,30,30,29];
  let y = 1405, mo = 7, d = 27 + Math.round(off);
  while (d > Ls[mo - 1]) { d -= Ls[mo - 1]; mo++; if (mo > 12) { mo = 1; y++; } }
  while (d < 1) { mo--; if (mo < 1) { mo = 12; y--; } d += Ls[mo - 1]; }
  return {y, m: mo, d};
}
offOf(y, m, d) { let off = 0; const Ls = [31,31,31,31,31,31,30,30,30,30,30,29]; const base = this.ymd(0); if (y !== base.y) return null; for (let i = base.m; i < m; i++) off += Ls[i - 1]; for (let i = m; i < base.m; i++) off -= Ls[i - 1]; return off + d - base.d; }
wd(off) { return (((Math.round(off) + 2) % 7) + 7) % 7; }
dShort(off) { const t = this.ymd(off); return this.fa(t.d) + ' ' + this.C.MONTHS[t.m - 1]; }
dLong(off) { const t = this.ymd(off); return this.fa(t.d) + ' ' + this.C.MONTHS[t.m - 1] + ' ' + this.fa(t.y); }
dFull(off) { return this.C.WD[this.wd(off)] + ' ' + this.dLong(off); }
when(t, m) { const r = t - this.state.today; const day = r === 0 ? 'امروز' : r === -1 ? 'دیروز' : this.dShort(t); return m == null ? day : day + '، ' + this.hm(m); }
ago(t, m) {
  const s = this.state; const mins = (s.today - t) * 1440 + (s.now - (m || 0));
  if (mins < 60) return this.fa(Math.max(1, mins)) + ' دقیقه';
  const h = Math.floor(mins / 60); if (h < 24) return this.fa(h) + ' ساعت';
  return this.fa(Math.floor(h / 24)) + ' روز';
}
tick() { this.state.now = this.state.now + 2; return {t: this.state.today, m: this.state.now}; }
clone(x) { return JSON.parse(JSON.stringify(x)); }
later(k, fn, ms) { clearTimeout(this.tos[k]); this.tos[k] = setTimeout(fn, ms); }
every(k, fn, ms) { clearInterval(this.ivs[k]); this.ivs[k] = setInterval(fn, ms); }
stop(k) { clearInterval(this.ivs[k]); delete this.ivs[k]; }
componentWillUnmount() { Object.keys(this.tos).forEach(k => clearTimeout(this.tos[k])); Object.keys(this.ivs).forEach(k => clearInterval(this.ivs[k])); }
uid(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 9999); }
get(id) { return this.state.cards.find(c => c.id === id); }
board(id) { return this.state.boards.find(b => b.id === id); }
team(id) { return this.state.teams.find(t => t.id === id); }
sec(id) { return this.state.sections.find(x => x.id === id); }
listOf(c) { const b = this.board(c.board); return b ? b.lists.find(l => l.id === c.list) : null; }
listBy(bid, lid) { const b = this.board(bid); return b ? b.lists.find(l => l.id === lid) : null; }
secOf(c) { const L = this.listOf(c); return L && L.kind === 'work' && L.sec ? this.sec(L.sec) : null; }
code(c) { const b = this.board(c.board); return (b ? b.prefix : 'ک') + '-' + this.fa(String(c.id).padStart(4, '0')); }
person(id) { if (id === 'mehdi') return this.C.MGR; if (id === 'cust') return {id, name: 'مشتری', init: 'م', bg: '#7D7068', secs: []}; return this.state.staff.find(p => p.id === id) || {id, name: '—', init: '؟', bg: '#A39A90', secs: []}; }
sname(id) { return this.person(id).name; }
first(id) { if (id === 'mehdi') return this.C.MGR.name; return this.sname(id).split(' ')[0]; }
names(ids) { const n = ids.map(i => this.sname(i)); return n.length <= 1 ? n.join('') : n.slice(0, -1).join('، ') + ' و ' + n[n.length - 1]; }
secNames(p) { return p.secs.map(id => (this.sec(id) || {}).name).filter(Boolean); }
liveCards() { const s = this.state; return s.empty ? [] : s.cards.filter(c => !c.arch); }
workLists(b) { return b.lists.filter(l => l.kind === 'work'); }
endList(b) { return b.lists.find(l => l.kind === 'cust' || l.kind === 'final'); }
queueList(b) { return b.lists.find(l => l.kind === 'queue') || b.lists[0]; }
teamOfBoard(b) { return this.team(b.team) || {name: '', bg: '#7D7068'}; }
boardStaff(b) { const secIds = this.state.sections.filter(x => x.team === b.team).map(x => x.id); return this.state.staff.filter(p => p.active && p.secs.some(id => secIds.includes(id))); }
staffFor(secId) { return this.state.staff.filter(p => p.active && p.secs.includes(secId)); }
isMine(c, pid) { return (c.whos || []).includes(pid); }
isActiveWork(c) { const L = this.listOf(c); return !c.arch && !!L && L.kind === 'work' && ['doing','returned','wait'].includes(c.st); }
activeOf(pid) { return this.liveCards().filter(c => this.isMine(c, pid) && this.isActiveWork(c)); }
teamCards(secId) { return this.liveCards().filter(c => { const L = this.listOf(c); return L && L.kind === 'work' && L.sec === secId; }); }
myTeams() { const s = this.state; if (s.role === 'mgr') return s.sections; const p = this.person(s.me); return s.sections.filter(x => p.secs.includes(x.id)); }
tlRole(secId, role) { const x = this.sec(secId); if (!x) return null; const ls = x.lists; return ls.find(l => l.role === role) || (role === 'in' ? ls[0] : role === 'done' ? ls[ls.length - 1] : ls[Math.min(1, ls.length - 1)]); }
tlOf(c) { const x = this.secOf(c); if (!x) return null; const f = x.lists.find(l => l.id === c.tl); if (f) return f; return this.tlRole(x.id, c.st === 'wait' ? 'done' : (c.whos || []).length ? 'doing' : 'in'); }
isLate(c) { const L = this.listOf(c); return !c.arch && L && L.kind === 'work' && ['doing','returned'].includes(c.st) && c.due != null && !c.paused && c.due < this.state.today; }
nextVer(c) { return c.vers.filter(v => v.list === c.list).length + 1; }
lastWait(c) { return c.vers.filter(v => v.list === c.list && v.status === 'wait').pop() || null; }
myBoards() { const s = this.state; return s.role === 'mgr' ? s.boards : []; }
scoreOf(p) {
  const s = this.state;
  if (!p || !p.metrics || p.tasks < s.minTasks) return null;
  const w = s.weights[p.secs[0]] || [25,25,25,25];
  let sum = 0; for (let i = 0; i < 4; i++) sum += w[i] * p.metrics[i];
  return Math.round(sum / Math.max(1, w.reduce((a, b) => a + b, 0)));
}
levelOf(score) { const Lv = this.state.levels; if (score == null) return null; return score >= Lv[2] ? 24 : score >= Lv[1] ? 21 : score >= Lv[0] ? 18 : 0; }
ktCls(k) { return k === 24 ? 'k24' : k === 21 ? 'k21' : 'k18'; }
ktTxt(k) { return k ? this.fa(k) + ' عیار' : 'در مسیر ۱۸ عیار'; }
toNext(score) {
  const Lv = this.state.levels; if (score == null) return '';
  if (score >= Lv[2]) return 'بالاترین سطح: ۲۴ عیار';
  const next = score >= Lv[1] ? [Lv[2], 24] : score >= Lv[0] ? [Lv[1], 21] : [Lv[0], 18];
  return this.fa(next[0] - score) + ' امتیاز تا ' + this.fa(next[1]) + ' عیار';
}
ktOf(pid) { const p = this.person(pid); const sc = this.scoreOf(p); const k = this.levelOf(sc); return {score: sc, k, cls: this.ktCls(k), kt: k ? this.fa(k) : '–', txt: sc == null ? 'داده‌ی کافی نیست' : this.ktTxt(k)}; }
canObj(r) { return r.reason === 'defect' && !r.obj && this.state.today - r.t <= 7; }
bars(id, n) {
  let h = 0; const str = String(id); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  const out = []; for (let i = 0; i < (n || 30); i++) { h = (h * 1103515245 + 12345) >>> 0; out.push(6 + (h % 19)); }
  return out;
}
voice(id, dur) {
  const p = this.state.play; const on = p.id === id; const pos = on ? p.pos : 0;
  const hs = this.bars(id, 30);
  const secs = on ? Math.floor(pos * dur) : dur;
  return {
    label: on ? 'توقف پیام صوتی' : 'پخش پیام صوتی', icon: on ? 'i-pause' : 'i-play',
    bars: hs.map((h, i) => ({h, c: on && i / hs.length < pos ? 'p' : ''})),
    t: this.fa(Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')),
    toggle: () => this.togglePlay(id, dur)
  };
}
togglePlay(id, dur) {
  const p = this.state.play;
  if (p.id === id) { this.stop('play'); this.setState({play: {id: null, pos: 0}}); return; }
  this.setState({play: {id, pos: 0}});
  this.every('play', () => {
    const q = this.state.play; if (q.id !== id) return;
    const pos = q.pos + 0.1 / Math.max(dur, 1);
    if (pos >= 1) { this.stop('play'); this.setState({play: {id: null, pos: 0}}); } else this.setState({play: {id, pos}});
  }, 100);
}
pathFor(shapes) {
  const f = n => Math.round(n * 10) / 10;
  return (shapes || []).map(a => {
    const p = a.pts; if (!p || !p.length) return '';
    const [x0, y0] = p[0], [x1, y1] = p[p.length - 1];
    if (a.tool === 'circle') { const r = Math.max(3, Math.hypot(x1 - x0, y1 - y0)); return 'M' + f(x0 - r) + ' ' + f(y0) + 'a' + f(r) + ' ' + f(r) + ' 0 1 0 ' + f(2 * r) + ' 0a' + f(r) + ' ' + f(r) + ' 0 1 0 ' + f(-2 * r) + ' 0'; }
    if (a.tool === 'arrow') {
      const ang = Math.atan2(y1 - y0, x1 - x0), Ln = 6, sp = 0.5;
      return 'M' + f(x0) + ' ' + f(y0) + 'L' + f(x1) + ' ' + f(y1) + 'M' + f(x1) + ' ' + f(y1) + 'L' + f(x1 - Ln * Math.cos(ang - sp)) + ' ' + f(y1 - Ln * Math.sin(ang - sp)) + 'M' + f(x1) + ' ' + f(y1) + 'L' + f(x1 - Ln * Math.cos(ang + sp)) + ' ' + f(y1 - Ln * Math.sin(ang + sp));
    }
    return 'M' + p.map(q => f(q[0]) + ' ' + f(q[1])).join('L');
  }).join(' ');
}
nt(list, to, text, extra) { return [Object.assign({id: 'n' + Date.now() + Math.floor(Math.random() * 99999), to, text, t: this.state.today, m: this.state.now, unread: true, act: false}, extra || {})].concat(list); }
ntMany(list, tos, text, extra) { let l = list; tos.forEach(to => { l = this.nt(l, to, text, extra); }); return l; }
toast(text, o) {
  o = o || {};
  this.setState({toast: {text, icon: o.icon || 'i-check', undo: o.undo || null, action: o.action || null}});
  this.later('toast', () => this.setState({toast: null}), o.ms || 6500);
}
snap() { return {cards: this.clone(this.state.cards)}; }
mutate(id, fn, extra) {
  const cards = this.state.cards.map(c => { if (c.id !== id) return c; const x = this.clone(c); fn(x); return x; });
  this.setState(Object.assign({cards}, extra || {}));
}
act(c, by, k, text, extra) { const T = this.tick(); c.acts.push(Object.assign({by, t: T.t, m: T.m, k, text}, extra || {})); }
flashCard(id) { this.setState({flash: id}); this.later('flash', () => this.setState({flash: null}), 1800); }
setM(p) { this.setState({m: Object.assign({}, this.state.m, p)}); }
setX(p) { this.setState({cbx: Object.assign({}, this.state.cbx, p)}); }
setLogin(p) { this.setState({login: Object.assign({}, this.state.login, p)}); }
fakeFile(i, by, art) { const f = this.C.FILES[i % this.C.FILES.length]; const T = {t: this.state.today, m: this.state.now}; return {id: this.uid('f'), kind: f[0], name: f[1], by, t: T.t, m: T.m, art: f[0] === 'img' ? (art || 'a-photo') : null}; }
fileVM(f, del) { return {kind: f.kind, isImg: f.kind === 'img', notImg: f.kind !== 'img', art: f.art || 'a-photo', name: f.name, icon: f.kind === 'pdf' ? 'i-report' : f.kind === 'img' ? 'i-image' : 'i-clip', ext: f.kind === 'pdf' ? 'PDF' : f.kind === 'img' ? 'عکس' : 'فایل', del: del || (() => {}), canDel: !!del, open: () => f.kind === 'img' ? this.openDlg('light', {art: f.art || 'a-photo', style: 'art-photo', path: '', note: f.name, title: f.name}) : this.toast('«' + f.name + '» باز شد.', {icon: 'i-download', ms: 2500})}; }

/* ================= navigation ================= */
closeAll() { return {hdr: {boards:false, create:false, notif:false, user:false}, filterOpen: false, qm: null, search: '', lMenu: null}; }
go(page, extra) {
  const st = Object.assign(this.closeAll(), {page, demo: false, quick: null, quickRefs: [], lEdit: null, addL: null}, extra || {});
  if (this.state.pageState === 'ok') {
    st.pageState = 'loading';
    this.later('load', () => this.setState({pageState: 'ok'}), 300);
  }
  this.setState(st);
  try { window.scrollTo(0, 0); } catch (e) {}
}
goBoard(id) { this.go('board', {boardId: id, filter: {who: null, flag: null}}); }
goTeam(id) { this.go('team', {teamId: id, filter: {who: null, flag: null}}); }
homeFor(role, me) { if (role === 'mgr') return {page: 'home'}; const p = this.person(me || this.state.me); return {page: 'team', teamId: p.secs[0] || 'sk'}; }
setRole(r) {
  this.stop('play'); this.stop('rec');
  this.go(this.homeFor(r).page, Object.assign({role: r, cb: null, cbPop: null, dlg: null, m: {}, onlyMine: false}, this.homeFor(r)));
}
setMe(pid) { this.go('team', Object.assign({me: pid, role: 'stf', cb: null, dlg: null, onlyMine: false}, this.homeFor('stf', pid))); }
toggleHdr(k) { const h = this.state.hdr; const n = {boards:false, create:false, notif:false, user:false}; n[k] = !h[k]; this.setState({hdr: n, filterOpen: false, qm: null, lMenu: null}); }
closePops() { this.setState(this.closeAll()); }
openCard(id, extra) {
  const s = this.state, c = this.get(id); if (!c) return;
  const notifs = s.notifs.map(n => n.cid === id && n.unread && n.to === (s.role === 'mgr' ? 'mgr' : s.me) ? Object.assign({}, n, {unread: false}) : n);
  this.setState(Object.assign(this.closeAll(), {cb: id, cbPop: null, cbx: Object.assign(this.cbxInit(), extra || {}), notifs}));
}
closeCard() { this.stop('play'); this.setState({cb: null, cbPop: null, cbx: this.cbxInit(), play: {id: null, pos: 0}}); }
openDlg(name, m) { this.stop('rec'); this.setState({dlg: name, m: Object.assign({tried: false}, m || {}), qm: null, cbPop: null, lMenu: null, hdr: {boards:false, create:false, notif:false, user:false}}); }
closeDlg() { this.stop('rec'); this.setState({dlg: null, m: {}}); }

/* ================= login ================= */
loginSend() {
  const l = this.state.login; const d = this.en(l.phone).replace(/\D/g, '');
  if (!/^09\d{9}$/.test(d)) { this.setLogin({err: d ? 'شماره‌ی موبایل ۱۱ رقمی است و با ۰۹ شروع می‌شود.' : 'شماره‌ی موبایل را بنویسید.'}); return; }
  this.setLogin({step: 'code', code: '', err: '', timer: 60, phone: this.fa(d)});
  this.every('otp', () => { const t = this.state.login.timer; if (t <= 1) this.stop('otp'); this.setLogin({timer: Math.max(0, t - 1)}); }, 1000);
}
loginVerify() {
  const l = this.state.login; const c = this.en(l.code).replace(/\D/g, '');
  if (c.length < 5) { this.setLogin({err: 'کد ۵ رقمی را کامل بنویسید.'}); return; }
  if (c !== '12345') { this.setLogin({err: 'کد درست نیست. دوباره امتحان کنید.'}); return; }
  this.stop('otp');
  this.setState({logged: true, login: {step: 'phone', phone: '', code: '', err: '', timer: 0}});
  const h = this.homeFor(this.state.role); this.go(h.page, h);
}
logout() { this.stop('otp'); this.setState(Object.assign(this.closeAll(), {logged: false, cb: null, dlg: null, demo: false, login: {step: 'phone', phone: '', code: '', err: '', timer: 0}})); }

/* ================= drag & drop (pipeline board and team board) ================= */
dragStart(id, ctx, e) {
  const s = this.state;
  if (ctx === 'pipe' && s.role !== 'mgr') { try { e.preventDefault(); } catch (x) {} return; }
  try { e.dataTransfer.setData('text/plain', String(id)); e.dataTransfer.effectAllowed = 'move'; } catch (x) {}
  this.setState({drag: id, dragCtx: ctx, qm: null});
}
dragEnd() { this.setState({drag: null, over: null}); }
listOver(lid, e) { if (this.state.drag == null) return; e.preventDefault(); if (this.state.over !== lid) this.setState({over: lid}); }
listLeave(lid, e) { try { if (e.currentTarget.contains(e.relatedTarget)) return; } catch (x) {} if (this.state.over === lid) this.setState({over: null}); }
listDrop(lid, ctx, e) {
  try { e.preventDefault(); } catch (x) {}
  const id = this.state.drag, dctx = this.state.dragCtx; this.setState({drag: null, over: null});
  if (id == null || dctx !== ctx) return;
  if (ctx === 'pipe') this.moveTo(id, lid); else this.moveTeam(id, lid);
}

/* ================= quick add card (with reference photo) ================= */
openQuick(ctx, lid) { this.setState({quick: {ctx, list: lid}, quickText: '', quickRefs: [], addL: null, lEdit: null, lMenu: null}); }
closeQuick() { this.setState({quick: null, quickText: '', quickRefs: []}); }
addQuickRef() { const s = this.state; this.setState({quickRefs: s.quickRefs.concat([this.fakeFile(s.quickRefs.length % 2 ? 2 : 0, 'mehdi', 'a-ring')])}); }
quickAdd() {
  const s = this.state, q = s.quick, t = s.quickText.trim();
  if (!q) return;
  if (!t) { this.toast('عنوان کارت را بنویسید.', {icon: 'i-alert', ms: 2500}); return; }
  const id = s.nextId;
  let c, msg;
  const refs = s.quickRefs.map(f => Object.assign({}, f, {ref: true, name: 'عکس نمونه'}));
  if (q.ctx === 'pipe') {
    const b = this.board(s.boardId), L = this.listBy(b.id, q.list);
    c = this.blankCard({id, board: b.id, list: L.id, title: t, att: refs, art: b.id === 'content' ? 'a-post' : 'a-ring'});
    if (L.kind === 'work') { c.st = 'doing'; c.pool = true; c.tl = this.tlRole(L.sec, 'in').id; }
    c.acts.push({by: 'mehdi', t: s.today, m: s.now, k: 'sys', text: 'این کارت را به «' + L.name + '» اضافه کرد' + (L.kind === 'work' ? ' · برای کل تیم ' + this.sec(L.sec).name : '')});
    msg = L.kind === 'work' ? 'کارت به صف تیم ' + this.sec(L.sec).name + ' رفت؛ خودشان تقسیم می‌کنند.' : null;
    let notifs = s.notifs;
    if (L.kind === 'work') notifs = this.ntMany(notifs, this.staffFor(L.sec).map(p => p.id), 'کار تازه برای کل تیم ' + this.sec(L.sec).name + ': «' + t + '».', {cid: id, act: true});
    this.setState({cards: s.cards.concat([c]), nextId: id + 1, quickText: '', quickRefs: [], notifs});
  } else {
    const sec = this.sec(s.teamId), tl = sec.lists.find(l => l.id === q.list) || sec.lists[0];
    const b = s.boards.find(x => x.lists.some(l => l.kind === 'work' && l.sec === sec.id));
    const L = b.lists.find(l => l.kind === 'work' && l.sec === sec.id);
    c = this.blankCard({id, board: b.id, list: L.id, title: t, st: 'doing', pool: true, tl: tl.id, att: refs, art: b.id === 'content' ? 'a-post' : 'a-ring'});
    c.acts.push({by: 'mehdi', t: s.today, m: s.now, k: 'sys', text: 'این کارت را در تابلوی تیم ' + sec.name + ' ساخت'});
    this.setState({cards: s.cards.concat([c]), nextId: id + 1, quickText: '', quickRefs: []});
  }
  this.flashCard(id);
  this.toast(msg || 'کارت ثبت شد.', {icon: 'i-check', action: {label: 'باز کردن', fn: () => this.openCard(id)}});
}

/* ================= lists: add, rename, reorder, delete ================= */
startRename(ctx, id, name) { this.setState({lEdit: {ctx, id, text: name}, lMenu: null, addL: null, quick: null}); }
saveRename() {
  const s = this.state, e = s.lEdit; if (!e) return;
  const t = e.text.trim();
  if (!t) { this.setState({lEdit: null}); return; }
  if (e.ctx === 'pipe') this.setState({boards: s.boards.map(b => b.id !== s.boardId ? b : Object.assign({}, b, {lists: b.lists.map(l => l.id === e.id ? Object.assign({}, l, {name: t}) : l)})), lEdit: null});
  else this.setState({sections: s.sections.map(x => x.id !== s.teamId ? x : Object.assign({}, x, {lists: x.lists.map(l => l.id === e.id ? Object.assign({}, l, {name: t}) : l)})), lEdit: null});
}
listMenu(ctx, id, e) {
  try { e.stopPropagation(); } catch (x) {}
  const cur = this.state.lMenu;
  this.setState({lMenu: cur && cur.id === id && cur.ctx === ctx ? null : {ctx, id}, qm: null, filterOpen: false});
}
moveList(ctx, id, dir) {
  const s = this.state;
  const mv = ls => { const i = ls.findIndex(l => l.id === id), j = i + dir; if (i < 0 || j < 0 || j >= ls.length) return ls; const out = ls.slice(); const t = out[i]; out[i] = out[j]; out[j] = t; return out; };
  if (ctx === 'pipe') this.setState({boards: s.boards.map(b => b.id !== s.boardId ? b : Object.assign({}, b, {lists: mv(b.lists)})), lMenu: null});
  else this.setState({sections: s.sections.map(x => x.id !== s.teamId ? x : Object.assign({}, x, {lists: mv(x.lists)})), lMenu: null});
}
deleteList(ctx, id) {
  const s = this.state;
  if (ctx === 'pipe') {
    const b = this.board(s.boardId), L = b.lists.find(l => l.id === id);
    if (s.cards.some(c => c.board === b.id && c.list === id && !c.arch)) { this.toast('اول کارت‌های این لیست را جابه‌جا کنید.', {icon: 'i-alert'}); return; }
    const snapB = this.clone(s.boards);
    this.setState({boards: s.boards.map(x => x.id !== b.id ? x : Object.assign({}, x, {lists: x.lists.filter(l => l.id !== id)})), lMenu: null});
    this.toast('لیست «' + L.name + '» حذف شد.', {undo: {boards: snapB}, icon: 'i-trash'});
  } else {
    const sec = this.sec(s.teamId), L = sec.lists.find(l => l.id === id);
    if (L.role === 'in' || L.role === 'done') { this.toast('«' + L.name + '» لیست اصلی تیم است و حذف نمی‌شود؛ می‌توانید نامش را عوض کنید.', {icon: 'i-alert'}); return; }
    const snap = {sections: this.clone(s.sections), cards: this.clone(s.cards)};
    const back = this.tlRole(sec.id, 'doing').id === id ? sec.lists[0].id : this.tlRole(sec.id, 'doing').id;
    this.setState({sections: s.sections.map(x => x.id !== sec.id ? x : Object.assign({}, x, {lists: x.lists.filter(l => l.id !== id)})), cards: s.cards.map(c => c.tl === id && (this.secOf(c) || {}).id === sec.id ? Object.assign({}, c, {tl: back}) : c), lMenu: null});
    this.toast('لیست «' + L.name + '» حذف شد؛ کارت‌هایش به لیست قبلی رفتند.', {undo: snap, icon: 'i-trash'});
  }
}
openAddList(ctx) { const s = this.state; this.setState({addL: {ctx, text: '', sec: 'new'}, quick: null, lEdit: null, lMenu: null}); }
saveAddList() {
  const s = this.state, a = s.addL; if (!a) return;
  const t = a.text.trim(); if (!t) { this.toast('نام لیست را بنویسید.', {icon: 'i-alert', ms: 2500}); return; }
  if (a.ctx === 'team') {
    const sec = this.sec(s.teamId);
    const nl = {id: this.uid('t'), name: t, role: null};
    this.setState({sections: s.sections.map(x => { if (x.id !== sec.id) return x; const ls = x.lists.slice(); const di = ls.findIndex(l => l.role === 'done'); ls.splice(di < 0 ? ls.length : di, 0, nl); return Object.assign({}, x, {lists: ls}); }), addL: {ctx: 'team', text: '', sec: 'new'}});
    this.toast('لیست «' + t + '» به تابلوی تیم ' + sec.name + ' اضافه شد.', {icon: 'i-check', ms: 3000});
    return;
  }
  const b = this.board(s.boardId);
  let sections = s.sections, secId = a.sec, newSec = null;
  if (a.sec === 'new') { newSec = {id: this.uid('s'), team: b.team, name: t, bg: this.C.BGS[(s.sections.length + 3) % this.C.BGS.length][0], lists: this.tlDefault()}; sections = sections.concat([newSec]); secId = newSec.id; }
  const w = this.C.WL[this.workLists(b).length % this.C.WL.length];
  const nl = a.sec === 'none' ? {id: this.uid('l'), name: t, kind: 'queue', lbl: 'L-n', style: 'art-photo'} : {id: this.uid('w'), name: t, kind: 'work', sec: secId, lbl: w[0], style: w[1], days: [1, 2, 3]};
  const boards = s.boards.map(x => { if (x.id !== b.id) return x; const ls = x.lists.slice(); const ei = ls.findIndex(l => l.kind === 'cust' || l.kind === 'final'); ls.splice(ei < 0 ? ls.length : ei, 0, nl); return Object.assign({}, x, {lists: ls}); });
  this.setState({boards, sections, addL: null});
  this.toast(newSec ? 'لیست «' + t + '» و تیم تازه‌اش ساخته شد. حالا عضو اضافه کنید.' : 'لیست «' + t + '» اضافه شد.', {icon: 'i-check', action: newSec ? {label: 'افزودن عضو', fn: () => this.openMembers(newSec.id)} : null});
}

/* ================= moving & flows (pipeline) ================= */
moveTo(id, lid) {
  const c = this.get(id); this.setState({qm: null, cbPop: null});
  if (!c || c.list === lid) return;
  const b = this.board(c.board), L = this.listBy(b.id, lid); if (!L) return;
  if (L.kind === 'queue') {
    const snap = this.snap();
    this.mutate(id, x => { x.list = lid; x.st = 'unassigned'; x.whos = []; x.pool = false; x.due = null; x.paused = false; this.act(x, 'mehdi', 'move', 'کارت را به «' + L.name + '» برد'); });
    this.flashCard(id);
    this.toast('«' + c.title + '» به ' + L.name + ' رفت.', {undo: snap, icon: 'i-move'});
    return;
  }
  if (L.kind === 'work') { this.openAssign(id, 'move', lid); return; }
  const cur = this.listOf(c);
  if (c.st !== 'ready' || cur.kind !== 'work') { this.toast('اول باید آخرین نسخه‌ی کار تأیید شود.', {icon: 'i-alert'}); return; }
  if (L.kind === 'cust') { this.openDlg('send', {cid: id, via: null}); return; }
  const snap = this.snap();
  this.mutate(id, x => { x.list = lid; this.act(x, 'mehdi', 'move', 'کارت را به «' + L.name + '» برد'); });
  this.flashCard(id);
  this.toast('به «' + L.name + '» رفت.', {undo: snap, icon: 'i-move'});
}
nextWorkAfter(c) {
  const b = this.board(c.board), i = b.lists.findIndex(l => l.id === c.list);
  return b.lists.slice(i + 1).filter(l => l.kind === 'work');
}
assignAction(id) {
  const c = this.get(id), b = this.board(c.board), L = this.listOf(c); this.setState({qm: null});
  if (!this.workLists(b).length) { this.toast('این تابلو هنوز لیست کاری ندارد.', {icon: 'i-alert'}); return; }
  if (L.kind === 'queue') return this.openAssign(id, 'queue');
  if (c.st === 'next') return this.openAssign(id, 'approve');
  return this.openAssign(id, 'reassign');
}
openAssign(id, from, stage) {
  const c = this.get(id), b = this.board(c.board), s = this.state, w = this.workLists(b);
  let lid = stage;
  if (!lid) {
    if (from === 'queue') lid = w[0].id;
    else if (from === 'approve') lid = (this.nextWorkAfter(c)[0] || w[w.length - 1]).id;
    else if (from === 'custChange') lid = w[w.length - 1].id;
    else lid = c.list;
  }
  const L = this.listBy(b.id, lid) || w[0];
  const same = from === 'reassign' && lid === c.list;
  this.openDlg('assign', {cid: id, from, list: L.id, whos: same ? (c.whos || []).slice() : [], pool: same ? !!c.pool : false,
    due: same && c.due != null ? c.due : s.today + ((L.days || [1, 2, 3])[1]), dueH: same ? (c.dueH || 14) : 14, note: '', voice: 0, rec: false, recMs: 0, files: []});
}
asPickStage(lid) {
  const m = this.state.m, L = this.listBy(this.get(m.cid).board, lid);
  this.setM({list: lid, whos: [], pool: false, tried: false, due: this.state.today + ((L.days || [1, 2, 3])[1])});
}
asTogglePerson(pid) { const m = this.state.m; const on = m.whos.includes(pid); this.setM({whos: on ? m.whos.filter(x => x !== pid) : m.whos.concat([pid]), pool: false, tried: false}); }
asTogglePool() { const m = this.state.m; this.setM({pool: !m.pool, whos: [], tried: false}); }
asAddFile() { const m = this.state.m, c = this.get(m.cid); this.setM({files: m.files.concat([this.fakeFile(m.files.length, 'mehdi', c.art)])}); }
confirmAssign() {
  const s = this.state, m = s.m;
  if (!m.pool && !m.whos.length) { this.setM({tried: true}); return; }
  const c0 = this.get(m.cid), b = this.board(c0.board), L = this.listBy(b.id, m.list), sec = this.sec(L.sec), snap = this.snap();
  const whoTxt = m.pool ? 'کل تیم ' + sec.name : this.names(m.whos);
  const iFrom = b.lists.findIndex(l => l.id === c0.list), iTo = b.lists.findIndex(l => l.id === m.list);
  const skipped = iTo > iFrom ? b.lists.slice(iFrom + 1, iTo).filter(l => l.kind === 'work') : [];
  const cards = s.cards.map(x => {
    if (x.id !== m.cid) return x;
    const c = this.clone(x);
    if (m.from === 'reassign' && m.list === c.list) {
      this.act(c, 'mehdi', 'move', 'اعضای کارت را تغییر داد: ' + whoTxt);
      c.whos = m.whos.slice(); c.pool = m.pool; c.due = m.due; c.dueH = m.dueH;
      if (m.pool && !c.whos.length) c.tl = this.tlRole(sec.id, 'in').id;
    } else {
      if (m.from === 'restore') { c.arch = null; c.cancelWhy = null; this.act(c, 'mehdi', 'sys', 'کارت را از آرشیو برگرداند'); }
      if (m.from === 'custChange') {
        const T = this.tick();
        c.fb.push({list: m.list, n: Math.max(1, c.vers.filter(v => v.list === m.list).length), by: 'mehdi', t: T.t, m: T.m, reason: 'taste', voice: m.voice, text: m.note || 'مشتری تغییراتی خواسته؛ جزئیات در توضیح.', anno: []});
        this.act(c, 'mehdi', 'ret', 'مشتری تغییر خواست؛ کارت به «' + L.name + '» برگشت (از امتیاز کم نمی‌شود)');
        c.sent = null;
      }
      if (skipped.length) { c.skipped = (c.skipped || []).concat(skipped.map(l => l.id)); this.act(c, 'mehdi', 'sys', skipped.map(l => '«' + l.name + '»').join(' و ') + ' برای این کارت رد شد'); }
      const prior = c.vers.filter(v => v.list === m.list).length;
      c.list = m.list; c.whos = m.whos.slice(); c.pool = m.pool; c.due = m.due; c.dueH = m.dueH; c.paused = false;
      c.st = (m.from === 'custChange' || (prior > 0 && m.from !== 'restore')) ? 'returned' : 'doing';
      c.tl = this.tlRole(sec.id, c.st === 'returned' && c.whos.length ? 'doing' : 'in').id;
      this.act(c, 'mehdi', 'move', 'کارت را به ' + whoTxt + ' سپرد · ' + L.name);
    }
    if (m.files.length) c.att = c.att.concat(m.files);
    if (m.note || m.voice || m.files.length) this.act(c, 'mehdi', 'cmt', '', {body: m.note || '', voice: m.voice || 0, files: m.files.slice()});
    return c;
  });
  const targets = m.pool ? this.staffFor(sec.id).map(p => p.id) : m.whos.filter(p => !(c0.list === m.list && (c0.whos || []).includes(p)));
  const notifs = this.ntMany(s.notifs, targets, (m.pool ? 'کار تازه برای کل تیم ' + sec.name + ': «' + c0.title + '»' : 'کار تازه: «' + c0.title + '» · ' + L.name) + ' · تا ' + this.dShort(m.due) + '.', {cid: m.cid, act: true});
  this.stop('rec');
  this.setState({cards, notifs, dlg: null, m: {}});
  this.flashCard(m.cid);
  this.toast((m.pool ? 'به کل تیم ' + sec.name + ' سپرده شد؛ خودشان تقسیم می‌کنند.' : 'به ' + whoTxt + ' سپرده شد و پیامک رفت.') + (m.files.length ? ' فایل‌ها هم پیوست شد.' : ''), {undo: snap, icon: 'i-user-plus'});
}
claim(id) {
  const s = this.state, c = this.get(id), me = s.me;
  if (this.isMine(c, me)) return;
  const sec = this.secOf(c);
  this.mutate(id, x => { x.whos = (x.whos || []).concat([me]); const tl = this.tlOf(x); if (tl && tl.role === 'in') x.tl = this.tlRole(sec.id, 'doing').id; this.act(x, me, 'move', (c.pool && !(c.whos || []).length ? 'کار را برداشت' : 'به کارت پیوست')); },
    {notifs: this.nt(s.notifs, 'mgr', this.sname(me) + ' «' + c.title + '» را برداشت.', {cid: id})});
  this.toast('این کار حالا با شماست' + ((c.whos || []).length ? ' و ' + this.names(c.whos) : '') + '.', {icon: 'i-user-plus'});
}
moveTeam(id, tlId) {
  const s = this.state, c = this.get(id), sec = this.secOf(c); if (!c || !sec) return;
  const T = sec.lists.find(l => l.id === tlId); if (!T) return;
  const curT = this.tlOf(c);
  if (curT && curT.id === tlId) return;
  const me = s.me, isStf = s.role !== 'mgr';
  if (T.role === 'done' && ['doing','returned'].includes(c.st)) {
    if (isStf && !this.isMine(c, me)) { this.toast('اول کار را بردارید.', {icon: 'i-alert'}); return; }
    this.openCard(id, {upFocus: true});
    this.toast('برای رفتن به «' + T.name + '»، فایل نسخه را اضافه کنید و بفرستید؛ کارت خودش جابه‌جا می‌شود.', {icon: 'i-upload'});
    return;
  }
  const snap = this.snap();
  const claimNow = isStf && !this.isMine(c, me) && T.role !== 'in';
  this.mutate(id, x => { x.tl = tlId; if (claimNow) { x.whos = (x.whos || []).concat([me]); this.act(x, me, 'move', 'کار را برداشت'); } this.act(x, isStf ? me : 'mehdi', 'minor', 'کارت را به «' + T.name + '» برد'); });
  this.flashCard(id);
  if (claimNow) this.toast('کار را برداشتید و به «' + T.name + '» رفت.', {undo: snap, icon: 'i-user-plus'});
}
openApprove(id) { this.openDlg('approve', {cid: id, grade: null}); }
confirmApprove() {
  const s = this.state, m = s.m;
  if (!m.grade) { this.setM({tried: true}); return; }
  const c0 = this.get(m.cid), L = this.listOf(c0), b = this.board(c0.board), gl = this.C.GR.find(g => g[0] === m.grade)[1];
  const nexts = this.nextWorkAfter(c0), end = this.endList(b);
  const cards = s.cards.map(x => {
    if (x.id !== m.cid) return x;
    const c = this.clone(x);
    const v = c.vers.filter(q => q.list === c.list && q.status === 'wait').pop();
    if (v) { v.status = 'ok'; v.grade = m.grade; }
    this.act(c, 'mehdi', 'ok', L.name + ' را تأیید کرد · ' + gl);
    if (nexts.length) c.st = 'next';
    else if (end && end.kind === 'final') { c.st = 'ready'; c.list = end.id; this.act(c, 'mehdi', 'move', 'کارت به «' + end.name + '» رفت'); }
    else c.st = 'ready';
    return c;
  });
  const notifs = this.ntMany(s.notifs, c0.whos || [], '«' + c0.title + '» تأیید شد · ' + gl, {cid: c0.id});
  this.setState({cards, notifs, dlg: null, m: {}});
  if (nexts.length) this.openAssign(c0.id, 'approve');
  else if (end && end.kind === 'cust') this.toast('نسخه‌ی نهایی تأیید شد؛ حالا برای مشتری بفرستید.', {icon: 'i-check-c', action: {label: 'ارسال برای مشتری', fn: () => this.openDlg('send', {cid: c0.id, via: null})}});
  else { this.flashCard(c0.id); this.toast('تأیید شد و به «' + (end ? end.name : '') + '» رفت.', {icon: 'i-check-c'}); }
}
openReturn(id) {
  const c = this.get(id), v = this.lastWait(c);
  this.openDlg('return', {cid: id, reason: null, text: '', voice: 0, rec: false, recMs: 0, files: [], tool: 'circle', annos: [], drawing: null, due: this.state.today + 1, n: v ? v.n : c.vers.length});
}
confirmReturn() {
  const s = this.state, m = s.m;
  if (!m.reason) { this.setM({tried: true}); return; }
  const c0 = this.get(m.cid), whos = c0.whos || [], sec = this.secOf(c0);
  const cards = s.cards.map(x => {
    if (x.id !== m.cid) return x;
    const c = this.clone(x); const T = this.tick();
    const v = c.vers.filter(q => q.list === c.list && q.status === 'wait').pop();
    if (v) v.status = 'ret';
    c.fb.push({list: c.list, n: v ? v.n : 1, by: 'mehdi', t: T.t, m: T.m, reason: m.reason, voice: m.voice, text: m.text, anno: m.annos.slice(), files: m.files.slice()});
    if (m.files.length) c.att = c.att.concat(m.files);
    this.act(c, 'mehdi', 'ret', 'نسخه‌ی ' + this.fa(v ? v.n : 1) + ' را برای اصلاح برگرداند · ' + this.C.RS[m.reason]);
    c.st = 'returned'; c.due = m.due; if (sec) c.tl = this.tlRole(sec.id, 'doing').id;
    return c;
  });
  const T = {t: s.today, m: s.now};
  const returns = whos.map(w => ({id: this.uid('r'), who: w, cid: c0.id, title: c0.title, reason: m.reason, t: T.t, m: T.m, mgr: m.text || 'بازخورد صوتی و تصویری ثبت شد.', obj: null})).concat(s.returns);
  const notifs = this.ntMany(s.notifs, whos, '«' + c0.title + '» برای اصلاح برگشت؛ بازخورد را ببینید.', {cid: c0.id, act: true});
  this.stop('rec'); this.stop('play');
  this.setState({cards, returns, notifs, dlg: null, m: {}, play: {id: null, pos: 0}});
  this.toast('برای اصلاح برگشت و پیامک برای ' + (whos.length ? this.names(whos) : 'تیم') + ' رفت.', {icon: 'i-return'});
}
confirmSend() {
  const s = this.state, m = s.m;
  if (!m.via) { this.setM({tried: true}); return; }
  const c0 = this.get(m.cid), end = this.endList(this.board(c0.board)), snap = this.snap();
  this.mutate(m.cid, c => { c.list = end.id; c.st = 'sent'; const T = this.tick(); c.sent = {t: T.t, m: T.m, via: m.via}; this.act(c, 'mehdi', 'move', 'برای مشتری فرستاد · ' + this.C.SEND[m.via][0]); }, {dlg: null, m: {}});
  this.flashCard(m.cid);
  this.toast('به «' + end.name + '» رفت.', {undo: snap, icon: 'i-send'});
}
confirmCust() {
  const s = this.state, m = s.m, snap = this.snap();
  this.mutate(m.cid, c => { c.arch = 'done'; c.archAt = m.date; this.act(c, 'mehdi', 'ok', 'مشتری طرح را تأیید کرد · کارت بایگانی شد'); if (m.note) this.act(c, 'mehdi', 'cmt', '', {body: m.note}); }, {dlg: null, m: {}, cb: null});
  this.toast('تأیید مشتری ثبت شد و کارت به آرشیو رفت.', {undo: snap, icon: 'i-check-c', action: {label: 'آرشیو', fn: () => this.go('archive', {arTab: 'done'})}});
}
publish(id) {
  const snap = this.snap();
  this.mutate(id, c => { c.arch = 'done'; c.archAt = this.state.today; this.act(c, 'mehdi', 'ok', 'انجام شد · کارت بایگانی شد'); }, {cb: null});
  this.toast('انجام شد و کارت به آرشیو رفت.', {undo: snap, icon: 'i-check-c'});
}
custChange(id) { this.openAssign(id, 'custChange'); }
remind(id) {
  const c = this.get(id), sec = this.secOf(c), to = (c.whos || []).length ? c.whos : sec ? this.staffFor(sec.id).map(p => p.id) : [];
  this.setState({notifs: this.ntMany(this.state.notifs, to, 'یادآوری مدیر: «' + c.title + '» را پیگیری کنید.', {cid: id, act: true})});
  this.toast('یادآوری برای ' + ((c.whos || []).length ? this.names(c.whos) : 'تیم ' + (sec ? sec.name : '')) + ' فرستاده شد.', {icon: 'i-bell'});
}
setUrgent(id, why) {
  const c = this.get(id), snap = this.snap(), on = !c.urgent;
  let notifs = this.state.notifs;
  if (on) notifs = this.ntMany(notifs, c.whos || [], '«' + c.title + '» فوری شد' + (why ? ' · ' + why : '') + '.', {cid: id, act: true});
  this.mutate(id, x => { x.urgent = on; x.urgentWhy = on ? why : null; this.act(x, 'mehdi', 'sys', on ? 'کارت را فوری کرد' + (why ? ' · ' + why : '') : 'علامت فوری را برداشت'); }, {cbPop: null, qm: null, notifs, cbx: Object.assign({}, this.state.cbx, {ugQ: null})});
  this.toast(on ? 'فوری شد.' : 'علامت فوری برداشته شد.', {undo: snap, icon: 'i-zap'});
}
cancelCard(id, why) {
  const snap = this.snap(), c = this.get(id);
  this.mutate(id, x => { x.arch = 'cancel'; x.archAt = this.state.today; x.cancelWhy = why; this.act(x, 'mehdi', 'sys', 'کارت را لغو و بایگانی کرد · ' + why); }, {cbPop: null, cb: null, qm: null});
  this.toast('«' + c.title + '» به لغوشده‌ها رفت.', {undo: snap, icon: 'i-archive'});
}
restoreCard(id) {
  const c = this.get(id), b = this.board(c.board), snap = this.snap();
  if (c.arch === 'cancel') {
    const q = this.queueList(b);
    this.mutate(id, x => { x.arch = null; x.cancelWhy = null; x.list = q.id; x.st = 'unassigned'; x.whos = []; x.pool = false; x.due = null; this.act(x, 'mehdi', 'sys', 'کارت را از آرشیو به «' + q.name + '» برگرداند'); }, {cb: null});
    this.toast('به «' + q.name + '» در ' + b.name + ' برگشت.', {undo: snap, icon: 'i-undo', action: {label: 'دیدن تابلو', fn: () => this.goBoard(b.id)}});
  } else {
    const end = this.endList(b) || this.queueList(b);
    this.mutate(id, x => { x.arch = null; x.list = end.id; x.st = end.kind === 'cust' ? 'sent' : 'ready'; if (end.kind === 'cust' && !x.sent) x.sent = {t: this.state.today, m: this.state.now, via: 'wa'}; this.act(x, 'mehdi', 'sys', 'کارت را از آرشیو به «' + end.name + '» برگرداند'); }, {cb: null});
    this.toast('به «' + end.name + '» برگشت.', {undo: snap, icon: 'i-undo', action: {label: 'دیدن تابلو', fn: () => this.goBoard(b.id)}});
  }
}
sendToTeam(id) {
  const s = this.state, x = s.cbx, c = this.get(id);
  if (!x.xBoard) return;
  const b = this.board(x.xBoard), q = this.queueList(b), nid = s.nextId;
  const title = x.xTitle.trim() || c.title;
  const nc = this.blankCard({id: nid, board: b.id, list: q.id, title, art: b.id === 'content' ? 'a-photo' : c.art, link: id, desc: 'ساخته‌شده از ' + this.code(c) + ' · ' + c.title, att: c.att.filter(f => f.kind === 'img').slice(0, 2)});
  nc.acts.push({by: 'mehdi', t: s.today, m: s.now, k: 'sys', text: 'این کارت را از «' + this.board(c.board).name + '» فرستاد'});
  const cards = s.cards.map(y => y.id === id ? Object.assign(this.clone(y), {link: nid}) : y).concat([nc]);
  this.setState({cards, nextId: nid + 1, cbPop: null, cbx: Object.assign({}, x, {xBoard: null, xTitle: ''})});
  this.toast('کارت تازه در «' + q.name + '» ' + b.name + ' ساخته شد.', {icon: 'i-team', action: {label: 'باز کردن', fn: () => this.openCard(nid)}});
}
setDue(id, off, h) {
  const snap = this.snap();
  this.mutate(id, x => { x.due = off; if (h != null) x.dueH = h; x.paused = false; this.act(x, 'mehdi', 'minor', 'تاریخ تحویل را ' + this.dShort(off) + '، ساعت ' + this.hm((h != null ? h : x.dueH) * 60) + ' گذاشت'); }, {cbPop: null, cal: null});
  this.toast('تاریخ تحویل: ' + this.dFull(off), {undo: snap, icon: 'i-clock'});
}
setDueH(id, h) { this.mutate(id, x => { x.dueH = h; this.act(x, 'mehdi', 'minor', 'ساعت تحویل را ' + this.hm(h * 60) + ' گذاشت'); }); }
togglePause(id) {
  const c = this.get(id), on = !c.paused;
  this.mutate(id, x => { x.paused = on; this.act(x, 'mehdi', 'minor', on ? 'زمان تحویل را متوقف کرد' : 'زمان تحویل را دوباره راه انداخت'); }, {cbPop: null});
  this.toast(on ? 'زمان تحویل متوقف شد؛ دیرکرد حساب نمی‌شود.' : 'زمان تحویل دوباره راه افتاد.', {icon: 'i-pause-c'});
}
addAttach(id, ref) {
  const s = this.state, c = this.get(id), by = s.role === 'mgr' ? 'mehdi' : s.me;
  const f = Object.assign(this.fakeFile(ref ? 0 : c.att.length + 1, by, c.art), ref ? {ref: true, name: 'عکس نمونه'} : {});
  this.mutate(id, x => { x.att = x.att.concat([f]); this.act(x, by, 'minor', '«' + f.name + '» را پیوست کرد'); }, {cbPop: null});
  this.toast('«' + f.name + '» پیوست شد.', {icon: 'i-clip', ms: 2500});
}
delAttach(id, fid) { this.mutate(id, x => { x.att = x.att.filter(f => f.id !== fid); }); }
saveTitle(id) {
  const s = this.state, t = s.cbx.tText.trim();
  if (!t) { this.setX({tEdit: false}); return; }
  this.mutate(id, x => { x.title = t; }, {cbx: Object.assign({}, s.cbx, {tEdit: false})});
}

/* ================= staff actions ================= */
addUp() { const c = this.get(this.state.cb), L = this.listOf(c), x = this.state.cbx; this.setX({ups: x.ups.concat([{art: c.art, style: L.style || 'art-sketch'}]), upErr: false}); }
submitVersion() {
  const s = this.state, x = s.cbx, c0 = this.get(s.cb), me = s.role === 'mgr' ? (c0.whos || [])[0] : s.me;
  if (!x.ups.length) { this.setX({upErr: true}); return; }
  const n = this.nextVer(c0), L = this.listOf(c0), sec = this.secOf(c0);
  this.mutate(c0.id, c => { const T = this.tick(); c.vers.push({list: c.list, n, by: me, t: T.t, m: T.m, status: 'wait', style: L.style || 'art-sketch', note: x.upNote}); c.st = 'wait'; if (sec) c.tl = this.tlRole(sec.id, 'done').id; this.act(c, me, 'ver', 'نسخه‌ی ' + this.fa(n) + ' را برای بررسی فرستاد', {body: x.upNote}); },
    {cbx: this.cbxInit(), notifs: this.nt(s.notifs, 'mgr', this.sname(me) + ' نسخه‌ی ' + this.fa(n) + ' «' + c0.title + '» را فرستاد.', {cid: c0.id, act: true})});
  this.toast('نسخه‌ی ' + this.fa(n) + ' برای مدیر رفت و کارت به «' + (sec ? this.tlRole(sec.id, 'done').name : '') + '» رفت. گزارش امروز هم خودکار پر شد.', {icon: 'i-send'});
}
toggleChk(id, i) {
  const s = this.state, by = s.role === 'mgr' ? 'mehdi' : s.me;
  this.mutate(id, c => { const k = c.chk[i]; k.on = !k.on; if (k.on) this.act(c, by, 'minor', 'مورد «' + k.t + '» را انجام داد', {chk: 1}); });
}
addChk() {
  const s = this.state, t = s.cbx.chkText.trim(); if (!t) return;
  this.mutate(s.cb, c => { c.chk.push({t, on: false}); }, {cbx: Object.assign({}, s.cbx, {chkText: ''})});
}
/* one composer = comment + daily report (status chips + text + files) */
dayAct(c, pid) { const s = this.state; return c.acts.filter(a => a.k === 'cmt' && a.daily && a.by === pid && a.t === s.today).pop() || null; }
upsertDaily(cid, pid, p) {
  const s = this.state, c0 = this.get(cid), prev = this.dayAct(c0, pid);
  this.mutate(cid, c => {
    const d = c.acts.filter(a => a.k === 'cmt' && a.daily && a.by === pid && a.t === s.today).pop();
    if (d) { Object.assign(d, p, {files: (d.files || []).concat(p.files || []), body: p.body != null && p.body !== '' ? (d.body ? d.body + '\n' + p.body : p.body) : d.body, m: s.now}); }
    else { const T = this.tick(); c.acts.push(Object.assign({by: pid, t: T.t, m: T.m, k: 'cmt', text: '', daily: true, st: null, body: '', files: []}, p, {files: p.files || []})); }
  });
  const st = p.st != null ? p.st : prev ? prev.st : null;
  if (p.st === 'stuck' && s.set.dailyStuck && !(prev && prev.st === 'stuck')) this.setState({notifs: this.nt(this.state.notifs, 'mgr', this.sname(pid) + ': گیر کرده‌ام — «' + c0.title + '»' + (p.body ? ' — «' + p.body + '»' : ''), {cid, act: true})});
  return st;
}
pickDaily(cid, st) {
  const s = this.state, me = s.me, c = this.get(cid), cur = this.dayAct(c, me);
  const nst = cur && cur.st === st ? null : st;
  this.upsertDaily(cid, me, {st: nst});
  if (nst === 'stuck' && s.set.dailyStuck) this.toast('ثبت شد و به مدیر خبر داده شد. اگر بخواهید توضیح یا فایل هم اضافه کنید.', {icon: 'i-flag'});
  else if (nst) this.toast('گزارش امروز: ' + this.C.DR[nst][0], {icon: 'i-check', ms: 2500});
}
saveRepNote(cid) {
  const s = this.state, r = s.repNote; if (!r || r.cid !== cid) return;
  if (!r.text.trim() && !r.files.length) { this.setState({repNote: null}); return; }
  this.upsertDaily(cid, s.me, {body: r.text.trim(), files: r.files});
  this.setState({repNote: null});
  this.toast('گزارش امروز ثبت شد و در فعالیت کارت هم آمد.', {icon: 'i-check', ms: 3000});
}
saveCmt() {
  const s = this.state, x = s.cbx, t = x.cmt.trim(), c = this.get(s.cb);
  const by = s.role === 'mgr' ? 'mehdi' : s.me;
  if (!t && !x.cfiles.length && !x.cst) return;
  let notifs = s.notifs;
  if (by !== 'mehdi' && x.cst) {
    this.upsertDaily(c.id, by, {st: x.cst, body: t, files: x.cfiles});
    this.setState({cbx: Object.assign({}, this.state.cbx, {cmt: '', cfiles: [], cst: null})});
    this.toast('گزارش امروز ثبت شد.', {icon: 'i-check', ms: 2500});
    return;
  }
  if (by === 'mehdi') notifs = this.ntMany(notifs, c.whos || [], 'نظر تازه‌ی مدیر روی «' + c.title + '».', {cid: c.id});
  else notifs = this.nt(notifs, 'mgr', this.sname(by) + ' روی «' + c.title + '» نوشت.', {cid: c.id});
  this.mutate(s.cb, y => { this.act(y, by, 'cmt', '', {body: t, files: x.cfiles.slice()}); if (x.cfiles.length) y.att = y.att.concat(x.cfiles); }, {cbx: Object.assign({}, x, {cmt: '', cfiles: [], cst: null}), notifs});
}

/* ================= objections ================= */
openObjection(rid) { this.openDlg('objection', {rid, text: ''}); }
confirmObjection() {
  const s = this.state, m = s.m;
  if (!m.text.trim()) { this.setM({tried: true}); return; }
  const returns = s.returns.map(r => r.id === m.rid ? Object.assign({}, r, {obj: {text: m.text.trim(), status: 'pending', t: s.today, m: s.now, note: ''}}) : r);
  const r = s.returns.find(x => x.id === m.rid);
  this.setState({returns, dlg: null, m: {}, notifs: this.nt(s.notifs, 'mgr', this.sname(r.who) + ' به یک ارجاع اعتراض کرد.', {act: true, page: 'members'})});
  this.toast('اعتراض ثبت شد؛ نتیجه را همین‌جا می‌بینید.', {icon: 'i-flag'});
}
openObjReview(rid) { this.openDlg('objReview', {rid, dec: null, note: ''}); }
confirmObjReview() {
  const s = this.state, m = s.m;
  if (!m.dec) { this.setM({tried: true}); return; }
  const r = s.returns.find(x => x.id === m.rid);
  const returns = s.returns.map(x => x.id === m.rid ? Object.assign({}, x, {obj: Object.assign({}, x.obj, {status: m.dec, note: m.note})}) : x);
  const staff = s.staff.map(p => p.id === r.who && m.dec === 'acc' ? Object.assign({}, p, {metrics: p.metrics.map((v, i) => i === 1 ? Math.min(100, v + 6) : v)}) : p);
  this.setState({returns, staff, dlg: null, m: {}, notifs: this.nt(s.notifs, r.who, m.dec === 'acc' ? 'اعتراض شما پذیرفته شد؛ امتیاز به‌روز شد.' : 'اعتراض شما بررسی شد و پذیرفته نشد.', {page: 'score'})});
  this.toast(m.dec === 'acc' ? 'اعتراض پذیرفته شد و امتیاز ' + this.sname(r.who) + ' به‌روز شد.' : 'اعتراض رد شد.', {icon: 'i-flag'});
}

/* ================= create / settings dialogs ================= */
openCreate(boardId, editId) {
  const s = this.state;
  if (editId) {
    const c = this.get(editId);
    this.openDlg('create', {edit: editId, board: c.board, title: c.title, type: c.type, karat: c.karat, weight: c.weight, name: c.cust ? c.cust.name : '', phone: c.cust ? this.fa(c.cust.phone) : '', ch: c.cust ? c.cust.ch : null, desc: c.desc, refs: []});
  } else this.openDlg('create', {edit: null, board: boardId || s.boards[0].id, title: '', type: null, karat: 18, weight: '', name: '', phone: '', ch: null, desc: '', refs: []});
}
createErrs(m) {
  const e = {};
  if (!m.title.trim()) e.title = 1;
  if (m.board === 'orders') {
    if (!m.name.trim()) e.name = 1;
    if (!/^09\d{9}$/.test(this.en(m.phone).replace(/\D/g, ''))) e.phone = 1;
  }
  return e;
}
crAddRef(src) { const m = this.state.m; const art = (this.C.TYPES[m.type || 'other'] || this.C.TYPES.other)[1]; this.setM({refs: m.refs.concat([Object.assign(this.fakeFile(0, src === 'cust' ? 'cust' : 'mehdi', art), {ref: true, name: src === 'cust' ? 'عکس نمونه‌ی مشتری' : 'عکس نمونه'})])}); }
confirmCreate() {
  const s = this.state, m = s.m, e = this.createErrs(m);
  if (Object.keys(e).length) { this.setM({tried: true}); return; }
  const isOrder = m.board === 'orders';
  const cust = isOrder ? {name: m.name.trim(), phone: this.en(m.phone).replace(/\D/g, ''), ch: m.ch || 'phone'} : null;
  const art = isOrder ? (this.C.TYPES[m.type || 'other'] || this.C.TYPES.other)[1] : 'a-post';
  if (m.edit) {
    this.mutate(m.edit, c => { c.title = m.title.trim(); c.desc = m.desc; c.att = c.att.concat(m.refs); if (isOrder) { c.type = m.type || c.type; c.art = m.type ? art : c.art; c.karat = m.karat; c.weight = m.weight; c.cust = cust; } this.act(c, 'mehdi', 'minor', 'مشخصات کارت را ویرایش کرد'); }, {dlg: null, m: {}});
    this.toast('مشخصات ذخیره شد.', {icon: 'i-check'});
    return;
  }
  const b = this.board(m.board), q = this.queueList(b), id = s.nextId;
  const c = this.blankCard({id, board: b.id, list: q.id, title: m.title.trim(), type: m.type || 'other', art, karat: m.karat, weight: m.weight, cust, desc: m.desc, att: m.refs});
  c.acts.push({by: 'mehdi', t: s.today, m: s.now, k: 'sys', text: 'این کارت را به «' + q.name + '» اضافه کرد'});
  this.setState({cards: s.cards.concat([c]), nextId: id + 1, dlg: null, m: {}});
  if (s.page !== 'board' || s.boardId !== b.id) this.goBoard(b.id);
  this.flashCard(id);
  this.toast(isOrder ? 'سفارش ' + this.code(c) + ' ثبت شد و پیامک ثبت برای مشتری رفت.' : 'کارت در «' + q.name + '» ساخته شد.', {icon: 'i-check-c', action: {label: 'سپردن', fn: () => this.openAssign(id, 'queue')}});
}
buildLists(teamId) {
  const secs = this.state.sections.filter(x => x.team === teamId);
  const out = [{id: this.uid('q'), name: 'ورودی', kind: 'queue', lbl: 'L-n', style: 'art-photo'}];
  secs.forEach((x, i) => { const w = this.C.WL[i % this.C.WL.length]; out.push({id: this.uid('w'), name: x.name, kind: 'work', sec: x.id, lbl: w[0], style: w[1], days: [1, 2, 3]}); });
  out.push({id: this.uid('f'), name: 'انجام شد', kind: 'final', lbl: 'L-g', style: 'art-photo'});
  return out;
}
confirmTeam() {
  const s = this.state, m = s.m;
  if (!m.name.trim()) { this.setM({tried: true}); return; }
  const tid = this.uid('u'), names = m.secs.split(/[،,]/).map(x => x.trim()).filter(Boolean);
  const secs = names.map((n, i) => ({id: this.uid('s'), team: tid, name: n, bg: this.C.BGS[(i + 2) % this.C.BGS.length][0], lists: this.tlDefault()}));
  this.setState({teams: s.teams.concat([{id: tid, name: m.name.trim(), bg: m.color}]), sections: s.sections.concat(secs)});
  let boards = this.state.boards, bid = null;
  if (m.withBoard) {
    bid = this.uid('b');
    const nm = m.name.trim().replace(/^واحد\s*/, '') || m.name.trim();
    boards = boards.concat([{id: bid, name: nm, team: tid, bg: this.C.BGS[(s.boards.length + 2) % this.C.BGS.length][0], prefix: nm.charAt(0) || 'ک', lists: this.buildLists(tid)}]);
  }
  this.setState({boards, dlg: null, m: {}});
  this.toast('«' + m.name.trim() + '» ساخته شد' + (secs.length ? ' با ' + this.fa(secs.length) + ' تیم' : '') + '. حالا عضو اضافه کنید.', {icon: 'i-team', action: bid ? {label: 'دیدن تابلو', fn: () => this.goBoard(bid)} : {label: 'افزودن عضو', fn: () => this.openStaff()}});
}
openSection(teamId) { const t = teamId || this.state.teams[0].id; this.openDlg('section', {team: t, name: '', withList: true}); }
confirmSection() {
  const s = this.state, m = s.m;
  if (!m.name.trim()) { this.setM({tried: true}); return; }
  const id = this.uid('s'), sections = s.sections.concat([{id, team: m.team, name: m.name.trim(), bg: this.C.BGS[(s.sections.length + 3) % this.C.BGS.length][0], lists: this.tlDefault()}]);
  let boards = s.boards;
  if (m.withList) {
    const b = s.boards.find(x => x.team === m.team);
    if (b) {
      const w = this.C.WL[this.workLists(b).length % this.C.WL.length];
      const nl = {id: this.uid('w'), name: m.name.trim(), kind: 'work', sec: id, lbl: w[0], style: w[1], days: [1, 2, 3]};
      boards = s.boards.map(x => { if (x.id !== b.id) return x; const ls = x.lists.slice(); const endI = ls.findIndex(l => l.kind === 'cust' || l.kind === 'final'); ls.splice(endI < 0 ? ls.length : endI, 0, nl); return Object.assign({}, x, {lists: ls}); });
    }
  }
  this.setState({sections, boards, dlg: null, m: {}});
  this.toast('تیم «' + m.name.trim() + '» با تابلوی خودش ساخته شد.', {icon: 'i-check', action: {label: 'افزودن عضو', fn: () => this.openMembers(id)}});
}
openBoard() { const s = this.state; this.openDlg('board', {name: '', team: s.teams[0].id, bg: this.C.BGS[2][0]}); }
confirmBoard() {
  const s = this.state, m = s.m;
  if (!m.name.trim()) { this.setM({tried: true}); return; }
  const id = this.uid('b');
  this.setState({boards: s.boards.concat([{id, name: m.name.trim(), team: m.team, bg: m.bg, prefix: m.name.trim().charAt(0), lists: this.buildLists(m.team)}]), dlg: null, m: {}});
  this.goBoard(id);
  this.toast('تابلوی «' + m.name.trim() + '» ساخته شد. لیست‌ها را همین‌جا اضافه یا نامشان را عوض کنید.', {icon: 'i-board'});
}
openStaff(sec) { this.openDlg('staff', {name: '', phone: '', secs: sec ? [sec] : []}); }
confirmStaff() {
  const s = this.state, m = s.m, ph = this.en(m.phone).replace(/\D/g, '');
  if (!m.name.trim() || !/^09\d{9}$/.test(ph) || !m.secs.length) { this.setM({tried: true}); return; }
  const id = this.uid('p'), parts = m.name.trim().split(/\s+/);
  const init = parts.length > 1 ? parts[0].charAt(0) + '‌' + parts[1].charAt(0) : parts[0].slice(0, 2);
  this.setState({staff: s.staff.concat([{id, name: m.name.trim(), init, bg: this.C.AVC[s.staff.length % this.C.AVC.length], phone: ph, secs: m.secs.slice(), active: true, tasks: 0, metrics: null, isNew: true}]), dlg: null, m: {}});
  this.toast(m.name.trim() + ' اضافه شد و پیامک دعوت برایش رفت.', {icon: 'i-user-plus'});
}
openMembers(secId) { this.openDlg('members', {sec: secId}); }
toggleMember(pid, secId) { this.setState({staff: this.state.staff.map(p => p.id !== pid ? p : Object.assign({}, p, {secs: p.secs.includes(secId) ? p.secs.filter(x => x !== secId) : p.secs.concat([secId])}))}); }

/* ================= voice & annotation ================= */
recDown(e) {
  try { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
  this.setM({rec: true, recMs: 0});
  this.every('rec', () => { const cur = this.state.m; if (!cur.rec) return; this.setM({recMs: cur.recMs + 250}); }, 250);
}
recUp() {
  const cur = this.state.m; if (!cur.rec) return;
  this.stop('rec');
  if (cur.recMs < 700) { this.setM({rec: false, recMs: 0}); this.toast('برای ضبط، دکمه را نگه دارید و صحبت کنید.', {icon: 'i-mic', ms: 3500}); return; }
  this.setM({rec: false, voice: Math.max(1, Math.round(cur.recMs / 1000))});
}
aPoint(e) { const b = e.currentTarget.getBoundingClientRect(); return [Math.max(0, Math.min(100, (e.clientX - b.left) / b.width * 100)), Math.max(0, Math.min(100, (e.clientY - b.top) / b.height * 100))]; }
aDown(e) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {} this.setM({drawing: {tool: this.state.m.tool, pts: [this.aPoint(e)]}}); }
aMove(e) {
  const d = this.state.m.drawing; if (!d) return;
  const p = this.aPoint(e), last = d.pts[d.pts.length - 1];
  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
  this.setM({drawing: {tool: d.tool, pts: d.tool === 'pen' ? d.pts.concat([p]) : [d.pts[0], p]}});
}
aUp() {
  const d = this.state.m.drawing; if (!d) return;
  let pts = d.pts;
  if (pts.length < 2) { const p = pts[0]; pts = d.tool === 'arrow' ? [[p[0] + 12, p[1] - 12], p] : [p, [p[0] + 7, p[1]]]; }
  this.setM({annos: this.state.m.annos.concat([{tool: d.tool, pts}]), drawing: null});
}

/* ================= calendar ================= */
openCal(target, mode, sel, opts) { const t = this.ymd(sel != null ? sel : this.state.today); this.setState({cal: Object.assign({target, mode: mode || 'single', month: t.m, year: t.y, a: null, b: null}, opts || {})}); }
calPick(off) {
  const c = this.state.cal;
  if (c.mode === 'range') {
    if (c.a == null || c.b != null) { this.setState({cal: Object.assign({}, c, {a: off, b: null})}); return; }
    this.applyCal(c.target, [Math.min(c.a, off), Math.max(c.a, off)]); return;
  }
  this.applyCal(c.target, off);
}
applyCal(target, v) {
  if (target === 'due') { this.setDue(this.state.cb, v); return; }
  if (target === 'as' || target === 'rt') { this.setState({cal: null, m: Object.assign({}, this.state.m, {due: v})}); return; }
  if (target === 'ar') { this.setState({cal: null, arRange: 'custom', arCustom: v}); return; }
  if (target === 'rp') { this.setState({cal: null, rpRange: 'custom', rpCustom: v}); return; }
  this.setState({cal: null});
}

/* ================= demo ================= */
dmReminder() {
  const s = this.state; let notifs = s.notifs, n = 0;
  s.staff.forEach(p => {
    const left = this.activeOf(p.id).filter(c => this.repOf(c, p.id).st === 'none');
    if (left.length) { n++; notifs = this.nt(notifs, p.id, 'گزارش امروز: وضعیت ' + this.fa(left.length) + ' کار را با یک ضربه ثبت کنید.', {act: true, page: 'team'}); }
  });
  this.setState({notifs, demo: false, now: 18 * 60});
  this.toast(n ? 'ساعت ۱۸: یادآوری برای ' + this.fa(n) + ' نفر رفت (کسانی که کارِ بی‌وضعیت دارند).' : 'همه‌ی گزارش‌های امروز ثبت شده‌اند.', {icon: 'i-bell'});
}
dmDay() {
  const s = this.state;
  this.setState({today: s.today + 1, now: 9 * 60, demo: false});
  this.toast('یک روز جلو رفتیم: ' + this.dFull(s.today + 1) + '. گزارش‌های روزانه از نو شروع شد و دیرکردها به‌روز شد.', {icon: 'i-forward'});
}
dmReset() { const s = this.state; const fresh = this.seed(); fresh.role = s.role; fresh.me = s.me; fresh.dark = s.dark; Object.assign(fresh, s.role === 'mgr' ? {page: 'board'} : this.homeFor('stf', s.me)); this.componentWillUnmount(); this.setState(fresh); this.toast('داده‌های نمایشی از نو بارگذاری شد.', {icon: 'i-refresh'}); }

/* ================= view-models: cards ================= */
dueVM(c) {
  const s = this.state, L = this.listOf(c);
  if (c.arch || !L || L.kind !== 'work' || c.due == null) return {has: false};
  if (c.paused) return {has: true, cls: 'pause', icon: 'i-pause-c', txt: 'متوقف', title: 'زمان تحویل متوقف شده', tag: 'متوقف', full: 'زمان تحویل متوقف شده'};
  const r = c.due - s.today, active = ['doing','returned'].includes(c.st);
  const cls = c.st === 'wait' ? 'ok' : !active ? '' : r < 0 ? 'late' : r === 0 ? 'soon' : '';
  const tag = c.st === 'wait' ? 'تحویل شد' : !active ? '' : r < 0 ? this.fa(-r) + ' روز دیرکرد' : r === 0 ? 'امروز' : r === 1 ? 'فردا' : '';
  return {has: true, cls, icon: c.st === 'wait' ? 'i-check' : 'i-clock', txt: this.dShort(c.due), title: tag || ('تحویل ' + this.dShort(c.due)), tag, full: this.dFull(c.due) + '، ساعت ' + this.hm((c.dueH || 14) * 60)};
}
lblsOf(c, ctx) {
  const out = [], L = this.listOf(c) || {};
  if (c.urgent && !c.arch) out.push({cls: 'L-r', t: 'فوری'});
  const m = {wait: ['L-b','منتظر بررسی'], returned: ['L-o','اصلاحی'], next: ['L-g','تأیید شد'], ready: ['L-g','تأیید نهایی']}[c.st];
  if (m && !c.arch && !(c.st === 'ready' && L.kind !== 'work')) out.push({cls: m[0], t: m[1]});
  if (ctx === 'team' && !(c.whos || []).length && ['doing','returned'].includes(c.st)) out.push({cls: 'L-p', t: 'بدون صاحب'});
  return out;
}
autoSum(c, pid) {
  const s = this.state;
  const today = c.acts.filter(a => a.t === s.today && a.by === pid);
  const chk = today.filter(a => a.k === 'minor' && a.chk).reduce((n, a) => n + a.chk, 0);
  const ver = today.filter(a => a.k === 'ver');
  const cm = today.filter(a => a.k === 'cmt' && !a.daily && (a.body || (a.files || []).length));
  const parts = [];
  if (chk) parts.push(this.fa(chk) + ' مورد چک‌لیست انجام شد');
  ver.forEach(a => parts.push(a.text.replace(' را برای بررسی فرستاد', ' فرستاده شد')));
  if (cm.length) parts.push(this.fa(cm.length) + ' یادداشت در کارت');
  const lastCmt = cm.length ? cm[cm.length - 1].body : '';
  return {n: chk + ver.length + cm.length, text: parts.length ? parts.join(' · ') : 'امروز فعالیتی ثبت نشده', lastCmt};
}
repOf(c, pid) {
  const s = this.state;
  const active = this.isActiveWork(c) && this.isMine(c, pid);
  if (!active) return {active: false, st: 'none', note: '', files: [], auto: {n: 0, text: ''}};
  const d = this.dayAct(c, pid), auto = this.autoSum(c, pid);
  const st = d && d.st ? d.st : d && (d.body || (d.files || []).length) ? 'note' : (auto.n && s.set.dailyAuto ? 'auto' : 'none');
  return {active, st, note: d && d.body ? d.body : auto.lastCmt || '', files: d ? d.files || [] : [], auto};
}
cardRep(c) {
  const order = ['stuck','behind','none','note','auto','ok'];
  const sts = (c.whos || []).map(p => this.repOf(c, p)).filter(r => r.active).map(r => r.st);
  if (!sts.length) return null;
  if (sts.every(x => x === 'none')) return null;
  return sts.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}
cardVM(c, ctx) {
  const s = this.state, L = this.listOf(c) || {}, d = this.dueVM(c), isMgr = s.role === 'mgr';
  const done = c.chk.filter(x => x.on).length, cm = c.acts.filter(a => a.k === 'cmt').length;
  const rep = this.cardRep(c), whos = (c.whos || []).map(id => this.person(id));
  const lastV = c.vers[c.vers.length - 1], ref = c.att.find(f => f.ref && f.kind === 'img');
  const hasCover = (!!ref && (L.kind === 'queue' || !lastV)) || (!!lastV && (L.kind === 'cust' || L.kind === 'final'));
  const lbls = this.lblsOf(c, ctx), sec = this.secOf(c);
  const tlc = ctx !== 'team' && sec && !c.arch && ['doing','returned'].includes(c.st) ? this.tlOf(c) : null;
  const teamBdg = !!tlc;
  const teamTxt = tlc ? (tlc.role === 'in' ? (whos.length ? 'صف تیم' : 'صف تیم ' + sec.name) : tlc.name) : '';
  const teamCls = 'bdg ' + (tlc ? ({in: 'tb-in', doing: 'tb-doing', done: 'tb-done'}[tlc.role] || 'tb-x') : '');
  const canQe = !c.arch && (ctx === 'team' ? (isMgr || (sec && this.person(s.me).secs.includes(sec.id))) : isMgr);
  return {
    cls: 'card' + (s.drag === c.id ? ' drag' : '') + (s.flash === c.id ? ' flash' : ''),
    dragStart: e => this.dragStart(c.id, ctx || 'pipe', e), open: () => this.openCard(c.id),
    aria: c.title + '، ' + this.code(c) + (whos.length ? '، ' + whos.map(p => p.name).join('، ') : '') + (d.has ? '، ' + d.title : ''),
    hasCover, coverStyle: lastV && L.kind !== 'queue' && !(ref && !lastV) ? lastV.style : 'art-photo', art: ref && (L.kind === 'queue' || !lastV) ? ref.art : c.art,
    hasLbls: lbls.length > 0, lbls, title: c.title, code: this.code(c),
    hasDue: d.has, dueCls: d.cls || '', dueTitle: d.title || '', dueIcon: d.icon || 'i-clock', dueTxt: d.txt || '',
    hasChk: c.chk.length > 0, chkCls: c.chk.length && done === c.chk.length ? 'ok' : '', chkTxt: this.fa(done) + '/' + this.fa(c.chk.length),
    hasCmt: cm > 0, nCmt: this.fa(cm), hasVer: c.vers.length > 0, nVer: this.fa(c.vers.length), hasAtt: c.att.length > 0, nAtt: this.fa(c.att.length),
    hasRep: !!rep, repDot: rep ? this.C.DR[rep][1] : '', repTitle: rep ? 'گزارش امروز: ' + this.C.DR[rep][0] : '',
    hasTeamBdg: teamBdg, teamBdg: teamTxt, teamCls, teamTitle: tlc ? 'ستون «' + tlc.name + '» در تابلوی تیم ' + sec.name : '',
    hasWho: whos.length > 0, avs: whos.slice(0, 3).map(p => ({bg: p.bg, init: p.init, name: p.name})),
    avBg: whos[0] ? whos[0].bg : '', init: whos[0] ? whos[0].init : '', who: whos.map(p => p.name).join('، '),
    hasBdgs: d.has || c.chk.length > 0 || cm > 0 || c.vers.length > 0 || c.att.length > 0 || whos.length > 0 || !!rep || !!teamBdg,
    canQe, qOpen: !!(s.qm && s.qm.cid === c.id), qeCls: 'qe' + (s.qm && s.qm.cid === c.id ? ' on' : ''), qToggle: e => this.qToggle(c.id, e, ctx || 'pipe'),
    listName: L.name || '', listLbl: L.lbl || 'L-n'
  };
}
flagOf(c, f) {
  const s = this.state;
  if (f === 'late') return this.isLate(c);
  if (f === 'soon') { const L = this.listOf(c); return L && L.kind === 'work' && ['doing','returned'].includes(c.st) && c.due != null && c.due - s.today >= 0 && c.due - s.today <= 1; }
  if (f === 'wait') return c.st === 'wait';
  if (f === 'urgent') return c.urgent;
  if (f === 'stuck') { const r = this.cardRep(c); return r === 'stuck' || r === 'behind'; }
  if (f === 'pool') return c.pool && !(c.whos || []).length && ['doing','returned'].includes(c.st);
  return true;
}
/* list header VM shared by pipeline and team boards */
listHead(ctx, L, idx, count, canEdit, menuInfo, canDel) {
  const s = this.state, e = s.lEdit, mo = s.lMenu;
  const editing = !!(e && e.ctx === ctx && e.id === L.id);
  return {
    name: L.name, editing, notEditing: !editing, editText: editing ? e.text : '',
    onEdit: ev => this.setState({lEdit: Object.assign({}, this.state.lEdit, {text: ev.target.value})}),
    editKey: ev => { if (ev.key === 'Enter') { ev.preventDefault(); this.saveRename(); } if (ev.key === 'Escape') this.setState({lEdit: null}); },
    saveEdit: () => this.saveRename(), rename: () => canEdit ? this.startRename(ctx, L.id, L.name) : null, canEdit,
    menuOpen: !!(mo && mo.ctx === ctx && mo.id === L.id), menu: ev => this.listMenu(ctx, L.id, ev),
    canLeft: idx < count - 1, canRight: idx > 0, mvLeft: () => this.moveList(ctx, L.id, 1), mvRight: () => this.moveList(ctx, L.id, -1),
    canDel, del: () => this.deleteList(ctx, L.id), menuInfo, hasInfo: !!menuInfo
  };
}
addListVM(ctx) {
  const s = this.state, a = s.addL && s.addL.ctx === ctx ? s.addL : null;
  const b = ctx === 'pipe' ? this.board(s.boardId) : null;
  const secs = b ? s.sections.filter(x => x.team === b.team) : [];
  return {open: !!a, closed: !a, start: () => this.openAddList(ctx), text: a ? a.text : '', onText: e => this.setState({addL: Object.assign({}, this.state.addL, {text: e.target.value})}),
    key: e => { if (e.key === 'Enter') { e.preventDefault(); this.saveAddList(); } if (e.key === 'Escape') this.setState({addL: null}); },
    save: () => this.saveAddList(), cancel: () => this.setState({addL: null}), isPipe: ctx === 'pipe',
    sec: a ? a.sec : 'new', onSec: e => this.setState({addL: Object.assign({}, this.state.addL, {sec: e.target.value})}),
    secOpts: [{id: 'new', name: 'تیم تازه با همین نام'}].concat(secs.map(x => ({id: x.id, name: 'تیم ' + x.name}))).concat([{id: 'none', name: 'بدون تیم (لیست ساده)'}])};
}
quickVM(ctx, lid) {
  const s = this.state, open = !!(s.quick && s.quick.ctx === ctx && s.quick.list === lid);
  return {quickOpen: open, qRefs: open ? s.quickRefs.map((f, i) => this.fileVM(f, () => this.setState({quickRefs: this.state.quickRefs.filter((_, j) => j !== i)}))) : [], qHasRefs: open && s.quickRefs.length > 0};
}

/* ================= quick menu ================= */
qToggle(id, e, ctx) {
  try { e.stopPropagation(); } catch (x) {}
  if (this.state.qm && this.state.qm.cid === id) { this.setState({qm: null}); return; }
  let x = 200, y = 200;
  try { const r = e.currentTarget.getBoundingClientRect(); const W = window.innerWidth || 1440, H = window.innerHeight || 900; x = Math.max(8, Math.min(r.left - 200, W - 240)); y = Math.min(r.bottom + 4, H - 380); } catch (er) {}
  this.setState({qm: {cid: id, ctx: ctx || 'pipe', x: Math.round(x), y: Math.round(Math.max(60, y))}, hdr: {boards:false, create:false, notif:false, user:false}, filterOpen: false, lMenu: null});
}
vQm() {
  const s = this.state; if (!s.qm) return {qm: {open: false}};
  const c = this.get(s.qm.cid); if (!c) return {qm: {open: false}};
  const b = this.board(c.board), L = this.listOf(c), isMgr = s.role === 'mgr', team = s.qm.ctx === 'team', sec = this.secOf(c);
  const curT = team ? this.tlOf(c) : null;
  return {qm: {open: true, x: s.qm.x, y: s.qm.y, openCard: () => this.openCard(c.id),
    canAssign: isMgr, assign: () => this.assignAction(c.id), assignLabel: L.kind === 'queue' || c.st === 'next' ? 'سپردن' : 'سپردن و اعضا',
    canClaim: !isMgr && team && !this.isMine(c, s.me) && ['doing','returned'].includes(c.st), claim: () => { this.setState({qm: null}); this.claim(c.id); }, claimLabel: (c.whos || []).length ? 'من هم کمک می‌کنم' : 'برمی‌دارم',
    moves: team ? sec.lists.map(l => ({label: l.name, lbl: this.C.TLL[l.role] || 'L-s', cur: curT && curT.id === l.id, go: () => { this.setState({qm: null}); this.moveTeam(c.id, l.id); }}))
      : b.lists.map(l => ({label: l.name, lbl: l.lbl, cur: l.id === c.list, go: () => this.moveTo(c.id, l.id)})),
    isMgr, urgent: () => c.urgent ? this.setUrgent(c.id, null) : this.setState({qm: null, cb: c.id, cbx: this.cbxInit(), cbPop: 'urgent'}),
    urgentLabel: c.urgent ? 'برداشتن فوری' : 'فوری کردن',
    cancel: () => this.setState({qm: null, cb: c.id, cbx: this.cbxInit(), cbPop: 'cancel'})}};
}

/* ================= card back ================= */
vCard() {
  const s = this.state; const c = s.cb != null ? this.get(s.cb) : null;
  if (!c) return {cb: {open: false, fb: {v: {}}}};
  const b = this.board(c.board), L = this.listOf(c) || {}, isMgr = s.role === 'mgr', x = s.cbx;
  const whos = c.whos || [], mine = whos.includes(s.me), sec = this.secOf(c), meP = this.person(s.me);
  const inTeam = !!sec && meP.secs.includes(sec.id);
  const d = this.dueVM(c), lbls = this.lblsOf(c, inTeam ? 'team' : 'pipe');
  const lastV = c.vers[c.vers.length - 1], ref = c.att.find(f => f.ref && f.kind === 'img');
  const close = () => this.closeCard();
  const pop = k => () => this.setState({cbPop: s.cbPop === k ? null : k});
  const arch = !!c.arch, active = ['doing','returned'].includes(c.st) && L.kind === 'work';
  const who = whos.length ? this.names(whos) : sec ? 'کل تیم ' + sec.name : '';
  let call = null;
  const nv = this.nextVer(c);
  if (arch) call = {cls: 'gray', icon: 'i-archive', title: c.arch === 'done' ? 'این کارت تکمیل و بایگانی شده' : 'این کارت لغو شده · ' + (c.cancelWhy || ''), text: this.dFull(c.archAt != null ? c.archAt : s.today), btns: isMgr ? [{cls: '', icon: 'i-undo', label: 'بازگرداندن', go: () => this.restoreCard(c.id)}] : []};
  else if (isMgr) {
    if (L.kind === 'queue') {
      const btns = [{cls: 'btn-p', icon: 'i-user-plus', label: 'سپردن', go: () => this.assignAction(c.id)}];
      if (b.id === 'orders' && !c.cust) btns.push({cls: '', icon: 'i-pen-sm', label: 'تکمیل مشخصات مشتری', go: () => this.openCreate(null, c.id)});
      call = {cls: b.id === 'orders' && !c.cust ? 'yellow' : 'blue', icon: 'i-layers', title: b.id === 'orders' && !c.cust ? 'مشخصات مشتری هنوز ثبت نشده' : 'در صف؛ هنوز به کسی سپرده نشده', text: 'می‌توانید به هر مرحله، به یک یا چند نفر یا به کل یک تیم بسپارید.', btns};
    } else if (L.kind === 'work') {
      if (c.st === 'wait') {
        const btns = [{cls: 'btn-ok', icon: 'i-check', label: 'تأیید', go: () => this.openApprove(c.id)}, {cls: 'btn-dl', icon: 'i-return', label: 'برگشت برای اصلاح', go: () => this.openReturn(c.id)}];
        if (c.vers.length > 1) btns.push({cls: '', icon: 'i-compare', label: 'مقایسه', go: () => this.openDlg('compare', {cid: c.id})});
        const v = this.lastWait(c);
        call = {cls: 'blue', icon: 'i-review', title: 'نسخه‌ی ' + this.fa(v ? v.n : 1) + ' منتظر بررسی شماست', text: (v ? this.sname(v.by) + ' · ' + this.ago(v.t, v.m) + ' پیش' : ''), btns};
      } else if (c.st === 'next') {
        call = {cls: 'green', icon: 'i-check-c', title: 'تأیید شد؛ مرحله‌ی بعد منتظر است', text: '', btns: [{cls: 'btn-p', icon: 'i-user-plus', label: 'سپردن به مرحله‌ی بعد', go: () => this.assignAction(c.id)}]};
      } else if (c.st === 'ready') {
        call = {cls: 'green', icon: 'i-check-c', title: 'نسخه‌ی نهایی تأیید شد', text: 'حالا آن را برای مشتری بفرستید.', btns: [{cls: 'btn-p', icon: 'i-send', label: 'ارسال برای مشتری', go: () => this.openDlg('send', {cid: c.id, via: null})}]};
      } else if (c.st === 'returned') {
        call = {cls: 'yellow', icon: 'i-return', title: 'برای اصلاح برگشت داده شده', text: 'منتظر نسخه‌ی ' + this.fa(nv) + ' از ' + who, btns: [{cls: '', icon: 'i-bell', label: 'یادآوری', go: () => this.remind(c.id)}]};
      } else if (!whos.length) {
        call = {cls: 'purple', icon: 'i-team', title: 'در صف تیم ' + sec.name + '؛ هنوز کسی برنداشته', text: 'اعضای تیم خودشان کار را برمی‌دارند. اگر عجله دارید، مستقیم بسپارید.', btns: [{cls: '', icon: 'i-user-plus', label: 'سپردن به فرد', go: () => this.assignAction(c.id)}, {cls: '', icon: 'i-bell', label: 'یادآوری به تیم', go: () => this.remind(c.id)}]};
      } else {
        call = {cls: 'gray', icon: 'i-clock', title: 'در دست ' + who, text: 'منتظر نسخه‌ی ' + this.fa(nv) + (d.has ? ' · ' + d.title : ''), btns: [{cls: '', icon: 'i-bell', label: 'یادآوری', go: () => this.remind(c.id)}]};
      }
    } else if (L.kind === 'cust') {
      call = {cls: 'purple', icon: 'i-clock', title: 'در انتظار پاسخ مشتری', text: c.sent ? 'با ' + this.C.SEND[c.sent.via][0] + ' · ' + this.ago(c.sent.t, c.sent.m) + ' پیش فرستاده شد' : '', btns: [{cls: 'btn-ok', icon: 'i-check', label: 'مشتری تأیید کرد', go: () => this.openDlg('cust', {cid: c.id, date: s.today, note: ''})}, {cls: '', icon: 'i-return', label: 'مشتری تغییر خواست', go: () => this.custChange(c.id)}]};
    } else if (L.kind === 'final') {
      call = {cls: 'green', icon: 'i-check-c', title: 'آماده است', text: '', btns: [{cls: 'btn-ok', icon: 'i-check', label: 'انجام شد', go: () => this.publish(c.id)}]};
    }
  } else {
    if (!mine && inTeam && active) call = {cls: 'purple', icon: 'i-team', title: whos.length ? 'این کار با ' + who + ' است' : 'این کار به کل تیم ' + sec.name + ' سپرده شده', text: whos.length ? 'اگر قرار است کمک کنید، به کارت بپیوندید.' : 'هر کس برمی‌دارد، بزند؛ کارت به «' + this.tlRole(sec.id, 'doing').name + '» می‌رود.', btns: [{cls: 'btn-p', icon: 'i-user-plus', label: whos.length ? 'من هم کمک می‌کنم' : 'برمی‌دارم', go: () => this.claim(c.id)}]};
    else if (!mine) call = {cls: 'gray', icon: 'i-eye', title: 'این کارت به شما سپرده نشده', text: 'فقط برای دیدن باز است.', btns: []};
    else if (c.st === 'wait') call = {cls: 'blue', icon: 'i-send', title: 'نسخه‌ی ' + this.fa((this.lastWait(c) || {}).n || 1) + ' برای مدیر فرستاده شد', text: 'نتیجه‌ی بررسی با اعلان و پیامک خبر داده می‌شود.', btns: []};
    else if (!active) call = {cls: 'gray', icon: 'i-check-c', title: 'کار شما روی این کارت تمام شده', text: '', btns: []};
  }
  const fb = c.fb.filter(f => f.list === c.list).pop();
  const showFb = !!fb && !arch && (c.st === 'returned' || c.st === 'doing' || c.st === 'wait') && (isMgr || mine || inTeam);
  const fbVM = showFb ? {reason: this.C.RS[fb.reason], hasVoice: fb.voice > 0, v: this.voice('fb' + c.id + fb.n + fb.t, fb.voice || 1), hasText: !!fb.text, text: fb.text, hasAnno: fb.anno && fb.anno.length > 0, style: L.style || 'art-sketch', path: this.pathFor(fb.anno), n: this.fa(fb.n), when: this.sname(fb.by) + ' · ' + this.when(fb.t, fb.m),
    hasFiles: (fb.files || []).length > 0, files: (fb.files || []).map(f => this.fileVM(f)),
    openAnno: () => this.openDlg('light', {art: c.art, style: L.style, path: this.pathFor(fb.anno), note: fb.text, title: 'نسخه‌ی ' + this.fa(fb.n) + ' با علامت‌های مدیر'})} : {v: {}, files: []};
  const myRep = this.repOf(c, s.me);
  const isAssignee = !isMgr && mine && myRep.active;
  const done = c.chk.filter(k => k.on).length, pct = c.chk.length ? Math.round(done / c.chk.length * 100) : 0;
  const canChk = !arch && (isMgr || mine);
  const acts = c.acts.slice().reverse().filter(a => x.details || a.k !== 'minor').map(a => {
    const pp = this.person(a.by);
    const isC = a.k === 'cmt';
    return {bg: pp.bg, init: pp.init, who: pp.name,
      text: isC ? (a.daily ? 'گزارش امروز' : a.body || (a.files || []).length ? '' : (a.voice ? 'پیام صوتی گذاشت' : '')) : a.text,
      hasSt: isC && !!a.st, stPill: a.st ? this.C.DR[a.st][2] : '', stTxt: a.st ? this.C.DR[a.st][0] : '',
      isCmt: (isC || a.k === 'ver') && !!a.body, body: a.body || '',
      hasFiles: (a.files || []).length > 0, files: (a.files || []).map(f => this.fileVM(f)),
      hasVoice: !!a.voice, v: this.voice('a' + c.id + a.t + a.m, a.voice || 1), when: this.when(a.t, a.m)};
  });
  const t0 = s.today;
  const others = s.boards.filter(o => o.id !== c.board);
  const tl = this.tlOf(c);
  const reps = whos.map(pid => { const r = this.repOf(c, pid), p = this.person(pid); return r.active ? {bg: p.bg, init: p.init, name: p.name, pill: this.C.DR[r.st][2], st: this.C.DR[r.st][0], line: r.note ? '«' + r.note + '»' : r.auto.text, hasFiles: r.files.length > 0, files: r.files.map(f => this.fileVM(f))} : null; }).filter(Boolean);
  const canAtt = !arch && (isMgr || mine);
  return {cb: {
    open: true, close, bg: e => { if (e.target === e.currentTarget) close(); }, esc: e => { if (e.key === 'Escape') { if (s.cbPop) this.setState({cbPop: null}); else close(); } },
    bodyClick: e => { if (!s.cbPop) return; try { if (e.target.closest && e.target.closest('.pop,.btn.sbtn')) return; } catch (er) {} this.setState({cbPop: null}); },
    hasCover: !!lastV || !!ref, coverStyle: lastV ? lastV.style : 'art-photo', art: lastV || !ref ? c.art : ref.art,
    title: c.title, tEdit: x.tEdit && isMgr, tView: !(x.tEdit && isMgr), tText: x.tText, canTitle: isMgr && !arch,
    editTitle: () => isMgr && !arch ? this.setX({tEdit: true, tText: c.title}) : null, onTText: e => this.setX({tText: e.target.value}),
    tKey: e => { if (e.key === 'Enter') { e.preventDefault(); this.saveTitle(c.id); } if (e.key === 'Escape') this.setX({tEdit: false}); }, saveTitle: () => this.saveTitle(c.id),
    code: this.code(c), listName: arch ? (c.arch === 'done' ? 'تکمیل‌شده' : 'لغوشده') : L.name, listLbl: arch ? 'L-n' : L.lbl, boardName: b.name,
    hasTl: !!tl && !arch, tlName: tl ? tl.name : '', tlTeam: sec ? 'تابلوی تیم ' + sec.name : '', goTeam: () => { if (sec) { this.closeCard(); this.goTeam(sec.id); } },
    showWho: whos.length > 0 || L.kind === 'queue' || L.kind === 'work', hasWho: whos.length > 0, noWho: !whos.length && !(c.pool && sec), isPool: !whos.length && !!c.pool && !!sec, poolTxt: sec ? 'کل تیم ' + sec.name : '',
    whos: whos.map(id => { const p = this.person(id); return {bg: p.bg, init: p.init, name: p.name}; }), who,
    canAddWho: isMgr && !arch && L.kind !== 'cust' && L.kind !== 'final', addWho: () => this.assignAction(c.id),
    hasLbls: lbls.length > 0, lbls,
    hasDue: d.has, dueFull: d.full || '', hasDueTag: !!d.tag, dueTag: d.tag || '', dueShort: d.tag || d.txt || '', dueCls: d.cls || '',
    hasSpec: b.id === 'orders', spec: (this.C.TYPES[c.type] || this.C.TYPES.other)[0] + ' · ' + this.fa(c.karat) + ' عیار' + (c.weight ? ' · حدود ' + this.fa(c.weight) + ' گرم' : ''),
    hasLink: !!c.link && !!this.get(c.link), linkTxt: c.link && this.get(c.link) ? this.code(this.get(c.link)) + ' · ' + this.get(c.link).title : '', openLink: () => this.openCard(c.link),
    hasCall: !!call, callCls: call ? call.cls : '', callIcon: call ? call.icon : 'i-card', callTitle: call ? call.title : '', hasCallText: !!(call && call.text), callText: call ? call.text : '', hasCallBtns: !!(call && call.btns.length), callBtns: call ? call.btns : [],
    canUpload: !isMgr && mine && !arch && active, upTitle: 'ارسال نسخه‌ی ' + this.fa(nv), upFocus: !!x.upFocus, upCls: 'sec' + (x.upFocus ? ' focus' : ''),
    ups: x.ups.map((u, i) => ({art: u.art, style: u.style, del: () => this.setX({ups: x.ups.filter((_, j) => j !== i)})})), hasUps: x.ups.length > 0, addUp: () => this.addUp(),
    upNote: x.upNote, onUpNote: e => this.setX({upNote: e.target.value}), upErr: x.upErr, submit: () => this.submitVersion(), submitLabel: 'ارسال برای بررسی',
    hasDailyView: isMgr && reps.length > 0, reps,
    hasFb: showFb, fb: fbVM,
    desc: c.desc || 'توضیحی ثبت نشده.', hasCust: isMgr && !!c.cust, hidCust: !isMgr && !!c.cust,
    custName: c.cust ? c.cust.name : '', custPhone: c.cust ? this.fa(c.cust.phone.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3')) : '', chIcon: c.cust ? this.C.CH[c.cust.ch][1] : 'i-phone', chName: c.cust ? this.C.CH[c.cust.ch][0] : '',
    hasAtt: c.att.length > 0 || canAtt, atts: c.att.map(f => this.fileVM(f, isMgr || f.by === s.me ? () => this.delAttach(c.id, f.id) : null)), noAtt: !c.att.length, canAtt,
    addAtt: () => this.addAttach(c.id, false), addRef: () => this.addAttach(c.id, true),
    hasVers: c.vers.length > 0, canCompare: c.vers.length > 1, compare: () => this.openDlg('compare', {cid: c.id}),
    vers: c.vers.slice().reverse().map(v => {
      const ll = this.listBy(c.board, v.list) || {name: ''};
      const stx = {wait: ['منتظر بررسی','P-b'], ok: ['تأیید','P-gs'], ret: ['برگشتی','P-rs']}[v.status];
      const f = c.fb.find(q => q.list === v.list && q.n === v.n);
      return {style: v.style, art: c.art, label: ll.name + ' ' + this.fa(v.n), status: stx[0], pill: stx[1], when: this.sname(v.by).split(' ')[0] + ' · ' + this.when(v.t), aria: 'نسخه‌ی ' + this.fa(v.n) + ' ' + ll.name,
        open: () => this.openDlg('light', {art: c.art, style: v.style, path: f ? this.pathFor(f.anno) : '', note: v.note || '', title: ll.name + ' · نسخه‌ی ' + this.fa(v.n)})};
    }),
    showChk: c.chk.length > 0 || canChk, hasChk: c.chk.length > 0, chkPct: this.fa(pct) + '٪', chkPctN: pct, progCls: 'prog' + (pct === 100 ? ' done' : ''),
    chk: c.chk.map((k, i) => ({cls: 'chk' + (k.on ? ' on' : ''), on: k.on, t: k.t, dis: !canChk, toggle: () => this.toggleChk(c.id, i)})),
    chkAdding: x.chkAdding, chkCanAdd: canChk && !x.chkAdding, chkOpen: () => this.setX({chkAdding: true}), chkCancel: () => this.setX({chkAdding: false, chkText: ''}),
    chkText: x.chkText, onChkText: e => this.setX({chkText: e.target.value}), chkKey: e => { if (e.key === 'Enter') { e.preventDefault(); this.addChk(); } }, chkAdd: () => this.addChk(),
    toggleDetails: () => this.setX({details: !x.details}), detailsLabel: x.details ? 'پنهان کردن جزئیات' : 'نمایش جزئیات',
    isAssignee, myStTxt: myRep.st !== 'none' ? 'گزارش امروز: ' + this.C.DR[myRep.st][0] : 'امروز هنوز گزارشی نداده‌اید', myStPill: this.C.DR[myRep.st][2],
    cChips: ['ok','behind','stuck'].map(k => ({cls: 'drb' + (x.cst === k ? ' on' : ''), on: x.cst === k, dot: this.C.DR[k][1], label: this.C.DR[k][0], pick: () => this.setX({cst: x.cst === k ? null : k})})),
    cmtPh: isAssignee ? 'امروز چه کردید یا کجا گیر کرده‌اید؟ همین، گزارش امروز هم هست' : 'نوشتن نظر…',
    cmtText: x.cmt, onCmt: e => this.setX({cmt: e.target.value}), cmtTyping: !!(x.cmt.trim() || x.cfiles.length || x.cst), saveCmt: () => this.saveCmt(),
    cfiles: x.cfiles.map((f, i) => this.fileVM(f, () => this.setX({cfiles: x.cfiles.filter((_, j) => j !== i)}))), hasCFiles: x.cfiles.length > 0,
    addCFile: () => this.setX({cfiles: x.cfiles.concat([this.fakeFile(x.cfiles.length, isMgr ? 'mehdi' : s.me, c.art)])}),
    sendLabel: x.cst ? 'ثبت گزارش' : 'ارسال',
    acts,
    isMgr: isMgr, isStf: !isMgr, isArch: arch, notArch: !arch,
    popClose: () => this.setState({cbPop: null}),
    assign: () => this.assignAction(c.id), noAssign: arch || L.kind === 'cust' || L.kind === 'final',
    popDates: pop('dates'), noDates: arch || L.kind !== 'work', pDates: s.cbPop === 'dates',
    dueOpts: [0, 1, 2, 3, 5].map(n => ({cls: 'opt' + (c.due === t0 + n ? ' on' : ''), label: n === 0 ? 'امروز' : n === 1 ? 'فردا' : this.fa(n) + ' روز دیگر', pick: () => this.setDue(c.id, t0 + n)})),
    dueHours: this.C.HOURS.map(h => ({cls: 'opt' + (c.dueH === h ? ' on' : ''), label: this.hm(h * 60), pick: () => this.setDueH(c.id, h)})),
    dueCal: () => { this.setState({cbPop: null}); this.openCal('due', 'single', c.due, {past: false}); }, duePause: () => this.togglePause(c.id), pauseLabel: c.paused ? 'راه انداختن دوباره‌ی زمان' : 'توقف زمان (منتظر مشتری)',
    popUrgent: () => c.urgent ? this.setUrgent(c.id, null) : pop('urgent')(), urgentLabel: c.urgent ? 'برداشتن فوری' : 'فوری', pUrgent: s.cbPop === 'urgent',
    ugQuick: this.C.URG.map(q => ({cls: 'opt' + (x.ugQ === q ? ' on' : ''), label: q, pick: () => this.setX({ugQ: q})})), ugGo: () => this.setUrgent(c.id, x.ugQ),
    popMove: pop('move'), pMove: s.cbPop === 'move',
    mvLists: b.lists.map(l => ({cls: 'pick' + (l.id === c.list ? ' on' : ''), cur: l.id === c.list, lbl: l.lbl, name: l.name, pick: () => this.moveTo(c.id, l.id)})),
    popTeam: () => { this.setX({xBoard: others[0] ? others[0].id : null, xTitle: (others[0] && others[0].id === 'content' ? 'عکاسی و پست: ' : '') + c.title}); pop('team')(); }, noTeam: arch || !others.length, pTeam: s.cbPop === 'team',
    xBoards: others.map(o => ({cls: 'pick' + (x.xBoard === o.id ? ' on' : ''), bg: o.bg, name: o.name + ' · ' + this.teamOfBoard(o).name, pick: () => this.setX({xBoard: o.id})})),
    xTitle: x.xTitle, onXTitle: e => this.setX({xTitle: e.target.value}), xGo: () => this.sendToTeam(c.id),
    edit: () => this.openCreate(null, c.id), restore: () => this.restoreCard(c.id),
    popCancel: pop('cancel'), pCancel: s.cbPop === 'cancel',
    cnQuick: this.C.CANCEL.map(q => ({cls: 'opt' + (x.cnQ === q ? ' on' : ''), label: q, pick: () => this.setX({cnQ: q, cnErr: false})})), cnErr: x.cnErr, cnGo: () => x.cnQ ? this.cancelCard(c.id, x.cnQ) : this.setX({cnErr: true}),
    canClaim: !isMgr && inTeam && !mine && active, claim: () => this.claim(c.id), claimLabel: whos.length ? 'من هم کمک می‌کنم' : 'برمی‌دارم',
    stuck: () => this.setX({cst: 'stuck'}), noStuck: !isAssignee, noChk: !canChk
  }};
}

/* ================= dialogs ================= */
vRec() {
  const m = this.state.m;
  return {cls: 'rec-b' + (m.rec ? ' on' : ''), down: e => this.recDown(e), up: () => this.recUp(), isRec: !!m.rec, has: !m.rec && m.voice > 0,
    label: m.rec ? 'در حال ضبط… ' + this.fa((m.recMs / 1000).toFixed(1)) + ' ثانیه' : m.voice ? 'پیام صوتی ' + this.fa(m.voice) + ' ثانیه‌ای آماده است' : 'برای پیام صوتی، دکمه را نگه دارید',
    del: () => this.setM({voice: 0})};
}
dueChips(cur, set) { const t = this.state.today; return [0, 1, 2, 3, 5].map(n => ({cls: 'opt' + (cur === t + n ? ' on' : ''), label: n === 0 ? 'امروز' : n === 1 ? 'فردا' : this.fa(n) + ' روز', pick: () => set(t + n)})); }
vDlg() {
  const s = this.state, m = s.m, k = s.dlg;
  const empty = {ap: {}, as: {}, rt: {}, sd: {}, co: {}, cr: {}, tm: {}, scn: {}, ls: {}, bn: {}, sf: {}, mbs: {}, ob: {}, orv: {}, cmp: {}, lb: {}, rec: {}};
  if (!k) return Object.assign({dlg: {open: false}}, empty);
  const close = () => this.closeDlg();
  const D = {open: true, close, bg: e => { if (e.target === e.currentTarget) close(); }, esc: e => { if (e.key === 'Escape') close(); },
    cls: 'dlg', title: '', hasSub: false, sub: '', hasFoot: true, okCls: 'btn-p', okLabel: 'ذخیره', ok: close, hasErr: false, err: ''};
  ['isApprove','isAssign','isReturn','isSend','isCust','isCreate','isTeam','isSection','isList','isBoard','isStaff','isMembers','isObj','isObjRev','isCompare','isLight'].forEach(f => D[f] = false);
  const out = Object.assign({}, empty, {rec: this.vRec()});
  const c = m.cid != null ? this.get(m.cid) : null;
  if (k === 'approve') {
    const v = this.lastWait(c);
    Object.assign(D, {isApprove: true, title: 'تأیید «' + c.title + '»', hasSub: true, sub: (this.listOf(c) || {}).name + ' · نسخه‌ی ' + this.fa(v ? v.n : 1) + ' · ' + this.names(c.whos || []), okCls: 'btn-ok', okLabel: 'تأیید', ok: () => this.confirmApprove(), hasErr: m.tried && !m.grade, err: 'یک گزینه را انتخاب کنید.'});
    out.ap = {grades: this.C.GR.map(g => ({cls: 'pick' + (m.grade === g[0] ? ' on' : ''), label: g[1], hint: g[2], pick: () => this.setM({grade: g[0], tried: false})}))};
  }
  if (k === 'assign') {
    const b = this.board(c.board), L = this.listBy(b.id, m.list), sec = this.sec(L.sec) || {name: '', id: ''};
    const titles = {queue: 'سپردن «' + c.title + '»', approve: 'مرحله‌ی بعد · ' + c.title, move: 'انتقال و سپردن', reassign: 'سپردن و اعضای کارت', restore: 'بازگرداندن و سپردن', custChange: 'مشتری تغییر خواست'};
    const people = this.staffFor(sec.id);
    const iFrom = b.lists.findIndex(l => l.id === c.list), iTo = b.lists.findIndex(l => l.id === m.list);
    const skipped = iTo > iFrom ? b.lists.slice(iFrom + 1, iTo).filter(l => l.kind === 'work') : [];
    const sel = m.pool ? 'کل تیم ' + sec.name : m.whos.length ? this.names(m.whos) : '';
    Object.assign(D, {isAssign: true, cls: 'dlg md', title: titles[m.from] || 'سپردن', hasSub: m.from === 'custChange', sub: m.from === 'custChange' ? 'از امتیاز کسی کم نمی‌شود.' : '',
      okLabel: sel ? 'سپردن به ' + sel : 'سپردن', ok: () => this.confirmAssign(), hasErr: m.tried && !m.pool && !m.whos.length, err: 'یک یا چند نفر، یا کل تیم را انتخاب کنید.'});
    out.as = {
      stages: this.workLists(b).map(l => { const ls = this.sec(l.sec) || {name: ''}; const on = l.id === m.list; const isCur = l.id === c.list && c.st !== 'unassigned'; const passed = c.vers.some(v => v.list === l.id && v.status === 'ok');
        return {cls: 'stg' + (on ? ' on' : ''), on, name: l.name, sub: (isCur ? 'فعلی · ' : passed ? 'انجام شده · ' : '') + 'تیم ' + ls.name, icon: passed ? 'i-check-c' : on ? 'i-circle' : 'i-circle', pick: () => this.asPickStage(l.id)}; }),
      hasSkip: skipped.length > 0, skipTxt: skipped.map(l => '«' + l.name + '»').join(' و ') + ' برای این کارت رد می‌شود.',
      teamName: sec.name, poolCls: 'chk pool' + (m.pool ? ' on' : ''), pool: !!m.pool, togglePool: () => this.asTogglePool(),
      poolSub: this.fa(people.length) + ' نفر · کار به صف تابلوی تیم می‌رود و خودشان تقسیم می‌کنند',
      noStaff: !people.length,
      staff: people.map(p => { const kk = this.ktOf(p.id); const on = m.whos.includes(p.id); return {cls: 'chk' + (on ? ' on' : ''), on, toggle: () => this.asTogglePerson(p.id), bg: p.bg, init: p.init, name: p.name, load: this.fa(this.activeOf(p.id).length) + ' کار فعال' + ((c.whos || []).includes(p.id) && c.list === m.list ? ' · عضو فعلی' : ''), hasKt: kk.k != null && kk.k > 0, ktCls: kk.cls, kt: kk.kt}; }),
      dues: this.dueChips(m.due, v => this.setM({due: v})), cal: () => this.openCal('as', 'single', m.due, {past: false}), calTxt: [0, 1, 2, 3, 5].includes(m.due - s.today) ? 'تقویم' : this.dShort(m.due),
      hours: this.C.HOURS.map(h => ({cls: 'opt' + (m.dueH === h ? ' on' : ''), label: this.hm(h * 60), pick: () => this.setM({dueH: h})})),
      dueTxt: this.dFull(m.due) + '، ساعت ' + this.hm(m.dueH * 60),
      note: m.note, onNote: e => this.setM({note: e.target.value}),
      files: m.files.map((f, i) => this.fileVM(f, () => this.setM({files: this.state.m.files.filter((_, j) => j !== i)}))), hasFiles: m.files.length > 0, addFile: () => this.asAddFile()};
  }
  if (k === 'return') {
    const L = this.listOf(c);
    Object.assign(D, {isReturn: true, cls: 'dlg md', title: 'برگشت برای اصلاح', hasSub: true, sub: c.title + ' · ' + L.name + ' · ' + this.names(c.whos || []), okCls: 'btn-d', okLabel: 'برگرداندن برای اصلاح', ok: () => this.confirmReturn(), hasErr: m.tried && !m.reason, err: 'دلیل برگشت را انتخاب کنید.'});
    const hints = {defect: 'روی امتیاز «تأیید در اولین بررسی» اثر دارد و قابل اعتراض است.', taste: 'از امتیاز کسی کم نمی‌شود.', mgr: 'از امتیاز کسی کم نمی‌شود.', info: 'از امتیاز کسی کم نمی‌شود.'};
    out.rt = {reasons: Object.keys(this.C.RS).map(r => ({cls: 'opt' + (m.reason === r ? ' on' : ''), label: this.C.RS[r], pick: () => this.setM({reason: r, tried: false})})), reasonHint: m.reason ? hints[m.reason] : 'فقط «نقص در کار» از امتیاز کم می‌کند.',
      n: this.fa(m.n), tools: [['circle','دایره'],['arrow','فلش'],['pen','قلم']].map(t => ({cls: m.tool === t[0] ? 'on' : '', label: t[1], pick: () => this.setM({tool: t[0]})})),
      aDown: e => this.aDown(e), aMove: e => this.aMove(e), aUp: () => this.aUp(), style: L.style || 'art-sketch', art: c.art,
      path: this.pathFor(m.annos.concat(m.drawing ? [m.drawing] : [])), hasAnno: m.annos.length > 0, undoAnno: () => this.setM({annos: m.annos.slice(0, -1)}),
      text: m.text, onText: e => this.setM({text: e.target.value}),
      files: m.files.map((f, i) => this.fileVM(f, () => this.setM({files: this.state.m.files.filter((_, j) => j !== i)}))), hasFiles: m.files.length > 0, addFile: () => this.setM({files: m.files.concat([this.fakeFile(m.files.length, 'mehdi', c.art)])}),
      dues: this.dueChips(m.due, v => this.setM({due: v})), cal: () => this.openCal('rt', 'single', m.due, {past: false}), calTxt: [0, 1, 2, 3, 5].includes(m.due - s.today) ? 'تقویم' : this.dShort(m.due)};
  }
  if (k === 'send') {
    Object.assign(D, {isSend: true, title: 'ارسال برای مشتری', okLabel: 'ثبت ارسال', ok: () => this.confirmSend(), hasErr: m.tried && !m.via, err: 'راه ارسال را انتخاب کنید.'});
    out.sd = {art: c.art, title: c.title, cust: c.cust ? c.cust.name + ' · ' + this.fa(c.cust.phone) : 'مشتری ثبت نشده', chs: Object.keys(this.C.SEND).map(v => ({cls: 'opt' + (m.via === v ? ' on' : ''), icon: this.C.SEND[v][1], label: this.C.SEND[v][0], pick: () => this.setM({via: v, tried: false})}))};
  }
  if (k === 'cust') {
    Object.assign(D, {isCust: true, title: 'تأیید مشتری', hasSub: true, sub: c.title, okCls: 'btn-ok', okLabel: 'ثبت و بایگانی', ok: () => this.confirmCust()});
    out.co = {dates: [0, -1, -2].map(n => ({cls: 'opt' + (m.date === s.today + n ? ' on' : ''), label: n === 0 ? 'امروز' : n === -1 ? 'دیروز' : this.dShort(s.today + n), pick: () => this.setM({date: s.today + n})})), note: m.note, onNote: e => this.setM({note: e.target.value})};
  }
  if (k === 'create') {
    const e = m.tried ? this.createErrs(m) : {}, isOrder = m.board === 'orders';
    Object.assign(D, {isCreate: true, cls: 'dlg md', title: m.edit ? 'ویرایش مشخصات' : 'کارت تازه', okLabel: m.edit ? 'ذخیره' : (isOrder ? 'ثبت سفارش' : 'ساخت کارت'), ok: () => this.confirmCreate(), hasErr: Object.keys(e).length > 0, err: 'موارد قرمز را کامل کنید.'});
    out.cr = {showKinds: !m.edit, kinds: s.boards.map(b => ({cls: m.board === b.id ? 'on' : '', label: b.id === 'orders' ? 'سفارش ساخت' : b.name, pick: () => this.setM({board: b.id, tried: false})})),
      isOrder, title: m.title, onTitle: ev => this.setM({title: ev.target.value}), titleErr: e.title ? 'err' : '', titlePh: isOrder ? 'مثلاً انگشتر سولیتر با نگین زمرد' : 'مثلاً ریلز معرفی کالکشن',
      types: Object.keys(this.C.TYPES).map(t => ({cls: 'opt' + (m.type === t ? ' on' : ''), art: this.C.TYPES[t][1], label: this.C.TYPES[t][0], pick: () => this.setM({type: t})})),
      karats: [18, 21, 24].map(n => ({cls: m.karat === n ? 'on' : '', label: this.fa(n), pick: () => this.setM({karat: n})})),
      weight: m.weight, onWeight: ev => this.setM({weight: ev.target.value}),
      name: m.name, onName: ev => this.setM({name: ev.target.value}), nameErr: e.name ? 'err' : '',
      phone: m.phone, onPhone: ev => this.setM({phone: ev.target.value}), phoneErr: e.phone ? 'err' : '',
      chs: Object.keys(this.C.CH).map(v => ({cls: 'opt' + (m.ch === v ? ' on' : ''), icon: this.C.CH[v][1], label: this.C.CH[v][0], pick: () => this.setM({ch: v})})),
      refs: m.refs.map((f, i) => this.fileVM(f, () => this.setM({refs: this.state.m.refs.filter((_, j) => j !== i)}))), hasRefs: m.refs.length > 0,
      addRefCust: () => this.crAddRef('cust'), addRefUs: () => this.crAddRef('us'),
      desc: m.desc, onDesc: ev => this.setM({desc: ev.target.value})};
  }
  if (k === 'team') {
    Object.assign(D, {isTeam: true, title: 'واحد تازه', hasSub: true, sub: 'هر واحد تیم‌ها، اعضا و تابلوی خودش را دارد و در همین چرخه‌ی کار قرار می‌گیرد.', okLabel: 'ساخت واحد', ok: () => this.confirmTeam(), hasErr: m.tried && !m.name.trim(), err: 'نام واحد را بنویسید.'});
    const names = m.secs.split(/[،,]/).map(x => x.trim()).filter(Boolean);
    out.tm = {name: m.name, onName: e => this.setM({name: e.target.value}), nameErr: m.tried && !m.name.trim() ? 'err' : '',
      colors: this.C.TEAMC.map(cc => ({cls: 'swc' + (m.color === cc[0] ? ' on' : ''), on: m.color === cc[0], bg: cc[0], label: cc[1], pick: () => this.setM({color: cc[0]})})),
      secs: m.secs, onSecs: e => this.setM({secs: e.target.value}), withBoard: m.withBoard, boardSw: 'sw' + (m.withBoard ? ' on' : ''), toggleBoard: () => this.setM({withBoard: !m.withBoard}),
      preview: [{lbl: 'L-n', name: 'ورودی'}].concat(names.map((n, i) => ({lbl: this.C.WL[i % this.C.WL.length][0], name: n}))).concat([{lbl: 'L-g', name: 'انجام شد'}])};
  }
  if (k === 'section') {
    const b = s.boards.find(x => x.team === m.team);
    Object.assign(D, {isSection: true, title: 'تیم تازه', okLabel: 'افزودن تیم', ok: () => this.confirmSection(), hasErr: m.tried && !m.name.trim(), err: 'نام تیم را بنویسید.'});
    out.scn = {team: m.team, onTeam: e => this.setM({team: e.target.value}), teams: s.teams.map(t => ({id: t.id, name: t.name})), name: m.name, onName: e => this.setM({name: e.target.value}), nameErr: m.tried && !m.name.trim() ? 'err' : '',
      withList: !!b && m.withList, listSw: 'sw' + (b && m.withList ? ' on' : ''), toggleList: () => this.setM({withList: !m.withList}), boardName: b ? b.name : 'تابلوی واحد'};
  }
  if (k === 'board') {
    Object.assign(D, {isBoard: true, title: 'تابلوی تازه', okLabel: 'ساخت تابلو', ok: () => this.confirmBoard(), hasErr: m.tried && !m.name.trim(), err: 'نام تابلو را بنویسید.'});
    const secs = s.sections.filter(x => x.team === m.team);
    out.bn = {name: m.name, onName: e => this.setM({name: e.target.value}), nameErr: m.tried && !m.name.trim() ? 'err' : '', team: m.team, onTeam: e => this.setM({team: e.target.value}), teams: s.teams.map(t => ({id: t.id, name: t.name})),
      bgs: this.C.BGS.map(cc => ({cls: 'swc' + (m.bg === cc[0] ? ' on' : ''), on: m.bg === cc[0], bg: cc[0], label: cc[1], pick: () => this.setM({bg: cc[0]})})),
      preview: [{lbl: 'L-n', name: 'ورودی'}].concat(secs.map((x, i) => ({lbl: this.C.WL[i % this.C.WL.length][0], name: x.name}))).concat([{lbl: 'L-g', name: 'انجام شد'}])};
  }
  if (k === 'staff') {
    const ph = this.en(m.phone).replace(/\D/g, '');
    const eN = m.tried && !m.name.trim(), eP = m.tried && !/^09\d{9}$/.test(ph), eS = m.tried && !m.secs.length;
    Object.assign(D, {isStaff: true, cls: 'dlg md', title: 'افزودن عضو', okLabel: 'افزودن و ارسال دعوت', ok: () => this.confirmStaff(), hasErr: eN || eP || eS, err: eP && !eN ? 'موبایل ۱۱ رقمی است و با ۰۹ شروع می‌شود.' : eS && !eN ? 'دست‌کم یک تیم انتخاب کنید.' : 'موارد قرمز را کامل کنید.'});
    out.sf = {name: m.name, onName: e => this.setM({name: e.target.value}), nameErr: eN ? 'err' : '', phone: m.phone, onPhone: e => this.setM({phone: e.target.value}), phoneErr: eP ? 'err' : '', secErr: eS ? 'err' : '',
      teams: s.teams.map(t => ({name: t.name, secs: s.sections.filter(x => x.team === t.id).map(x => ({cls: 'opt' + (m.secs.includes(x.id) ? ' on' : ''), on: m.secs.includes(x.id), name: x.name, pick: () => this.setM({secs: m.secs.includes(x.id) ? m.secs.filter(y => y !== x.id) : m.secs.concat([x.id])})}))})).filter(t => t.secs.length)};
  }
  if (k === 'members') {
    const sec = this.sec(m.sec) || {name: ''};
    Object.assign(D, {isMembers: true, title: 'اعضای تیم ' + sec.name, hasSub: true, sub: (this.team(sec.team) || {}).name, okLabel: 'بستن', ok: close});
    out.mbs = {people: s.staff.filter(p => p.active).map(p => ({cls: 'chk' + (p.secs.includes(m.sec) ? ' on' : ''), on: p.secs.includes(m.sec), toggle: () => this.toggleMember(p.id, m.sec), bg: p.bg, init: p.init, name: p.name, secs: this.secNames(p).join('، ')}))};
  }
  if (k === 'objection') {
    const r = s.returns.find(x => x.id === m.rid);
    Object.assign(D, {isObj: true, title: 'اعتراض به ارجاع', okLabel: 'ثبت اعتراض', ok: () => this.confirmObjection(), hasErr: m.tried && !m.text.trim(), err: 'دلیل اعتراض را بنویسید.'});
    out.ob = {title: r.title, reason: this.C.RS[r.reason], date: this.dShort(r.t), mgr: r.mgr, text: m.text, onText: e => this.setM({text: e.target.value}), err: m.tried && !m.text.trim() ? 'err' : ''};
  }
  if (k === 'objReview') {
    const r = s.returns.find(x => x.id === m.rid), cc = this.get(r.cid);
    Object.assign(D, {isObjRev: true, title: 'بررسی اعتراض', okLabel: 'ثبت نتیجه', ok: () => this.confirmObjReview(), hasErr: m.tried && !m.dec, err: 'نتیجه را انتخاب کنید.'});
    out.orv = {who: this.sname(r.who), code: cc ? this.code(cc) : this.fa(r.cid), reason: this.C.RS[r.reason], text: r.obj.text,
      decs: [['acc','حق با ایشان است؛ از امتیاز کم نشود'],['rej','ارجاع درست بود']].map(d => ({cls: 'opt' + (m.dec === d[0] ? ' on' : ''), label: d[1], pick: () => this.setM({dec: d[0], tried: false})})),
      note: m.note, onNote: e => this.setM({note: e.target.value})};
  }
  if (k === 'compare') {
    const vs = c.vers.slice(-2);
    Object.assign(D, {isCompare: true, cls: 'dlg md', title: 'مقایسه‌ی دو نسخه‌ی آخر', hasSub: true, sub: c.title, hasFoot: false});
    out.cmp = {items: vs.map(v => { const f = c.fb.find(q => q.list === v.list && q.n === v.n); const stx = {wait: ['منتظر بررسی','P-b'], ok: ['تأیید','P-gs'], ret: ['برگشتی','P-rs']}[v.status]; return {style: v.style, art: c.art, path: f ? this.pathFor(f.anno) : '', label: ((this.listBy(c.board, v.list) || {}).name || '') + ' ' + this.fa(v.n), status: stx[0], pill: stx[1], when: this.sname(v.by) + ' · ' + this.when(v.t, v.m)}; })};
  }
  if (k === 'light') {
    Object.assign(D, {isLight: true, cls: 'dlg md', title: m.title || 'نسخه', hasFoot: false});
    out.lb = {art: m.art, style: m.style || 'art-sketch', path: m.path || '', hasNote: !!m.note, note: m.note};
  }
  out.dlg = D;
  return out;
}
vCal() {
  const s = this.state, c = s.cal; if (!c) return {cal: {open: false}};
  const Ls = [31,31,31,31,31,31,30,30,30,30,30,29];
  const start = this.offOf(c.year, c.month, 1), len = Ls[c.month - 1];
  const sel = {due: (this.get(s.cb) || {}).due, as: s.m.due, rt: s.m.due}[c.target];
  const days = [];
  for (let i = 0; i < this.wd(start); i++) days.push({label: '', cls: 'cal-d blank', dis: true, pick: () => {}, aria: ''});
  for (let d = 1; d <= len; d++) {
    const off = start + d - 1;
    const dis = (c.past === false && off < s.today) || (c.future === false && off > s.today);
    const inR = c.mode === 'range' && c.a != null && off >= c.a && off <= (c.b == null ? c.a : c.b);
    const on = c.mode === 'range' ? off === c.a : off === sel;
    days.push({label: this.fa(d), dis, cls: 'cal-d' + (off === s.today ? ' today' : '') + (on ? ' on' : inR ? ' rng' : ''), aria: this.dFull(off), pick: () => this.calPick(off)});
  }
  const titles = {due: 'تاریخ تحویل', as: 'تاریخ تحویل', rt: 'تحویل اصلاحیه', ar: 'بازه‌ی آرشیو', rp: 'بازه‌ی گزارش'};
  const close = () => this.setState({cal: null});
  const mv = dm => { let mo = c.month + dm, y = c.year; if (mo > 12) { mo = 1; y++; } if (mo < 1) { mo = 12; y--; } this.setState({cal: Object.assign({}, c, {month: mo, year: y})}); };
  return {cal: {open: true, title: titles[c.target] || 'تقویم', hint: c.mode === 'range' ? (c.a != null ? 'از ' + this.dShort(c.a) + '؛ حالا روز پایان را بزنید.' : 'روز شروع را بزنید.') : 'امروز با خط آبی مشخص است.',
    month: this.C.MONTHS[c.month - 1] + ' ' + this.fa(c.year), prev: () => mv(-1), next: () => mv(1), noPrev: c.year === 1405 && c.month <= 1, noNext: c.year === 1405 && c.month >= 12,
    wds: this.C.WDS.map(t => ({t})), days, close, bg: e => { if (e.target === e.currentTarget) close(); }, esc: e => { if (e.key === 'Escape') close(); }}};
}
vMisc() {
  const s = this.state, t = s.toast;
  const items = [
    {icon: 'i-refresh', label: 'حالت بارگذاری', go: () => { this.setState({pageState: 'loading', demo: false}); this.later('load', () => this.setState({pageState: 'ok'}), 2200); }, isOn: false},
    {icon: 'i-wifi-off', label: 'حالت خطای ارتباط', go: () => this.setState({pageState: 'error', demo: false}), isOn: s.pageState === 'error'},
    {icon: 'i-layers', label: 'حالت خالی (بی‌کارت)', go: () => this.setState({empty: !s.empty}), isOn: s.empty},
    {icon: 'i-wifi-off', label: 'آفلاین', go: () => this.setState({offline: !s.offline}), isOn: s.offline},
    {icon: s.dark ? 'i-sun' : 'i-moon', label: 'پوسته‌ی تیره', go: () => this.setState({dark: !s.dark}), isOn: s.dark},
    {icon: 'i-bell', label: 'ساعت ۱۸: یادآوری گزارش روزانه', go: () => this.dmReminder(), isOn: false},
    {icon: 'i-forward', label: 'یک روز جلو برو', go: () => this.dmDay(), isOn: false},
    {icon: 'i-undo', label: 'شروع دوباره‌ی داده‌ها', go: () => this.dmReset(), isOn: false}
  ];
  return {
    toast: t ? {on: true, text: t.text, icon: t.icon, hasUndo: !!t.undo, undo: () => { this.setState(Object.assign({toast: null}, t.undo)); }, hasAct: !!t.action, actLabel: t.action ? t.action.label : '', act: () => { this.setState({toast: null}); t.action.fn(); }, close: () => this.setState({toast: null})} : {on: false},
    demo: {open: s.demo, toggle: () => this.setState({demo: !s.demo}), items}
  };
}

/* ================= pages ================= */
vHome() {
  const s = this.state, live = this.liveCards();
  const wait = live.filter(c => c.st === 'wait'), late = live.filter(c => this.isLate(c));
  const doing = live.filter(c => ['doing','returned'].includes(c.st) && (this.listOf(c) || {}).kind === 'work');
  const pool = live.filter(c => this.flagOf(c, 'pool'));
  const stats = [
    {n: this.fa(wait.length), label: 'منتظر بررسی', color: 'var(--blue)', go: () => this.go('reviews')},
    {n: this.fa(late.length), label: 'دیرکرد', color: late.length ? 'var(--danger)' : 'var(--text)', go: () => this.go('board', {boardId: 'orders', filter: {who: null, flag: 'late'}})},
    {n: this.fa(doing.length), label: 'در دست انجام', color: 'var(--text)', go: () => this.goBoard('orders')},
    {n: this.fa(pool.length), label: 'بدون صاحب در تیم‌ها', color: 'var(--text)', go: () => this.go('board', {boardId: 'orders', filter: {who: null, flag: 'pool'}})}
  ];
  const acts = [];
  wait.forEach(c => acts.push({c, why: 'منتظر بررسی', pill: 'P-b', btn: 'بررسی', go: () => this.openCard(c.id), o: 0}));
  live.filter(c => c.st === 'ready' && (this.listOf(c) || {}).kind === 'work').forEach(c => acts.push({c, why: 'آماده‌ی ارسال', pill: 'P-gs', btn: 'ارسال برای مشتری', go: () => this.openDlg('send', {cid: c.id, via: null}), o: 1}));
  live.filter(c => c.st === 'ready' && (this.listOf(c) || {}).kind === 'final').forEach(c => acts.push({c, why: 'آماده', pill: 'P-gs', btn: 'انجام شد', go: () => this.publish(c.id), o: 1}));
  live.filter(c => c.st === 'next').forEach(c => acts.push({c, why: 'مرحله‌ی بعد', pill: 'P-gs', btn: 'سپردن', go: () => this.assignAction(c.id), o: 2}));
  late.forEach(c => acts.push({c, why: 'دیرکرد', pill: 'P-rs', btn: 'یادآوری', go: () => this.remind(c.id), o: 3}));
  live.filter(c => (this.listOf(c) || {}).kind === 'queue' && c.board === 'orders').forEach(c => acts.push({c, why: 'در صف', pill: 'P-n', btn: 'سپردن', go: () => this.assignAction(c.id), o: 4}));
  acts.sort((a, b) => a.o - b.o || (b.c.urgent ? 1 : 0) - (a.c.urgent ? 1 : 0));
  const order = {stuck: 0, behind: 1, none: 2, note: 3, auto: 4, ok: 5};
  let reps = [];
  live.forEach(c => (c.whos || []).forEach(pid => { const r = this.repOf(c, pid); if (r.active) reps.push({c, pid, r}); }));
  reps.sort((a, b) => order[a.r.st] - order[b.r.st]);
  const repCount = {all: reps.length, stuck: reps.filter(x => x.r.st === 'stuck' || x.r.st === 'behind').length, none: reps.filter(x => x.r.st === 'none').length};
  const repSum = ['ok','auto','note','behind','stuck','none'].map(k => ({k, n: reps.filter(x => x.r.st === k).length})).filter(x => x.n > 0).map(x => ({pill: this.C.DR[x.k][2], label: this.C.DR[x.k][0], n: this.fa(x.n)}));
  const allReps = reps.slice();
  if (s.repF === 'stuck') reps = reps.filter(x => x.r.st === 'stuck' || x.r.st === 'behind');
  if (s.repF === 'none') reps = reps.filter(x => x.r.st === 'none');
  if (s.repF === 'ok') reps = reps.filter(x => ['ok','note','auto'].includes(x.r.st));
  /* today page: summary on top, three calm groups below */
  const G = {attn: allReps.filter(x => x.r.st === 'stuck' || x.r.st === 'behind'), none: allReps.filter(x => x.r.st === 'none'), ok: allReps.filter(x => ['ok','note','auto'].includes(x.r.st))};
  const tdRow = x => { const p = this.person(x.pid), sec = this.secOf(x.c), D = this.C.DR[x.r.st]; return {bg: p.bg, init: p.init, who: p.name, team: sec ? 'تیم ' + sec.name : '', title: x.c.title, open: () => this.openCard(x.c.id), quote: x.r.note ? '«' + x.r.note + '»' : '', hasQuote: !!x.r.note, sum: x.r.note ? x.r.note : x.r.auto.n ? x.r.auto.text : 'امروز فعالیتی ثبت نشده', hasFile: x.r.files.length > 0, nFile: this.fa(x.r.files.length), pill: D[2], st: D[0], dot: D[1]}; };
  const tf = ['stuck','none','ok'].includes(s.repF) ? s.repF : 'all', fk = {attn: 'stuck', none: 'none', ok: 'ok'};
  const vis = k => tf === 'all' || tf === fk[k];
  const tot = allReps.length, nStuck = G.attn.filter(x => x.r.st === 'stuck').length;
  const tdTile = (k, icon, bg, label, sub) => ({key: k, icon, bg, label, sub, n: this.fa(G[k].length), cls: 'tdt' + (tf === fk[k] ? ' on' : '') + (G[k].length ? '' : ' zero'), cur: tf === fk[k] ? 'true' : 'false', pick: () => this.setState({repF: tf === fk[k] ? 'all' : fk[k]})});
  const okOpen = tf === 'ok' || !!s.tdOk, fName = {stuck: 'نیاز به توجه', none: 'بدون گزارش', ok: 'طبق برنامه'}[tf];
  const td = {
    headline: !tot ? 'امروز کاری در جریان نیست' : G.attn.length ? this.fa(G.attn.length) + ' کار نیاز به توجه دارد' : G.none.length ? 'هیچ کاری گیر نکرده است' : 'همه‌چیز طبق برنامه است',
    sub: tot ? this.fa(G.attn.length + G.ok.length) + ' از ' + this.fa(tot) + ' کار امروز گزارش دارد' : 'کار تازه که سپرده شود، گزارشش اینجا می‌آید.',
    hasBar: tot > 0,
    bar: [[G.ok.length, 'ok', 'طبق برنامه'], [G.attn.length - nStuck, 'warn', 'کمی عقب'], [nStuck, 'stuck', 'گیر کرده'], [G.none.length, 'none', 'بدون گزارش']].filter(x => x[0] > 0).map(x => ({n: String(x[0]), cls: 'tdb-' + x[1], t: x[2] + ' · ' + this.fa(x[0])})),
    tiles: [tdTile('attn', 'i-alert', 'var(--jCit)', 'نیاز به توجه', 'گیر کرده یا عقب'), tdTile('none', 'i-hourglass', 'var(--jSmk)', 'بدون گزارش', 'هنوز چیزی ننوشته‌اند'), tdTile('ok', 'i-check-c', 'var(--jEme)', 'طبق برنامه', 'یادداشت یا کار خودکار')],
    filtered: tf !== 'all', fName: fName || '', showAll: () => this.setState({repF: 'all'}),
    attn: {show: vis('attn') && G.attn.length > 0, n: this.fa(G.attn.length), rows: G.attn.map(tdRow)},
    none: {show: vis('none') && G.none.length > 0, n: this.fa(G.none.length), rows: G.none.map(tdRow),
      remindAll: () => { const ids = G.none.map(x => x.pid).filter((v, i, a) => a.indexOf(v) === i); this.setState({notifs: G.none.reduce((l, x) => this.ntMany(l, [x.pid], 'یادآوری مدیر: گزارش امروز «' + x.c.title + '» را ثبت کنید.', {cid: x.c.id, act: true}), this.state.notifs)}); this.toast('یادآوری گزارش برای ' + this.names(ids) + ' فرستاده شد.', {icon: 'i-bell'}); }},
    ok: {show: vis('ok') && G.ok.length > 0, n: this.fa(G.ok.length), open: okOpen, closed: !okOpen, canToggle: tf !== 'ok', toggle: () => this.setState({tdOk: !s.tdOk}), tgLabel: okOpen ? 'بستن' : 'نمایش', tgIcon: okOpen ? 'i-chev-u' : 'i-chev-d', rows: G.ok.map(tdRow)},
    allClear: tf === 'all' && tot > 0 && !G.attn.length && !G.none.length,
    empty: tot > 0 && tf !== 'all' && !G[{stuck: 'attn', none: 'none', ok: 'ok'}[tf]].length,
    noWork: !tot
  };
  return {
    td,
    stats, actsEmpty: !acts.length,
    actsN: acts.length, acts: acts.map(a => ({art: a.c.art, open: () => this.openCard(a.c.id), title: a.c.title, code: this.code(a.c), pill: a.pill, why: a.why, btnCls: '', btn: a.btn, go: a.go})),
    rpAllCls: s.repF === 'all' ? 'on' : '', rpStuckCls: s.repF === 'stuck' ? 'on' : '', rpNoneCls: s.repF === 'none' ? 'on' : '', rpAll: () => this.setState({repF: 'all'}), rpStuck: () => this.setState({repF: 'stuck'}), rpNone: () => this.setState({repF: 'none'}),
    rpAllN: this.fa(repCount.all), rpStuckN: this.fa(repCount.stuck), rpNoneN: this.fa(repCount.none), repSum,
    repsEmpty: !reps.length,
    reps: reps.map(x => { const p = this.person(x.pid); return {bg: p.bg, init: p.init, who: p.name, open: () => this.openCard(x.c.id), title: x.c.title, line: x.r.note ? '«' + x.r.note + '»' : x.r.auto.n ? x.r.auto.text : 'امروز فعالیتی ثبت نشده', hasFile: x.r.files.length > 0, nFile: this.fa(x.r.files.length), pill: this.C.DR[x.r.st][2], st: this.C.DR[x.r.st][0]}; })
  };
}
vHub() {
  const s = this.state, live = this.liveCards(), h = this.vHome();
  const wait = live.filter(c => c.st === 'wait').length, late = live.filter(c => this.isLate(c)).length;
  const inWork = live.filter(c => { const L = this.listOf(c) || {}; return L.kind === 'work' || L.kind === 'queue' || L.kind === 'cust'; }).length;
  let stuck = 0, behind = 0, none = 0;
  live.forEach(c => (c.whos || []).forEach(pid => { const r = this.repOf(c, pid); if (!r.active) return; if (r.st === 'stuck') stuck++; else if (r.st === 'behind') behind++; else if (r.st === 'none') none++; }));
  const staffN = s.staff.filter(p => p.active).length, teamsN = s.sections.length, boardsN = s.boards.length;
  const objN = s.returns.filter(r => r.obj && r.obj.status === 'pending').length;
  const pool = live.filter(c => this.flagOf(c, 'pool')).length;
  const orders = live.filter(c => c.board === 'orders' && (this.listOf(c) || {}).kind !== 'final').length;
  const all = !!s.homeAll, prob = stuck + behind;
  const tile = (o) => Object.assign({hasAlert: false, alert: '', alertCls: '', cls: 'spoke'}, o);
  return {hub: {
    main: [
      tile({key: 'reviews', bg: 'var(--jSap)', icon: 'i-review', title: 'بررسی', n: this.fa(wait), sub: wait ? 'نسخه منتظر تأیید شما' : 'نسخه‌ای منتظر نیست', go: () => this.go('reviews')}),
      tile({key: 'boards', bg: 'var(--jEme)', icon: 'i-board', title: 'تابلوها', n: this.fa(inWork), sub: 'کار در جریان · ' + this.fa(boardsN) + ' تابلو و ' + this.fa(teamsN) + ' تیم', hasAlert: late > 0, alert: this.fa(late) + ' دیرکرد', alertCls: 'P-rs', go: () => this.go('boards')}),
      tile({key: 'today', bg: 'var(--jAme)', icon: 'i-report', title: 'گزارش امروز', n: this.fa(prob), sub: prob ? 'کار گیر کرده یا عقب' : 'همه طبق برنامه', hasAlert: none > 0, alert: this.fa(none) + ' کار بدون گزارش', alertCls: 'P-n', go: () => this.go('today')}),
      tile({key: 'members', bg: 'var(--jTur)', icon: 'i-users', title: 'تیم‌ها و اعضا', n: this.fa(staffN), sub: 'همکار در ' + this.fa(teamsN) + ' تیم', hasAlert: objN > 0, alert: this.fa(objN) + ' اعتراض منتظر', alertCls: 'P-ys', go: () => this.go('members')})
    ],
    mobile: [
      tile({key: 'reviews', bg: 'var(--jSap)', icon: 'i-review', title: 'بررسی', n: this.fa(wait), sub: wait ? 'منتظر تأیید' : 'چیزی منتظر نیست', go: () => this.go('reviews')}),
      tile({key: 'today', bg: 'var(--jAme)', icon: 'i-report', title: 'گزارش امروز', n: this.fa(prob), sub: prob ? 'گیر کرده یا عقب' : 'همه طبق برنامه', hasAlert: none > 0, alert: this.fa(none) + ' بدون گزارش', alertCls: 'P-n', go: () => this.go('today')}),
      tile({key: 'orders', bg: 'var(--jEme)', icon: 'i-layers', title: 'سفارش‌ها', n: this.fa(orders), sub: 'در جریان', hasAlert: late > 0, alert: this.fa(late) + ' دیرکرد', alertCls: 'P-rs', go: () => this.go('board', {boardId: 'orders', mList: 0})}),
      tile({key: 'teams', bg: 'var(--jTur)', icon: 'i-board', title: 'تیم‌ها', n: this.fa(teamsN), sub: 'تابلوی تیم', hasAlert: pool > 0, alert: this.fa(pool) + ' بدون صاحب', alertCls: 'P-ps', go: () => this.go('boards')})
    ],
    more: [['archive', 'آرشیو', 'i-archive'], ['reports', 'گزارش فصل', 'i-chart'], ['settings', 'تنظیمات', 'i-settings']].map(x => ({title: x[1], icon: x[2], go: () => this.go(x[0])})),
    now: all ? h.acts : h.acts.slice(0, 3), nowEmpty: !h.acts.length, hasMore: h.actsN > 3, toggleAll: () => this.setState({homeAll: !all}), allLabel: all ? 'نمایش کمتر' : 'همه‌ی ' + this.fa(h.actsN) + ' مورد'
  }};
}
vBoardsHub() {
  const s = this.state, live = this.liveCards();
  return {bh: {
    boards: s.boards.map(b => { const n = live.filter(c => c.board === b.id).length, late = live.filter(c => c.board === b.id && this.isLate(c)).length;
      return {bg: b.bg, name: b.name, sub: this.teamOfBoard(b).name + ' · ' + this.fa(n) + ' کارت', hasAlert: late > 0, alert: this.fa(late) + ' دیرکرد', go: () => this.go('board', {boardId: b.id, mList: 0})}; }),
    teams: s.sections.map(x => { const cs = this.teamCards(x.id).filter(c => ['doing','returned','wait'].includes(c.st)), pool = cs.filter(c => this.flagOf(c, 'pool')).length;
      return {bg: x.bg, name: 'تیم ' + x.name, sub: (this.team(x.team) || {}).name + ' · ' + this.fa(cs.length) + ' کار', hasAlert: pool > 0, alert: this.fa(pool) + ' بدون صاحب', go: () => this.go('team', {teamId: x.id, mList: 0})}; }),
    newBoard: () => this.openBoard(), newTeam: () => this.openSection()
  }};
}
vBoard() {
  const s = this.state, b = this.board(s.boardId) || s.boards[0], isMgr = s.role === 'mgr', f = s.filter;
  const cards = this.liveCards().filter(c => c.board === b.id);
  const pass = c => (!f.who || this.isMine(c, f.who)) && (!f.flag || this.flagOf(c, f.flag));
  const filtering = !!(f.who || f.flag);
  const lists = b.lists.map((L, i) => {
    const cs = cards.filter(c => c.list === L.id).filter(pass).sort((x, y) => (y.urgent ? 1 : 0) - (x.urgent ? 1 : 0));
    const sec = L.sec ? this.sec(L.sec) : null;
    const sub = [sec && sec.name !== L.name ? 'تیم ' + sec.name : '', L.optional ? 'اختیاری' : ''].filter(Boolean).join(' · ');
    const info = L.kind === 'work' ? 'کار تیم ' + (sec ? sec.name : '') : L.kind === 'queue' ? 'لیست ورودی' : L.kind === 'cust' ? 'منتظر پاسخ مشتری' : 'لیست پایانی';
    const empty = !cs.length;
    return Object.assign({cls: 'list' + (s.over === L.id ? ' over' : ''), over: e => this.listOver(L.id, e), leave: e => this.listLeave(L.id, e), drop: e => this.listDrop(L.id, 'pipe', e),
      n: this.fa(cs.length), hasSub: !!sub, sub, subIcon: L.optional ? 'i-forward' : 'i-users', hasTeam: !!sec, goTeam: () => sec ? this.goTeam(sec.id) : null,
      cards: cs.map(c => this.cardVM(c, 'pipe')), empty: empty && !(s.quick && s.quick.list === L.id) && (filtering || s.empty), emptyTxt: filtering ? 'موردی با این فیلتر نیست' : 'کارتی نیست',
      canAdd: isMgr && (L.kind === 'queue' || L.kind === 'work') && !(s.quick && s.quick.ctx === 'pipe' && s.quick.list === L.id), add: () => this.openQuick('pipe', L.id),
      addLabel: L.kind === 'work' ? 'افزودن کارت برای تیم' : 'افزودن کارت', quickHint: L.kind === 'work' ? 'به صف تیم ' + (sec ? sec.name : '') + ' می‌رود؛ خودشان تقسیم می‌کنند.' : ''},
      this.listHead('pipe', L, i, b.lists.length, isMgr, info, isMgr && empty && b.lists.length > 1), this.quickVM('pipe', L.id));
  });
  const members = this.boardStaff(b);
  const flags = [['late','دیرکرد','L-r'],['soon','تحویل امروز و فردا','L-y'],['wait','منتظر بررسی','L-b'],['pool','بدون صاحب در تیم','L-p'],['urgent','فوری','L-o'],['stuck','گزارش: عقب یا گیر کرده','L-k']];
  const nF = (f.who ? 1 : 0) + (f.flag ? 1 : 0);
  const rows = cards.filter(pass).map(c => this.cardVM(c, 'pipe'));
  return {bd: {bg: b.bg, name: b.name, team: this.teamOfBoard(b).name, isMgr,
    filterOpen: s.filterOpen, toggleFilter: () => this.setState({filterOpen: !s.filterOpen, qm: null, lMenu: null, hdr: {boards:false, create:false, notif:false, user:false}}),
    filterCls: 'btn glass' + (nF ? ' on' : ''), filterLabel: nF ? 'فیلتر · ' + this.fa(nF) : 'فیلتر',
    fMembers: members.map(p => ({cls: 'pick' + (f.who === p.id ? ' on' : ''), pick: () => this.setState({filter: Object.assign({}, f, {who: f.who === p.id ? null : p.id})}), bg: p.bg, init: p.init, name: p.name})),
    fFlags: flags.map(x => ({cls: 'pick' + (f.flag === x[0] ? ' on' : ''), pick: () => this.setState({filter: Object.assign({}, f, {flag: f.flag === x[0] ? null : x[0]})}), lbl: x[2], label: x[1]})),
    clearFilter: () => this.setState({filter: {who: null, flag: null}, filterOpen: false}),
    members: members.slice(0, 7).map(p => ({bg: p.bg, name: p.name, init: p.init})),
    viewK: s.view === 'k', viewT: s.view === 't', vkCls: 'btn glass' + (s.view === 'k' ? ' on' : ''), vtCls: 'btn glass' + (s.view === 't' ? ' on' : ''), setK: () => this.setState({view: 'k'}), setT: () => this.setState({view: 't'}),
    lists, rows, al: this.addListVM('pipe'), canAddList: isMgr}};
}
vTeam() {
  const s = this.state, isMgr = s.role === 'mgr', mine = this.myTeams();
  const sec = this.sec(s.teamId) && (isMgr || mine.some(x => x.id === s.teamId)) ? this.sec(s.teamId) : mine[0];
  if (!sec) return {tb: {lists: [], al: this.addListVM('team'), rp: {show: false, rows: []}, tabs: []}};
  const me = s.me, f = s.filter;
  const all = this.teamCards(sec.id);
  const pass = c => (!s.onlyMine || isMgr || this.isMine(c, me)) && (!f.who || this.isMine(c, f.who)) && (!f.flag || this.flagOf(c, f.flag));
  const canEdit = isMgr || this.person(me).secs.includes(sec.id);
  const lists = sec.lists.map((T, i) => {
    const cs = all.filter(c => (this.tlOf(c) || {}).id === T.id).filter(pass).sort((x, y) => (y.urgent ? 1 : 0) - (x.urgent ? 1 : 0));
    const info = T.role === 'in' ? 'کارهای تازه‌ی تیم اینجا می‌آیند' : T.role === 'done' ? 'کارت‌ها پس از ارسال نسخه خودشان اینجا می‌آیند' : T.role === 'doing' ? 'برداشتن کار = آمدن به این لیست' : 'لیست دلخواه تیم';
    return Object.assign({cls: 'list' + (s.over === T.id ? ' over' : ''), over: e => this.listOver(T.id, e), leave: e => this.listLeave(T.id, e), drop: e => this.listDrop(T.id, 'team', e),
      n: this.fa(cs.length), hasSub: false, sub: '', subIcon: 'i-users', hasTeam: false, goTeam: () => {}, roleLbl: this.C.TLL[T.role] || 'L-s',
      cards: cs.map(c => this.cardVM(c, 'team')), empty: !cs.length && !(s.quick && s.quick.list === T.id), emptyTxt: T.role === 'done' ? 'کارت‌ها پس از ارسال نسخه اینجا می‌آیند' : T.role === 'in' ? 'کار تازه‌ای در صف نیست' : 'کارتی نیست',
      canAdd: isMgr && T.role === 'in' && !(s.quick && s.quick.ctx === 'team' && s.quick.list === T.id), add: () => this.openQuick('team', T.id), addLabel: 'افزودن کارت برای تیم', quickHint: 'کارت برای کل تیم ساخته می‌شود.'},
      this.listHead('team', T, i, sec.lists.length, canEdit, info, canEdit && !cs.length && !T.role), this.quickVM('team', T.id));
  });
  const myCards = isMgr ? [] : all.filter(c => this.isMine(c, me) && this.isActiveWork(c) && c.st !== 'wait');
  const reps = myCards.map(c => ({c, r: this.repOf(c, me)}));
  const left = reps.filter(x => x.r.st === 'none').length;
  const rn = s.repNote;
  const people = this.staffFor(sec.id);
  const nF = (f.who ? 1 : 0) + (f.flag ? 1 : 0);
  return {tb: {name: 'تیم ' + sec.name, unit: (this.team(sec.team) || {}).name || '', bg: sec.bg, isMgr, canEdit,
    members: people.slice(0, 7).map(p => ({bg: p.bg, name: p.name, init: p.init})),
    allCls: 'btn glass' + (!s.onlyMine ? ' on' : ''), mineCls: 'btn glass' + (s.onlyMine ? ' on' : ''), setAll: () => this.setState({onlyMine: false}), setMine: () => this.setState({onlyMine: true}), showMine: !isMgr,
    nPool: this.fa(all.filter(c => this.flagOf(c, 'pool')).length), hasPool: all.some(c => this.flagOf(c, 'pool')),
    filterOpen: s.filterOpen, toggleFilter: () => this.setState({filterOpen: !s.filterOpen, qm: null, lMenu: null}), filterCls: 'btn glass' + (nF ? ' on' : ''), filterLabel: nF ? 'فیلتر · ' + this.fa(nF) : 'فیلتر',
    fMembers: people.map(p => ({cls: 'pick' + (f.who === p.id ? ' on' : ''), pick: () => this.setState({filter: Object.assign({}, f, {who: f.who === p.id ? null : p.id})}), bg: p.bg, init: p.init, name: p.name})),
    fFlags: [['pool','بدون صاحب','L-p'],['late','دیرکرد','L-r'],['soon','تحویل امروز و فردا','L-y'],['wait','منتظر بررسی','L-b'],['urgent','فوری','L-o']].map(x => ({cls: 'pick' + (f.flag === x[0] ? ' on' : ''), pick: () => this.setState({filter: Object.assign({}, f, {flag: f.flag === x[0] ? null : x[0]})}), lbl: x[2], label: x[1]})),
    clearFilter: () => this.setState({filter: {who: null, flag: null}, filterOpen: false}),
    tabs: (isMgr ? s.sections : mine).map(x => ({cls: 'btn glass' + (x.id === sec.id ? ' on' : ''), name: x.name, go: () => this.goTeam(x.id)})), hasTabs: (isMgr ? s.sections : mine).length > 1,
    lists, al: this.addListVM('team'), canAddList: canEdit,
    rp: {show: reps.length > 0, open: s.repOpen, closed: !s.repOpen, toggle: () => this.setState({repOpen: !s.repOpen}),
      pill: left ? 'P-ys' : 'P-gs', left: left ? this.fa(left) + ' کار بدون گزارش' : 'همه ثبت شد', title: 'گزارش امروز من',
      hint: 'کارهایی که روی کارت انجام داده‌اید خودکار ثبت شده؛ فقط وضعیت را بزنید. توضیح و فایل اختیاری است و در فعالیت کارت هم می‌آید.',
      rows: reps.map(x => {
        const c = x.c, open = !!(rn && rn.cid === c.id);
        return {title: c.title, open: () => this.openCard(c.id), art: c.art, auto: x.r.note ? '«' + x.r.note + '»' : x.r.auto.text, hasFiles: x.r.files.length > 0, files: x.r.files.map(fl => this.fileVM(fl)),
          chips: ['ok','behind','stuck'].map(k => ({cls: 'drb' + (x.r.st === k ? ' on' : ''), on: x.r.st === k, dot: this.C.DR[k][1], label: this.C.DR[k][0], pick: () => { this.pickDaily(c.id, k); if (!this.state.repNote || this.state.repNote.cid !== c.id) this.setState({repNote: {cid: c.id, text: '', files: []}}); }})),
          noteOpen: open, toggleNote: () => this.setState({repNote: open ? null : {cid: c.id, text: '', files: []}}), noteLabel: open ? 'بستن' : 'توضیح یا فایل',
          note: open ? rn.text : '', onNote: e => this.setState({repNote: Object.assign({}, this.state.repNote, {text: e.target.value})}),
          nFiles: open ? rn.files.map((fl, i) => this.fileVM(fl, () => this.setState({repNote: Object.assign({}, this.state.repNote, {files: this.state.repNote.files.filter((_, j) => j !== i)})}))) : [], hasNFiles: open && rn.files.length > 0,
          addFile: () => this.setState({repNote: Object.assign({}, this.state.repNote, {files: this.state.repNote.files.concat([this.fakeFile(this.state.repNote.files.length, me, c.art)])})}),
          save: () => this.saveRepNote(c.id)};
      })}}};
}
vReviews() {
  const s = this.state;
  const wait = this.liveCards().filter(c => c.st === 'wait').map(c => ({c, v: this.lastWait(c)})).sort((a, b) => ((a.v || {}).t * 1440 + (a.v || {}).m) - ((b.v || {}).t * 1440 + (b.v || {}).m));
  return {revsEmpty: !wait.length, revs: wait.map(x => {
    const c = x.c, L = this.listOf(c), v = x.v || {n: 1, t: s.today, m: s.now, by: (c.whos || [])[0]}, p = this.person(v.by || (c.whos || [])[0]);
    const hrs = ((s.today - v.t) * 1440 + (s.now - v.m)) / 60;
    return {style: v.style || L.style, art: c.art, open: () => this.openCard(c.id), title: c.title, code: this.code(c), listLbl: L.lbl, listName: L.name, ver: 'نسخه‌ی ' + this.fa(v.n), bg: p.bg, init: p.init, who: p.name, waitPill: hrs > 24 ? 'P-rs' : hrs > 6 ? 'P-ys' : 'P-n', wait: this.ago(v.t, v.m)};
  })};
}
vArchive() {
  const s = this.state, q = s.arQ.trim(), qe = this.en(q);
  const all = s.empty ? [] : s.cards.filter(c => c.arch);
  const inRange = c => { const a = c.archAt != null ? c.archAt : 0; if (s.arRange === 'm') return s.today - a <= 30; if (s.arRange === 'q') return s.today - a <= 90; if (s.arRange === 'custom' && s.arCustom) return a >= s.arCustom[0] && a <= s.arCustom[1]; return true; };
  const match = c => !q || c.title.includes(q) || this.code(c).includes(q) || (c.cust && (c.cust.name.includes(q) || c.cust.phone.includes(qe)));
  const list = all.filter(c => c.arch === (s.arTab === 'done' ? 'done' : 'cancel')).filter(inRange).filter(match).sort((a, b) => b.archAt - a.archAt);
  return {ar: {isDone: s.arTab === 'done', isCancel: s.arTab === 'cancel', tDCls: 'tab' + (s.arTab === 'done' ? ' on' : ''), tCCls: 'tab' + (s.arTab === 'cancel' ? ' on' : ''),
    goDone: () => this.setState({arTab: 'done'}), goCancel: () => this.setState({arTab: 'cancel'}), nDone: this.fa(all.filter(c => c.arch === 'done').length), nCancel: this.fa(all.filter(c => c.arch === 'cancel').length),
    q: s.arQ, onQ: e => this.setState({arQ: e.target.value}),
    ranges: [['all','همه'],['m','این ماه'],['q','این فصل']].map(r => ({cls: s.arRange === r[0] ? 'on' : '', label: r[1], pick: () => this.setState({arRange: r[0]})})),
    openCal: () => this.openCal('ar', 'range', s.today), customTxt: s.arRange === 'custom' && s.arCustom ? this.dShort(s.arCustom[0]) + ' تا ' + this.dShort(s.arCustom[1]) : 'بازه‌ی دلخواه',
    items: list.map(c => ({art: c.art, open: () => this.openCard(c.id), title: c.title, code: this.code(c), where: this.board(c.board).name, date: this.dLong(c.archAt), hasReason: c.arch === 'cancel', reason: c.cancelWhy || '', restore: () => this.restoreCard(c.id)})),
    empty: !list.length, clear: () => this.setState({arQ: '', arRange: 'all'})}};
}
vMembers() {
  const s = this.state;
  const pend = s.returns.filter(r => r.obj && r.obj.status === 'pending');
  return {mm: {hasObj: pend.length > 0, obj: pend.map(r => { const p = this.person(r.who), c = this.get(r.cid); return {bg: p.bg, init: p.init, who: p.name, code: c ? this.code(c) : this.fa(r.cid), review: () => this.openObjReview(r.id)}; }),
    teams: s.teams.map(t => {
      const secs = s.sections.filter(x => x.team === t.id);
      const people = s.staff.filter(p => p.active && p.secs.some(id => secs.some(x => x.id === id)));
      return {bg: t.bg, name: t.name, secs: secs.map(x => x.name).join(' · '), people: people.map(p => { const kk = this.ktOf(p.id); return {open: () => this.go('person', {pid: p.id}), bg: p.bg, init: p.init, name: p.name, sec: 'تیم ' + this.secNames(p).join('، '), active: this.fa(this.activeOf(p.id).length), ktCls: kk.cls, kt: kk.kt, ktTxt: kk.txt}; })};
    }).filter(t => t.people.length)}};
}
vPerson() {
  const s = this.state, p = this.person(s.pid || 'maryam'), kk = this.ktOf(p.id), sc = kk.score;
  const w = s.weights[p.secs[0]] || [25,25,25,25];
  const rs = s.returns.filter(r => r.who === p.id && !(r.obj && r.obj.status === 'acc'));
  const max = Math.max(1, ...Object.keys(this.C.RS).map(k => rs.filter(r => r.reason === k).length));
  const objs = s.returns.filter(r => r.who === p.id && r.obj);
  return {pp: {bg: p.bg, init: p.init, name: p.name, sec: 'تیم ' + this.secNames(p).join('، '), active: this.fa(this.activeOf(p.id).length), tasks: this.fa(p.tasks || 0),
    enough: sc != null, insufficient: sc == null, score: this.fa(sc == null ? 0 : sc), scoreN: sc || 0, toNext: this.toNext(sc), ktCls: kk.cls, kt: kk.kt,
    bonus: () => this.toast('گزارش پاداش ' + p.name + ' آماده شد (پی‌دی‌اف).', {icon: 'i-download'}),
    metrics: this.C.MET.map((n, i) => ({name: n, w: 'وزن ' + this.fa(w[i]) + '٪', val: this.fa(p.metrics ? p.metrics[i] : 0) + '٪', pct: p.metrics ? p.metrics[i] : 0})),
    reasons: Object.keys(this.C.RS).map(k => { const n = rs.filter(r => r.reason === k).length; return {label: this.C.RS[k], n: this.fa(n), pct: Math.round(n / max * 100), color: this.C.RSH[k]}; }),
    objs: objs.map(r => { const c = this.get(r.cid); const st = {pending: ['در انتظار','P-ys'], acc: ['پذیرفته شد','P-gs'], rej: ['رد شد','P-rs']}[r.obj.status]; return {code: c ? this.code(c) : this.fa(r.cid), status: st[0], pill: st[1], pending: r.obj.status === 'pending', review: () => this.openObjReview(r.id)}; }),
    noObjs: !objs.length}};
}
vReports() {
  const s = this.state, fct = {w: 0.85, m: 1, q: 1.06, custom: 0.94}[s.rpRange] || 1;
  const base = {sketch: 1.6, '2d': 1.2, '3d': 2.8, cust: 2.3, shoot: 1.1, edit: 0.9};
  const times = [];
  s.boards.forEach(b => b.lists.filter(l => l.kind === 'work' || l.kind === 'cust').forEach(l => times.push({lbl: l.lbl, name: l.name, v: (base[l.id] || 1.4) * fct})));
  const tmax = Math.max(...times.map(t => t.v));
  const late0 = {maryam: 1, elham: 2, sara: 3, amir: 0, hossein: 1, niloofar: 1, reza: 2};
  const late = s.staff.filter(p => p.active).map(p => ({p, n: Math.round(((late0[p.id] || 0) + (this.liveCards().filter(c => this.isMine(c, p.id) && this.isLate(c)).length)) * fct)})).sort((a, b) => b.n - a.n);
  const lmax = Math.max(1, ...late.map(x => x.n));
  const rb = {defect: 9, taste: 6, mgr: 3, info: 4};
  s.returns.forEach(r => { if (!(r.obj && r.obj.status === 'acc')) rb[r.reason] = (rb[r.reason] || 0) + 1; });
  Object.keys(rb).forEach(k => rb[k] = Math.round(rb[k] * fct));
  const tot = Object.values(rb).reduce((a, b) => a + b, 0);
  let acc = 0; const segs = Object.keys(this.C.RS).map(k => { const a0 = acc; acc += rb[k] / tot * 100; return this.C.RSH[k] + ' ' + a0.toFixed(1) + '% ' + acc.toFixed(1) + '%'; });
  const exp = kind => { this.setState({rpBusy: true}); this.later('rp', () => { this.setState({rpBusy: false}); this.toast('گزارش ' + kind + ' آماده شد و دانلود شد.', {icon: 'i-download'}); }, 900); };
  return {rp: {ranges: [['w','هفته'],['m','ماه'],['q','فصل']].map(r => ({cls: s.rpRange === r[0] ? 'on' : '', label: r[1], pick: () => this.setState({rpRange: r[0]})})),
    openCal: () => this.openCal('rp', 'range', s.today), customTxt: s.rpRange === 'custom' && s.rpCustom ? this.dShort(s.rpCustom[0]) + ' تا ' + this.dShort(s.rpCustom[1]) : 'بازه‌ی دلخواه',
    pdf: () => exp('پی‌دی‌اف'), xls: () => exp('اکسل'), busy: s.rpBusy,
    times: times.map(t => ({lbl: t.lbl, name: t.name, pct: Math.round(t.v / tmax * 100), val: this.fa(t.v.toFixed(1))})),
    late: late.slice(0, 6).map(x => ({bg: x.p.bg, init: x.p.init, name: x.p.name, pct: Math.round(x.n / lmax * 100), n: this.fa(x.n)})),
    donut: segs.join(', '), donutAria: Object.keys(this.C.RS).map(k => this.C.RS[k] + ' ' + this.fa(rb[k])).join('، '), retTotal: this.fa(tot),
    legend: Object.keys(this.C.RS).map(k => ({lbl: this.C.RSL[k], label: this.C.RS[k], n: this.fa(rb[k])})),
    bonus: s.staff.filter(p => p.active).map(p => { const kk = this.ktOf(p.id); const st = kk.score == null ? ['داده‌ی کافی نیست','P-n'] : s.trial ? ['آزمایشی','P-n'] : kk.k === 24 ? ['پاداش کامل','P-g'] : kk.k === 21 ? ['پاداش','P-gs'] : kk.k === 18 ? ['پاداش پایه','P-ys'] : ['بدون پاداش','P-n']; return {bg: p.bg, init: p.init, name: p.name, sec: this.secNames(p).join('، '), ktCls: kk.cls, kt: kk.kt, pill: st[1], st: st[0]}; })}};
}
vSettings() {
  const s = this.state;
  const tabs = [['teams','واحدها، تیم‌ها و تابلوها','i-team'],['people','اعضا','i-users'],['daily','گزارش روزانه','i-report'],['sms','پیامک‌ها','i-sms'],['score','امتیازدهی','i-award'],['gallery','گالری','i-store']];
  const sw = (on) => 'sw' + (on ? ' on' : '');
  const setS = p => this.setState({set: Object.assign({}, s.set, p)});
  const sel = s.sms.find(r => r.id === s.smsSel) || s.sms[0];
  const prev = sel.text.replace(/\{نام\}/g, 'مریم').replace(/\{کد\}/g, 'ر-۰۱۴۵').replace(/\{تاریخ\}/g, this.dShort(s.today + 1)).replace(/\{گالری\}/g, s.gName);
  const parts = prev.length <= 70 ? 1 : Math.ceil(prev.length / 67);
  const w = s.weights[s.scSec] || [25,25,25,25], sum = w.reduce((a, b) => a + b, 0);
  return {st: {tabs: tabs.map(t => ({cls: 'tab' + (s.stTab === t[0] ? ' on' : ''), on: s.stTab === t[0], pick: () => this.setState({stTab: t[0]}), icon: t[2], label: t[1]})),
    tTeams: s.stTab === 'teams', tPeople: s.stTab === 'people', tDaily: s.stTab === 'daily', tSms: s.stTab === 'sms', tScore: s.stTab === 'score', tGallery: s.stTab === 'gallery',
    teams: s.teams.map(t => ({bg: t.bg, name: t.name, n: this.fa(s.staff.filter(p => p.active && p.secs.some(id => (this.sec(id) || {}).team === t.id)).length),
      secs: s.sections.filter(x => x.team === t.id).map(x => ({name: x.name, bg: x.bg, avs: this.staffFor(x.id).map(p => ({bg: p.bg, name: p.name, init: p.init})), manage: () => this.openMembers(x.id), board: () => this.goTeam(x.id), lists: x.lists.map(l => l.name).join(' ‹ ')})),
      addSec: () => this.openSection(t.id)})),
    boards: s.boards.map(b => ({bg: b.bg, name: b.name, team: this.teamOfBoard(b).name, addList: () => { this.goBoard(b.id); this.setState({addL: {ctx: 'pipe', text: '', sec: 'new'}}); },
      lists: b.lists.map((l, i) => ({lbl: l.lbl, name: l.name, sub: l.kind === 'work' ? [((this.sec(l.sec) || {}).name || '') !== l.name ? '· تیم ' + (this.sec(l.sec) || {}).name : '', l.optional ? '· اختیاری' : ''].join(' ') : '', tip: l.kind, arrow: i < b.lists.length - 1}))})),
    people: s.staff.map(p => ({bg: p.bg, init: p.init, name: p.name, isNew: !!p.isNew, phone: this.fa(p.phone), secs: p.secs.map(id => { const x = this.sec(id) || {}; return {name: x.name, bg: x.bg || (this.team(x.team) || {}).bg}; }), swCls: sw(p.active), active: p.active, toggle: () => this.setState({staff: s.staff.map(q => q.id === p.id ? Object.assign({}, q, {active: !q.active}) : q)})})),
    daily: [
      ['dailyAuto','ساختن خودکار گزارش از فعالیت کارت','تیک چک‌لیست، ارسال نسخه و هر یادداشتی که در کارت می‌نویسند، خودش گزارش امروز می‌شود.'],
      ['dailyRemind','یادآوری اگر گزارشی ثبت نشده','فقط برای کسانی که کارِ بی‌گزارش دارند، با اعلان و پیامک.'],
      ['dailyStuck','«گیر کرده‌ام» فوراً به من خبر بدهد','همان لحظه اعلان می‌گیرید، همراه توضیح و فایلشان.'],
      ['dailyReq','ثبت وضعیت برای هر کار لازم باشد','خاموش: اگر فعالیتی ثبت شده باشد، ضربه زدن لازم نیست.']
    ].map(d => ({label: d[1], sub: d[2], on: s.set[d[0]], swCls: sw(s.set[d[0]]), toggle: () => setS({[d[0]]: !s.set[d[0]]})})),
    remTime: s.set.remTime, onRem: e => setS({remTime: e.target.value}),
    sms: s.sms.map(r => ({pill: r.rec === 'مشتری' ? 'P-ps' : 'P-b', rec: r.rec, ev: r.ev, on: r.on, swCls: sw(r.on), pick: () => this.setState({smsSel: r.id}), toggle: () => this.setState({sms: s.sms.map(x => x.id === r.id ? Object.assign({}, x, {on: !x.on}) : x)})})),
    smsSel: {ev: sel.ev, text: sel.text, onText: e => this.setState({sms: s.sms.map(x => x.id === sel.id ? Object.assign({}, x, {text: e.target.value}) : x)}),
      vars: ['{نام}','{کد}','{تاریخ}','{گالری}'].map(v => ({label: v, ins: () => this.setState({sms: s.sms.map(x => x.id === sel.id ? Object.assign({}, x, {text: x.text + ' ' + v}) : x)})})),
      preview: prev, chars: this.fa(prev.length), parts: this.fa(parts), warn: parts > 1},
    scSecs: s.sections.filter(x => s.weights[x.id]).map(x => ({cls: s.scSec === x.id ? 'on' : '', label: x.name, pick: () => this.setState({scSec: x.id})})),
    weights: this.C.MET.map((n, i) => ({id: 'w' + i, name: n, v: w[i], vTxt: this.fa(w[i]) + '٪', on: e => { const nw = w.slice(); nw[i] = +e.target.value; this.setState({weights: Object.assign({}, s.weights, {[s.scSec]: nw})}); }})),
    sumPill: sum === 100 ? 'P-gs' : 'P-rs', sumTxt: this.fa(sum) + '٪' + (sum === 100 ? '' : ' — باید ۱۰۰٪ شود'),
    levels: [18, 21, 24].map((k, i) => ({ktCls: this.ktCls(k), kt: this.fa(k), v: this.fa(s.levels[i]), on: e => { const v = +this.en(e.target.value); if (!isNaN(v)) { const l = s.levels.slice(); l[i] = v; this.setState({levels: l}); } }})),
    gName: s.gName, onGName: e => this.setState({gName: e.target.value})}};
}
vScore() {
  const s = this.state, p = this.person(s.me), kk = this.ktOf(s.me), sc = kk.score;
  const rs = s.returns.filter(r => r.who === s.me).sort((a, b) => b.t - a.t);
  return {ms: {insufficient: sc == null, enough: sc != null, tasks: this.fa(p.tasks || 0), ktCls: kk.cls, kt: kk.kt, score: this.fa(sc || 0), scoreN: sc || 0, toNext: this.toNext(sc),
    metrics: this.C.MET.map((n, i) => ({name: n, val: this.fa(p.metrics ? p.metrics[i] : 0) + '٪', pct: p.metrics ? p.metrics[i] : 0, plain: this.C.PLAIN[i]})),
    returns: rs.map(r => { const st = r.obj ? {pending: ['اعتراض در انتظار','P-ys'], acc: ['اعتراض پذیرفته شد','P-gs'], rej: ['اعتراض رد شد','P-rs']}[r.obj.status] : null;
      return {title: r.title, code: this.get(r.cid) ? this.code(this.get(r.cid)) : 'ر-' + this.fa(String(r.cid).padStart(4, '0')), date: this.dShort(r.t), rPill: this.C.RSP[r.reason], reason: this.C.RS[r.reason], hasStatus: !!st, sPill: st ? st[1] : '', status: st ? st[0] : '', canObj: this.canObj(r), obj: () => this.openObjection(r.id)}; })}};
}
vLogin() {
  const s = this.state, l = s.login;
  return {login: {phoneStep: l.step === 'phone', codeStep: l.step === 'code', phone: l.phone, code: l.code, hasErr: !!l.err, err: l.err, errCls: l.err ? 'err' : '', waiting: l.timer > 0, canResend: l.timer === 0, timerTxt: this.fa('0:' + String(l.timer).padStart(2, '0'))},
    onLoginPhone: e => this.setLogin({phone: e.target.value, err: ''}), loginSend: () => this.loginSend(), loginBack: () => { this.stop('otp'); this.setLogin({step: 'phone', err: '', code: ''}); },
    onLoginCode: e => this.setLogin({code: e.target.value, err: ''}), loginVerify: () => this.loginVerify(), loginResend: () => this.loginSend()};
}
vNotifs() {
  const s = this.state, isMgr = s.role === 'mgr', aud = isMgr ? 'mgr' : s.me;
  const mine = s.notifs.filter(n => n.to === aud), list = mine.filter(n => s.nf === 'all' || n.act), unread = mine.filter(n => n.unread).length;
  return {hasUnread: unread > 0, unreadN: this.fa(unread), unreadCount: unread, nfAllCls: s.nf === 'all' ? 'on' : '', nfActCls: s.nf === 'act' ? 'on' : '', nfAll: () => this.setState({nf: 'all'}), nfAct: () => this.setState({nf: 'act'}),
    notifEmpty: !list.length,
    notifList: list.slice(0, 14).map(n => ({text: n.text, time: this.ago(n.t, n.m) + ' پیش', dotCls: n.unread ? 'dot-b' : 'dot-x', open: () => {
      this.setState({notifs: this.state.notifs.map(x => x.id === n.id ? Object.assign({}, x, {unread: false}) : x), hdr: {boards:false, create:false, notif:false, user:false}});
      if (n.cid && this.get(n.cid)) this.openCard(n.cid); else if (n.page) { const h = n.page === 'team' ? this.homeFor('stf') : {page: n.page}; this.go(h.page, h); }
    }})),
    markAllRead: () => this.setState({notifs: s.notifs.map(n => n.to === aud ? Object.assign({}, n, {unread: false}) : n)})};
}

/* ================= desktop / tablet render ================= */
renderVals() {
  const s = this.state, isMgr = s.role === 'mgr';
  const mgrPages = ['home','boards','board','team','reviews','today','archive','members','person','reports','settings'];
  const stfPages = ['team','score'];
  let page = s.page;
  if (isMgr && !mgrPages.includes(page)) page = 'home';
  if (!isMgr && !stfPages.includes(page)) page = 'team';
  const sideMin = s.side !== 'open';
  const pg = {}; ['home','boards','board','team','reviews','today','archive','members','person','reports','settings','score'].forEach(k => pg[k] = page === k);
  const tab = s.device === 'tablet';
  const out = {
    themeCls: (s.dark ? 'dark' : '') + (tab ? ' embed touch' : ''), notLogged: !s.logged, loggedIn: s.logged, isMgr, isStf: !isMgr,
    pg, pageLoading: s.pageState === 'loading', pageError: s.pageState === 'error', pageOk: s.pageState === 'ok', offline: s.offline,
    skCols: [{cards: [1,2,3]}, {cards: [1,2]}, {cards: [1,2,3]}, {cards: [1]}],
    retry: () => { this.setState({pageState: 'loading'}); this.later('load', () => this.setState({pageState: 'ok'}), 600); },
    goHome: () => { const h = this.homeFor(s.role); this.go(h.page, h); }, goMembers: () => this.go('members'),
    roleMgrCls: isMgr ? 'on' : '', roleStfCls: isMgr ? '' : 'on', setMgr: () => this.setRole('mgr'), setStf: () => this.setRole('stf'),
    me: s.me, onMe: e => this.setMe(e.target.value),
    meOpts: s.staff.filter(p => p.active).map(p => ({id: p.id, name: p.name})),
    trial: s.trial, trialSw: 'sw' + (s.trial ? ' on' : ''), toggleTrial: () => this.setState({trial: !s.trial}),
    addStaff: () => this.openStaff(),
    dragEnd: () => this.dragEnd(),
    quickText: s.quickText, onQuick: e => this.setState({quickText: e.target.value}),
    quickKey: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.quickAdd(); } if (e.key === 'Escape') this.closeQuick(); },
    quickAdd: () => this.quickAdd(), quickClose: () => this.closeQuick(), quickRef: () => this.addQuickRef(),
    todayFull: this.dFull(s.today),
    sideMin, sideOpen: !sideMin, sideCls: 'side' + (sideMin ? ' min' : ''), toggleSide: () => this.setState({side: sideMin ? 'open' : 'min'}),
    sideTgIcon: sideMin ? 'i-chev-l' : 'i-chev-r', sideTgLabel: sideMin ? 'باز کردن منو' : 'جمع کردن منو', mgrFirst: this.first('mehdi'), mgrGreet: this.C.MGR.greet
  };
  Object.assign(out, this.vLogin(), this.vShell(page), this.vNotifs(), this.vQm(), this.vCard(), this.vDlg(), this.vCal(), this.vMisc());
  Object.assign(out, this.vHub(), this.vBoardsHub());
  Object.assign(out, this.vHome(), this.vBoard(), this.vTeam(), this.vReviews(), this.vArchive(), this.vMembers(), this.vPerson(), this.vReports(), this.vSettings(), this.vScore());
  return out;
}
vShell(page) {
  const s = this.state, isMgr = s.role === 'mgr', h = s.hdr;
  const live = this.liveCards();
  const waitN = live.filter(c => c.st === 'wait').length;
  let probN = 0; live.forEach(c => (c.whos || []).forEach(pid => { const r = this.repOf(c, pid); if (r.active && (r.st === 'stuck' || r.st === 'behind')) probN++; }));
  const nav = isMgr ? [
    ['home','خانه','i-home',0], ['boards','تابلوها','i-board',0], ['reviews','صف بررسی','i-review',waitN], ['today','گزارش امروز','i-report',probN], ['members','اعضا و امتیازها','i-users',0], ['archive','آرشیو','i-archive',0], ['reports','گزارش فصل','i-chart',0], ['settings','تنظیمات','i-settings',0]
  ] : [['team','تابلوی تیم','i-board',0], ['score','امتیاز من','i-award',0]];
  const navOn = k => page === k || (k === 'members' && page === 'person') || (k === 'boards' && (page === 'board' || page === 'team'));
  const q = s.search.trim(), qe = this.en(q);
  const pool = isMgr ? s.cards : s.cards.filter(c => { const x = this.secOf(c); return x && this.person(s.me).secs.includes(x.id); });
  const res = q ? pool.filter(c => (c.title.includes(q) || this.code(c).includes(q) || this.en(this.code(c)).includes(qe) || (isMgr && c.cust && (c.cust.name.includes(q) || c.cust.phone.includes(qe))))).slice(0, 6) : [];
  const me = this.person(s.me);
  const teams = this.myTeams();
  const curTeam = page === 'team' ? (this.sec(s.teamId) && (isMgr || teams.some(x => x.id === s.teamId)) ? s.teamId : (teams[0] || {}).id) : null;
  return {
    hdr: {boardsOpen: h.boards, toggleBoards: () => this.toggleHdr('boards'), createOpen: h.create, toggleCreate: () => this.toggleHdr('create'),
      newOrder: () => this.openCreate('orders'), newContent: () => this.openCreate((s.boards.find(b => b.id === 'content') || s.boards[0]).id),
      newBoard: () => this.openBoard(), newTeam: () => this.openDlg('team', {name: '', color: this.C.TEAMC[2][0], secs: '', withBoard: true}), newSection: () => this.openSection(),
      notifOpen: h.notif, toggleNotif: () => this.toggleHdr('notif'), userOpen: h.user, toggleUser: () => this.toggleHdr('user')},
    search: s.search, onSearch: e => this.setState({search: e.target.value, hdr: {boards:false, create:false, notif:false, user:false}}),
    searchOpen: !!q, searchNone: !!q && !res.length,
    searchRes: res.map(c => ({open: () => this.openCard(c.id), art: c.art, title: c.title, sub: this.code(c) + ' · ' + (c.arch ? 'آرشیو' : (this.listOf(c) || {}).name) + (isMgr && c.cust ? ' · ' + c.cust.name : '')})),
    anyPop: h.boards || h.create || h.notif || h.user || s.filterOpen || !!s.qm || !!q || !!s.lMenu,
    closePops: () => this.closePops(),
    user: isMgr ? {bg: this.C.MGR.bg, init: this.C.MGR.init, name: this.C.MGR.name, role: 'مدیر گالری'} : {bg: me.bg, init: me.init, name: me.name, role: 'تیم ' + this.secNames(me).join('، ')},
    toggleDark: () => this.setState({dark: !s.dark, hdr: {boards:false, create:false, notif:false, user:false}}), darkIcon: s.dark ? 'i-sun' : 'i-moon', darkLabel: s.dark ? 'پوسته‌ی روشن' : 'پوسته‌ی تیره',
    installDesktop: () => { this.setState({hdr: {boards:false, create:false, notif:false, user:false}}); this.toast('برنامه روی دستگاه نصب شد.', {icon: 'i-monitor'}); },
    logout: () => this.logout(),
    nav: nav.map(n => ({cls: 'nav-i' + (navOn(n[0]) ? ' on' : ''), cur: navOn(n[0]) ? 'page' : 'false', go: () => n[0] === 'team' ? this.go('team', this.homeFor('stf')) : this.go(n[0]), icon: n[2], label: n[1], hasN: n[3] > 0, n: this.fa(n[3])})),
    boardsNav: this.myBoards().map(b => ({go: () => this.goBoard(b.id), bg: b.bg, name: b.name, sub: this.teamOfBoard(b).name + ' · ' + this.fa(live.filter(c => c.board === b.id).length) + ' کارت', cls: 'nav-i' + (page === 'board' && s.boardId === b.id ? ' on' : ''), cur: page === 'board' && s.boardId === b.id ? 'page' : 'false'})),
    hasBoardsNav: isMgr,
    teamsNav: teams.map(x => { const n = isMgr ? this.teamCards(x.id).length : this.activeOf(s.me).filter(c => (this.secOf(c) || {}).id === x.id).length; return {go: () => this.goTeam(x.id), bg: x.bg, name: 'تیم ' + x.name, n: this.fa(n), hasN: n > 0, cls: 'nav-i' + (curTeam === x.id ? ' on' : ''), cur: curTeam === x.id ? 'page' : 'false'}; }),
    teamsHead: isMgr ? 'تابلوی تیم‌ها' : 'تابلوی تیم من'
  };
}
}
class RastaDesktopWeb extends RastaDesktop {
/* ===== web build: real accounts, install, demo data ===== */
accounts() {
  const s = this.state;
  const mgr = {role: 'mgr', me: null, name: this.C.MGR.name, init: this.C.MGR.init, bg: this.C.MGR.bg, phone: '09121112233', label: 'مدیر گالری'};
  return [mgr].concat(s.staff.filter(p => p.active && p.phone).map(p => ({role: 'stf', me: p.id, name: p.name, init: p.init, bg: p.bg, phone: this.en(String(p.phone)).replace(/\D/g, ''), label: 'تیم ' + this.secNames(p).join('، ')})));
}
accountFor(d) { return this.accounts().find(a => a.phone === d) || null; }
loginSend() {
  const l = this.state.login; const d = this.en(l.phone).replace(/\D/g, '');
  if (!/^09\d{9}$/.test(d)) { this.setLogin({err: d ? 'شماره‌ی موبایل ۱۱ رقمی است و با ۰۹ شروع می‌شود.' : 'شماره‌ی موبایل را بنویسید.'}); return; }
  if (!this.accountFor(d)) { this.setLogin({err: 'این شماره در رستا ثبت نشده است. از مدیر بخواهید شما را به تیم اضافه کند.'}); return; }
  this.setLogin({step: 'code', code: '', err: '', timer: 60, phone: this.fa(d)});
  this.every('otp', () => { const t = this.state.login.timer; if (t <= 1) this.stop('otp'); this.setLogin({timer: Math.max(0, t - 1)}); }, 1000);
}
loginPick(a) { this.setLogin({phone: this.fa(a.phone), err: '', code: ''}); this.loginSend(); this.setLogin({code: this.fa('12345')}); }
loginVerify() {
  const l = this.state.login; const c = this.en(l.code).replace(/\D/g, '');
  if (c.length < 5) { this.setLogin({err: 'کد ۵ رقمی را کامل بنویسید.'}); return; }
  if (c !== '12345') { this.setLogin({err: 'کد درست نیست. دوباره امتحان کنید.'}); return; }
  const acc = this.accountFor(this.en(l.phone).replace(/\D/g, ''));
  if (!acc) { this.setLogin({step: 'phone', err: 'این شماره در رستا ثبت نشده است.'}); return; }
  this.stop('otp');
  const me = acc.me || this.state.me;
  this.setState({logged: true, role: acc.role, me, onlyMine: false, filter: {who: null, flag: null}, cb: null, dlg: null, m: {}, login: {step: 'phone', phone: '', code: '', err: '', timer: 0}});
  const h = this.homeFor(acc.role, me);
  this.go(h.page, Object.assign({mList: 1}, h));
  this.toast('خوش آمدید، ' + this.first(acc.role === 'mgr' ? 'mehdi' : me) + '.', {icon: 'i-check', ms: 2500});
}
logout() { this.stop('otp'); this.setState(Object.assign(this.closeAll(), {logged: false, cb: null, cbPop: null, dlg: null, m: {}, demo: false, acct: false, quick: null, addL: null, lEdit: null, login: {step: 'phone', phone: '', code: '', err: '', timer: 0}})); }
installApp() {
  const p = window.__rastaInstallPrompt;
  if (p) { p.prompt(); p.userChoice.then(r => { window.__rastaInstallPrompt = null; if (r && r.outcome === 'accepted') this.toast('رستا روی این دستگاه نصب شد.', {icon: 'i-monitor'}); }).catch(() => {}); return; }
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) { this.toast('رستا همین حالا به‌صورت برنامه باز است.', {icon: 'i-check'}); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  this.toast(ios ? 'در سافاری، دکمه‌ی اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید.' : 'از منوی مرورگر (⋮) گزینه‌ی «نصب برنامه» یا «Add to Home screen» را بزنید.', {icon: 'i-monitor', ms: 7000});
}
webVals() {
  const s = this.state;
  return {
    loginAccounts: this.accounts().map(a => ({name: a.name, init: a.init, bg: a.bg, label: a.label, phoneFa: this.fa(a.phone), pick: () => this.loginPick(a)})),
    showDemo: !!window.__rastaDemo,
    resetData: () => { if (window.__rastaReset) window.__rastaReset(); }
  };
}

renderVals() {
  const o = super.renderVals();
  o.themeCls = (o.themeCls || '').replace(' embed', '');
  o.installDesktop = () => { this.setState({hdr: {boards: false, create: false, notif: false, user: false}}); this.installApp(); };
  Object.assign(o, this.webVals());
  return o;
}
}
class RastaMobile extends RastaDesktop {
/* ================= mobile overrides ================= */
go(page, extra) { this.stop('play'); this.setState(Object.assign(this.closeAll(), {page, cb: null, cbPop: null, dlg: null, m: {}, quick: null, quickRefs: [], lEdit: null, addL: null, mList: 0, filter: {who: null, flag: null}}, extra || {})); }
goBoard(id) { this.go('board', {boardId: id}); }
goTeam(id) { this.go('team', {teamId: id}); }
setRole(r) { this.stop('play'); this.stop('rec'); this.go(this.homeFor(r).page, Object.assign({role: r, onlyMine: false, stage: 'app'}, this.homeFor(r))); }
setMe(pid) { this.go('team', Object.assign({me: pid, role: 'stf', onlyMine: false, stage: 'app', mList: 1}, this.homeFor('stf', pid))); }
pwaOpen() { this.setState({stage: 'splash'}); this.later('splash', () => this.setState({stage: 'app', pwaNew: false}), 1400); }
mListsOf(isTeam) {
  const s = this.state;
  if (isTeam) { const sec = this.sec(s.teamId) || this.myTeams()[0]; return sec ? sec.lists : []; }
  const b = this.board(s.boardId) || s.boards[0]; return b.lists;
}
mSaveAddList(isTeam) {
  const a = this.state.addL; if (!a) return;
  const t = a.text.trim(); if (!t) { this.saveAddList(); return; }
  const before = this.mListsOf(isTeam).map(l => l.id);
  this.saveAddList();
  const after = this.mListsOf(isTeam);
  const i = after.findIndex(l => !before.includes(l.id));
  this.setState({addL: null, mList: i < 0 ? this.state.mList : i});
}
mMoveList(ctx, id, dir) {
  const isTeam = ctx === 'team';
  this.moveList(ctx, id, dir);
  const i = this.mListsOf(isTeam).findIndex(l => l.id === id);
  if (i >= 0) this.setState({mList: i});
}
mTeamStrip(isTeam, idx) {
  if (isTeam) return {show: false, cols: []};
  const PL = this.mListsOf(false)[idx];
  const sec = PL && PL.kind === 'work' && PL.sec ? this.sec(PL.sec) : null;
  if (!sec) return {show: false, cols: []};
  const all = this.teamCards(sec.id).filter(c => ['doing','returned','wait'].includes(c.st));
  return {show: true, name: sec.name, go: () => this.go('team', {teamId: sec.id, mList: 0}),
    cols: sec.lists.map(T => ({name: T.role === 'in' ? 'صف تیم' : T.name, lbl: this.C.TLL[T.role] || 'L-s', n: this.fa(all.filter(c => (this.tlOf(c) || {}).id === T.id).length)}))};
}
mobLists(isTeam) {
  const s = this.state;
  const src = isTeam ? this.vTeam().tb : this.vBoard().bd;
  const lists = src.lists || [];
  const idx = Math.max(0, Math.min(s.mList || 0, lists.length - 1));
  const L = lists[idx] || {cards: [], qRefs: []};
  const ctx = isTeam ? 'team' : 'pipe';
  const addOpen = !!(s.addL && s.addL.ctx === ctx);
  const al = Object.assign({}, src.al || {}, {save: () => this.mSaveAddList(isTeam), key: e => { if (e.key === 'Enter') { e.preventDefault(); this.mSaveAddList(isTeam); } if (e.key === 'Escape') this.setState({addL: null}); }});
  return {src, idx, L, ctx, mb: {
    tabs: lists.map((l, i) => ({cls: 'ltab' + (i === idx && !addOpen ? ' on' : ''), on: i === idx && !addOpen, name: l.name, n: l.n, pick: () => this.setState({mList: i, addL: null, quick: null, lEdit: null, lMenu: null})})),
    canAddList: !!src.canAddList, addTab: () => this.openAddList(ctx), addTabCls: 'ltab add' + (addOpen ? ' on' : ''), addOpen, al,
    cur: L, hasCur: lists.length > 0, showList: !addOpen && lists.length > 0, team: this.mTeamStrip(isTeam, idx)}};
}
renderVals() {
  const s = this.state, isMgr = s.role === 'mgr';
  const ok = isMgr ? ['home','boards','board','team','reviews','today','notifs'] : ['team','score','notifs'];
  const page = ok.includes(s.page) ? s.page : ok[0];
  const pg = {}; ['home','boards','board','team','reviews','today','notifs','score'].forEach(k => pg[k] = page === k);
  const card = s.cb != null && !!this.get(s.cb);
  const teams = this.myTeams();
  const out = {
    themeCls: s.dark ? 'dark' : '', isMgr, isStf: !isMgr, pg, pgBoardLike: pg.board || pg.team, offline: s.offline, trial: s.trial,
    roleMgrCls: isMgr ? 'on' : '', roleStfCls: isMgr ? '' : 'on', setMgr: () => this.setRole('mgr'), setStf: () => this.setRole('stf'),
    me: s.me, onMe: e => this.setMe(e.target.value),
    meOpts: s.staff.filter(p => p.active).map(p => ({id: p.id, name: p.name})),
    clock: this.hm(s.now), todayFull: this.dFull(s.today), myFirst: this.first(s.me),
    stBrowser: s.stage === 'browser', stHome: s.stage === 'home', stSplash: s.stage === 'splash', stApp: s.stage === 'app',
    inCard: card, notCard: !card,
    mTitle: isMgr && page === 'board' ? (this.board(s.boardId) || s.boards[0]).name : isMgr && page === 'team' ? 'تیم ' + ((this.sec(s.teamId) || {}).name || '') : {home: 'خانه', boards: 'تابلوها', board: 'تابلوها', team: 'تابلوی تیم', reviews: 'صف بررسی', today: 'گزارش امروز', notifs: 'اعلان‌ها', score: 'امتیاز من'}[page],
    abBack: isMgr && (page === 'board' || page === 'team'), abLogo: !(isMgr && (page === 'board' || page === 'team')), goBoards: () => this.go('boards'), mgrFirst: this.first('mehdi'), mgrGreet: this.C.MGR.greet,
    newOrder: () => this.openCreate('orders'),
    quickText: s.quickText, onQuick: e => this.setState({quickText: e.target.value}), quickAdd: () => this.quickAdd(), quickClose: () => this.closeQuick(), quickRef: () => this.addQuickRef(),
    quickKey: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.quickAdd(); } },
    pwa: {install: () => this.setState({stage: 'home', pwaNew: true}), skip: () => this.setState({stage: 'app'}), open: () => this.pwaOpen(), isNew: !!s.pwaNew,
      apps: [['#34A853','تماس'],['#1A73E8','پیام‌ها'],['#25D366','واتساپ'],['#EA4335','دوربین'],['#FBBC04','گالری'],['#5F6368','تنظیمات'],['#0088CC','تلگرام'],['#7B61FF','تقویم']].map(a => ({bg: a[0], name: a[1]}))},
    jumps: [
      {icon: 'i-board', title: 'تابلوی تیم و گزارش یک‌ضربه‌ای', sub: 'پرسنل · مریم، تیم اسکچ', go: () => this.setMe('maryam')},
      {icon: 'i-user-plus', title: 'برداشتن کار از صف تیم', sub: 'پرسنل · کاری که به کل تیم سپرده شده', go: () => { this.setMe('maryam'); this.setState({mList: 0}); this.openCard(154); }},
      {icon: 'i-camera', title: 'ارسال نسخه با دوربین', sub: 'پرسنل · الهام، کارت برگشتی با بازخورد صوتی', go: () => { this.setMe('elham'); this.openCard(149); }},
      {icon: 'i-review', title: 'بررسی و تأیید روی گوشی', sub: 'مدیر · نسخه‌ی تازه‌ی «انگشتر سولیتر»', go: () => { this.setRole('mgr'); this.openCard(145); }},
      {icon: 'i-users', title: 'سپردن به چند نفر یا کل تیم', sub: 'مدیر · مستقیم به سه‌بعدی، با فایل و پیام صوتی', go: () => { this.setRole('mgr'); this.openCard(152); this.openAssign(152, 'queue'); }},
      {icon: 'i-plus', title: 'کارت تازه با عکس نمونه', sub: 'مدیر · افزودن کارت در صف و لیست تازه روی تابلو', go: () => { this.setRole('mgr'); this.go('board', {boardId: 'orders', mList: 0}); this.openQuick('pipe', this.board('orders').lists[0].id); }},
      {icon: 'i-download', title: 'مسیر نصب روی اندروید', sub: 'از مرورگر تا آیکون روی صفحه‌ی گوشی', go: () => this.setState({stage: 'browser', cb: null, dlg: null})}
    ]
  };
  const nf = this.vNotifs(), meP = this.person(s.me);
  Object.assign(out, nf, {user: isMgr ? {bg: this.C.MGR.bg, init: this.C.MGR.init, name: this.C.MGR.name} : {bg: meP.bg, init: meP.init, name: meP.name}});
  const waitN = this.liveCards().filter(c => c.st === 'wait').length;
  const myTeam = this.homeFor('stf');
  let probN = 0; this.liveCards().forEach(c => (c.whos || []).forEach(pid => { const r = this.repOf(c, pid); if (r.active && (r.st === 'stuck' || r.st === 'behind')) probN++; }));
  const items = isMgr ? [['home','خانه','i-home',0],['boards','تابلوها','i-board',0],['reviews','بررسی','i-review',waitN],['today','گزارش امروز','i-report',probN]] : [['team','تابلوی تیم','i-board',this.activeOf(s.me).length],['score','امتیاز','i-award',0],['notifs','اعلان‌ها','i-bell',nf.unreadCount]];
  const bnOn = k => page === k || (k === 'boards' && (page === 'board' || page === 'team'));
  out.bnav = items.map(b => ({cls: 'bn' + (bnOn(b[0]) ? ' on' : ''), cur: bnOn(b[0]) ? 'page' : 'false', go: () => b[0] === 'team' ? this.go('team', Object.assign({mList: 1}, myTeam)) : this.go(b[0]), icon: b[2], label: b[1], hasN: b[3] > 0, n: this.fa(b[3])}));
  out.bell = {show: isMgr, go: () => this.go('notifs'), hasN: nf.unreadCount > 0, n: this.fa(nf.unreadCount)};
  out.fab = {show: isMgr && !card && (page === 'home' || page === 'boards'), go: () => this.openCreate('orders')};
  Object.assign(out, this.vCard(), this.vDlg(), this.vHome(), this.vReviews(), this.vScore(), this.vQm(), this.vCal(), this.vHub(), this.vBoardsHub());
  const misc = this.vMisc();
  out.toast = misc.toast;
  out.demo = {items: misc.demo.items.filter((d, i) => [3, 4, 5, 6, 7].includes(i))};
  // card: bottom sheets instead of popovers
  if (out.cb.open) {
    const c = this.get(s.cb), titles = {menu: c.title, dates: 'تاریخ و ساعت تحویل', urgent: 'علامت فوری', move: 'انتقال کارت', team: 'ارسال به واحد دیگر', cancel: 'لغو و بایگانی'};
    const addAtt = out.cb.addAtt;
    Object.assign(out.cb, {pMenu: s.cbPop === 'menu', popMenu: () => this.setState({cbPop: 'menu'}), anyPop: !!titles[s.cbPop], popTitle: titles[s.cbPop] || '',
      sheetBg: e => { if (e.target === e.currentTarget) this.setState({cbPop: null}); }, addAtt: () => { this.setState({cbPop: null}); addAtt(); }});
  } else Object.assign(out.cb, {anyPop: false, pMenu: false});
  // quick menu as a sheet
  const qc = s.qm ? this.get(s.qm.cid) : null;
  out.qmTitle = qc ? qc.title : ''; out.qmClose = () => this.setState({qm: null}); out.qmBg = e => { if (e.target === e.currentTarget) this.setState({qm: null}); };
  // board / team board with list tabs
  const isTeam = page === 'team';
  const ml = (pg.board || pg.team) ? this.mobLists(isTeam) : {mb: {tabs: [], cur: {cards: [], qRefs: []}, al: {}, showList: false, addOpen: false}, src: {bg: '#2B2320'}, ctx: 'pipe', L: {}};
  out.mb = ml.mb;
  out.mbg = ml.src.bg || '#2B2320';
  out.tb = isTeam ? ml.src : {rp: {show: false, rows: []}, tabs: []};
  const curL = (pg.board || pg.team) ? this.mListsOf(isTeam)[ml.idx] : null;
  const lmOpen = !!(s.lMenu && curL && s.lMenu.id === curL.id);
  out.lmenu = {open: lmOpen, bg: e => { if (e.target === e.currentTarget) this.setState({lMenu: null}); },
    mvRight: () => this.mMoveList(ml.ctx, s.lMenu ? s.lMenu.id : null, -1), mvLeft: () => this.mMoveList(ml.ctx, s.lMenu ? s.lMenu.id : null, 1)};
  out.boardChips = isMgr ? s.boards.map(b => ({cls: 'btn glass' + (page === 'board' && b.id === s.boardId ? ' on' : ''), name: b.name, pick: () => this.go('board', {boardId: b.id})})) : [];
  out.teamChips = (isMgr ? s.sections : teams).map(x => ({cls: 'btn glass' + (page === 'team' && x.id === s.teamId ? ' on' : ''), name: 'تیم ' + x.name, pick: () => this.go('team', {teamId: x.id, mList: isMgr ? 0 : 1})}));
  if (isMgr) { out.boardChips = []; out.teamChips = []; }
  out.chipSep = out.boardChips.length > 0 && out.teamChips.length > 0;
  out.hasChips = out.boardChips.length + out.teamChips.length > 1;
  return out;
}
}
class RastaMobileWeb extends RastaMobile {
/* ===== web build: real accounts, install, demo data ===== */
accounts() {
  const s = this.state;
  const mgr = {role: 'mgr', me: null, name: this.C.MGR.name, init: this.C.MGR.init, bg: this.C.MGR.bg, phone: '09121112233', label: 'مدیر گالری'};
  return [mgr].concat(s.staff.filter(p => p.active && p.phone).map(p => ({role: 'stf', me: p.id, name: p.name, init: p.init, bg: p.bg, phone: this.en(String(p.phone)).replace(/\D/g, ''), label: 'تیم ' + this.secNames(p).join('، ')})));
}
accountFor(d) { return this.accounts().find(a => a.phone === d) || null; }
loginSend() {
  const l = this.state.login; const d = this.en(l.phone).replace(/\D/g, '');
  if (!/^09\d{9}$/.test(d)) { this.setLogin({err: d ? 'شماره‌ی موبایل ۱۱ رقمی است و با ۰۹ شروع می‌شود.' : 'شماره‌ی موبایل را بنویسید.'}); return; }
  if (!this.accountFor(d)) { this.setLogin({err: 'این شماره در رستا ثبت نشده است. از مدیر بخواهید شما را به تیم اضافه کند.'}); return; }
  this.setLogin({step: 'code', code: '', err: '', timer: 60, phone: this.fa(d)});
  this.every('otp', () => { const t = this.state.login.timer; if (t <= 1) this.stop('otp'); this.setLogin({timer: Math.max(0, t - 1)}); }, 1000);
}
loginPick(a) { this.setLogin({phone: this.fa(a.phone), err: '', code: ''}); this.loginSend(); this.setLogin({code: this.fa('12345')}); }
loginVerify() {
  const l = this.state.login; const c = this.en(l.code).replace(/\D/g, '');
  if (c.length < 5) { this.setLogin({err: 'کد ۵ رقمی را کامل بنویسید.'}); return; }
  if (c !== '12345') { this.setLogin({err: 'کد درست نیست. دوباره امتحان کنید.'}); return; }
  const acc = this.accountFor(this.en(l.phone).replace(/\D/g, ''));
  if (!acc) { this.setLogin({step: 'phone', err: 'این شماره در رستا ثبت نشده است.'}); return; }
  this.stop('otp');
  const me = acc.me || this.state.me;
  this.setState({logged: true, role: acc.role, me, onlyMine: false, filter: {who: null, flag: null}, cb: null, dlg: null, m: {}, login: {step: 'phone', phone: '', code: '', err: '', timer: 0}});
  const h = this.homeFor(acc.role, me);
  this.go(h.page, Object.assign({mList: 1}, h));
  this.toast('خوش آمدید، ' + this.first(acc.role === 'mgr' ? 'mehdi' : me) + '.', {icon: 'i-check', ms: 2500});
}
logout() { this.stop('otp'); this.setState(Object.assign(this.closeAll(), {logged: false, cb: null, cbPop: null, dlg: null, m: {}, demo: false, acct: false, quick: null, addL: null, lEdit: null, login: {step: 'phone', phone: '', code: '', err: '', timer: 0}})); }
installApp() {
  const p = window.__rastaInstallPrompt;
  if (p) { p.prompt(); p.userChoice.then(r => { window.__rastaInstallPrompt = null; if (r && r.outcome === 'accepted') this.toast('رستا روی این دستگاه نصب شد.', {icon: 'i-monitor'}); }).catch(() => {}); return; }
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) { this.toast('رستا همین حالا به‌صورت برنامه باز است.', {icon: 'i-check'}); return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  this.toast(ios ? 'در سافاری، دکمه‌ی اشتراک‌گذاری را بزنید و «Add to Home Screen» را انتخاب کنید.' : 'از منوی مرورگر (⋮) گزینه‌ی «نصب برنامه» یا «Add to Home screen» را بزنید.', {icon: 'i-monitor', ms: 7000});
}
webVals() {
  const s = this.state;
  return {
    loginAccounts: this.accounts().map(a => ({name: a.name, init: a.init, bg: a.bg, label: a.label, phoneFa: this.fa(a.phone), pick: () => this.loginPick(a)})),
    showDemo: !!window.__rastaDemo,
    resetData: () => { if (window.__rastaReset) window.__rastaReset(); }
  };
}

constructor(p) { super(p); Object.assign(this.state, {stage: 'app', pwaNew: false, mList: 1, acct: false}); }
renderVals() {
  const o = super.renderVals();
  const s = this.state, isMgr = s.role === 'mgr', me = this.person(s.me);
  Object.assign(o, this.vLogin(), this.webVals(), {loggedIn: !!s.logged, notLogged: !s.logged});
  const close = () => this.setState({acct: false});
  o.acct = {open: !!s.acct, toggle: () => this.setState({acct: !s.acct, qm: null, lMenu: null}), close, bg: e => { if (e.target === e.currentTarget) close(); },
    role: isMgr ? 'مدیر گالری' : 'تیم ' + this.secNames(me).join('، '),
    dark: () => this.setState({dark: !s.dark}), darkIcon: s.dark ? 'i-sun' : 'i-moon', darkLabel: s.dark ? 'پوسته‌ی روشن' : 'پوسته‌ی تیره',
    install: () => { close(); this.installApp(); },
    logout: () => { this.setState({acct: false}); this.logout(); }};
  return o;
}
}
window.RastaDesktopWeb = RastaDesktopWeb; window.RastaMobileWeb = RastaMobileWeb;
window.RASTA_T_DESKTOP = "<div class=\"tr {{themeCls}}\" dir=\"rtl\" lang=\"fa\">\n\n<sc-if value=\"{{notLogged}}\" hint-placeholder-val=\"{{ false }}\">\n<main class=\"login\">\n<div class=\"login-c\">\n<svg class=\"lg-logo\" role=\"img\" aria-label=\"گالری طلای رستا\"><use href=\"#lg-full\"></use></svg>\n<h1 class=\"h1\">ورود به رستا</h1>\n<div class=\"lg-orn\" aria-hidden=\"true\"><svg><use href=\"#lg-mark\"></use></svg></div>\n<sc-if value=\"{{login.phoneStep}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld {{login.errCls}}\" style=\"width:100%;text-align:right\"><label for=\"lg-p\">شماره‌ی موبایل</label><input id=\"lg-p\" class=\"inp num\" inputmode=\"numeric\" value=\"{{login.phone}}\" onChange=\"{{onLoginPhone}}\" placeholder=\"۰۹۱۲۳۴۵۶۷۸۹\"><sc-if value=\"{{login.hasErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>{{login.err}}</p></sc-if></div>\n<button class=\"btn btn-p btn-lg btn-w\" onClick=\"{{loginSend}}\">دریافت کد</button>\n<div class=\"lg-acc\"><div class=\"lg-acc-h\"><span class=\"flab\">حساب‌های نمایشی</span><span class=\"xs subtle\">برای ورود روی یکی بزنید</span></div>\n<sc-for list=\"{{loginAccounts}}\" as=\"a\" hint-placeholder-count=\"4\"><button class=\"pick lg-a\" onClick=\"{{a.pick}}\"><span class=\"av\" style=\"background: {{a.bg}}\">{{a.init}}</span><span class=\"grow lg-a-t\"><b class=\"small\">{{a.name}}</b><span class=\"xs subtle\">{{a.label}}</span></span><span class=\"xs subtle num\" dir=\"ltr\">{{a.phoneFa}}</span></button></sc-for></div>\n</sc-if>\n<sc-if value=\"{{login.codeStep}}\" hint-placeholder-val=\"{{ false }}\">\n<p class=\"small muted\">کد به <b class=\"num\">{{login.phone}}</b> پیامک شد · <button class=\"btn btn-s\" style=\"height:24px;padding:0 6px\" onClick=\"{{loginBack}}\">ویرایش</button></p>\n<div class=\"fld {{login.errCls}}\" style=\"width:100%;text-align:right\"><label for=\"lg-c\">کد ۵ رقمی</label><input id=\"lg-c\" class=\"inp otp num\" inputmode=\"numeric\" autocomplete=\"one-time-code\" value=\"{{login.code}}\" onChange=\"{{onLoginCode}}\"><sc-if value=\"{{login.hasErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>{{login.err}}</p></sc-if><p class=\"xs subtle\">کد نمایشی: ۱۲۳۴۵</p></div>\n<button class=\"btn btn-p btn-lg btn-w\" onClick=\"{{loginVerify}}\">ورود</button>\n<sc-if value=\"{{login.waiting}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle num\">ارسال دوباره تا {{login.timerTxt}}</span></sc-if>\n<sc-if value=\"{{login.canResend}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-s\" onClick=\"{{loginResend}}\"><svg class=\"ic\"><use href=\"#i-refresh\"></use></svg>ارسال دوباره‌ی کد</button></sc-if>\n</sc-if>\n<div class=\"lg-foot\"><a class=\"lg-guide\" href=\"guide.html\"><svg class=\"ic\"><use href=\"#i-desc\"></use></svg>راهنمای استفاده از رستا</a><span class=\"xs subtle\">طراحی و توسعه: سکان</span><button class=\"lg-reset\" onClick=\"{{resetData}}\">بازنشانی داده‌های نمایشی</button></div>\n</div>\n</main>\n</sc-if>\n\n<sc-if value=\"{{loggedIn}}\" hint-placeholder-val=\"{{ true }}\">\n<header class=\"top\">\n<button class=\"logo btn btn-s\" style=\"height:40px;padding:0 4px\" onClick=\"{{goHome}}\" aria-label=\"خانه\"><img src=\"assets/img/rasta-logo-tile.svg\" alt=\"رستا\"></button>\n<sc-if value=\"{{isMgr}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"rel\"><button class=\"btn btn-p\" onClick=\"{{hdr.toggleCreate}}\" aria-expanded=\"{{hdr.createOpen}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>ایجاد</button>\n<sc-if value=\"{{hdr.createOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:40px;right:0\">\n<div class=\"pop-h\"><b>ایجاد</b></div>\n<button class=\"mi\" onClick=\"{{hdr.newOrder}}\"><svg class=\"ic\"><use href=\"#a-ring\"></use></svg><span class=\"grow\"><b>سفارش ساخت</b><span class=\"xs subtle\" style=\"display:block\">با عکس نمونه، در صف سفارش‌ها</span></span></button>\n<button class=\"mi\" onClick=\"{{hdr.newContent}}\"><svg class=\"ic\"><use href=\"#i-card\"></use></svg><span class=\"grow\"><b>کارت محتوا</b><span class=\"xs subtle\" style=\"display:block\">در ایده‌های تولید محتوا</span></span></button>\n<div class=\"msep\"></div>\n<button class=\"mi\" onClick=\"{{hdr.newSection}}\"><svg class=\"ic\"><use href=\"#i-users\"></use></svg>تیم تازه</button>\n<button class=\"mi\" onClick=\"{{hdr.newBoard}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg>تابلوی تازه</button>\n<button class=\"mi\" onClick=\"{{hdr.newTeam}}\"><svg class=\"ic\"><use href=\"#i-team\"></use></svg>واحد تازه</button>\n</div></sc-if>\n</div>\n</sc-if>\n<span class=\"grow\"></span>\n<div class=\"search rel\" role=\"search\"><svg class=\"ic\"><use href=\"#i-search\"></use></svg><input type=\"search\" aria-label=\"جست‌وجوی کد یا عنوان\" placeholder=\"جست‌وجو\" value=\"{{search}}\" onChange=\"{{onSearch}}\">\n<sc-if value=\"{{searchOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:38px;right:0;width:100%;min-width:260px;padding:6px\">\n<sc-for list=\"{{searchRes}}\" as=\"r\" hint-placeholder-count=\"3\"><button class=\"mi\" style=\"height:auto;padding:6px 8px\" onClick=\"{{r.open}}\"><span class=\"mini\" style=\"width:32px;height:32px\"><svg class=\"art art-photo\"><use href=\"#{{r.art}}\"></use></svg></span><span class=\"grow\" style=\"line-height:1.5\"><span style=\"display:block\">{{r.title}}</span><span class=\"xs subtle num\">{{r.sub}}</span></span></button></sc-for>\n<sc-if value=\"{{searchNone}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small subtle\" style=\"padding:8px\">چیزی پیدا نشد.</p></sc-if>\n</div></sc-if>\n</div>\n<div class=\"rel\">\n<button class=\"ib\" aria-label=\"اعلان‌ها\" aria-expanded=\"{{hdr.notifOpen}}\" onClick=\"{{hdr.toggleNotif}}\"><svg class=\"ic md\"><use href=\"#i-bell\"></use></svg><sc-if value=\"{{hasUnread}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"nbadge num\">{{unreadN}}</span></sc-if></button>\n<sc-if value=\"{{hdr.notifOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:40px;left:0;width:380px;max-width:calc(100vw - 24px);padding:8px\">\n<div class=\"row sb\" style=\"padding:4px 8px 8px\"><b>اعلان‌ها</b><div class=\"seg\"><button class=\"{{nfAllCls}}\" onClick=\"{{nfAll}}\">همه</button><button class=\"{{nfActCls}}\" onClick=\"{{nfAct}}\">نیاز به اقدام</button></div></div>\n<div style=\"max-height:420px;overflow:auto;display:flex;flex-direction:column;gap:2px\">\n<sc-for list=\"{{notifList}}\" as=\"n\" hint-placeholder-count=\"4\"><button class=\"mi\" style=\"height:auto;padding:8px;align-items:flex-start\" onClick=\"{{n.open}}\"><span class=\"{{n.dotCls}}\" style=\"width:8px;height:8px;border-radius:50%;margin-top:8px;flex:none\"></span><span class=\"grow\" style=\"line-height:1.6;white-space:normal\"><span style=\"display:block\">{{n.text}}</span><span class=\"xs subtle\">{{n.time}}</span></span></button></sc-for>\n<sc-if value=\"{{notifEmpty}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small subtle\" style=\"padding:16px;text-align:center\">اعلانی نیست.</p></sc-if>\n</div>\n<div class=\"msep\"></div>\n<button class=\"mi\" onClick=\"{{markAllRead}}\"><svg class=\"ic\"><use href=\"#i-check\"></use></svg>همه خوانده شد</button>\n</div></sc-if>\n</div>\n<div class=\"rel\">\n<button class=\"ib\" style=\"width:auto;padding:0 2px\" aria-label=\"منوی حساب\" aria-expanded=\"{{hdr.userOpen}}\" onClick=\"{{hdr.toggleUser}}\"><span class=\"av\" style=\"background: {{user.bg}}\">{{user.init}}</span></button>\n<sc-if value=\"{{hdr.userOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:40px;left:0;width:260px;padding:8px\">\n<div class=\"row\" style=\"padding:6px 8px 10px\"><span class=\"av lg\" style=\"background: {{user.bg}}\">{{user.init}}</span><div style=\"line-height:1.5\"><b>{{user.name}}</b><div class=\"xs subtle\">{{user.role}}</div></div></div>\n<div class=\"msep\"></div>\n<button class=\"mi\" onClick=\"{{toggleDark}}\"><svg class=\"ic\"><use href=\"#{{darkIcon}}\"></use></svg>{{darkLabel}}</button>\n<button class=\"mi\" onClick=\"{{installDesktop}}\"><svg class=\"ic\"><use href=\"#i-monitor\"></use></svg>نصب برنامه روی این دستگاه</button>\n<a class=\"mi\" href=\"install.html\" style=\"text-decoration:none\"><svg class=\"ic\"><use href=\"#i-mobile\"></use></svg>راهنمای نصب روی گوشی</a>\n<a class=\"mi\" href=\"guide.html\" style=\"text-decoration:none\"><svg class=\"ic\"><use href=\"#i-desc\"></use></svg>راهنمای استفاده</a>\n<a class=\"mi\" href=\"./?ui=mobile\" style=\"text-decoration:none\"><svg class=\"ic\"><use href=\"#i-mobile\"></use></svg>نمای گوشی</a>\n<button class=\"mi\" onClick=\"{{resetData}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>بازنشانی داده‌های نمایشی</button>\n<div class=\"msep\"></div>\n<button class=\"mi dan\" onClick=\"{{logout}}\"><svg class=\"ic\"><use href=\"#i-logout\"></use></svg>خروج</button>\n</div></sc-if>\n</div>\n</header>\n<sc-if value=\"{{offline}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"banner\" role=\"status\"><svg class=\"ic\"><use href=\"#i-wifi-off\"></use></svg>اتصال برقرار نیست؛ آخرین اطلاعات نمایش داده می‌شود و تغییرات پس از اتصال ارسال می‌شوند.</div></sc-if>\n<div class=\"shell\">\n<aside class=\"{{sideCls}}\" aria-label=\"فضای کار\">\n<div class=\"ws\"><img src=\"assets/img/rasta-logo.png\" alt=\"\"><sc-if value=\"{{sideOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"grow\" style=\"line-height:1.4\"><b class=\"small\">گالری طلای رستا</b><div class=\"xs subtle\">فضای کار</div></div></sc-if><button class=\"ib side-tg\" aria-label=\"{{sideTgLabel}}\" title=\"{{sideTgLabel}}\" onClick=\"{{toggleSide}}\"><svg class=\"ic\"><use href=\"#{{sideTgIcon}}\"></use></svg></button></div>\n<sc-for list=\"{{nav}}\" as=\"n\" hint-placeholder-count=\"6\"><button class=\"{{n.cls}}\" onClick=\"{{n.go}}\" aria-current=\"{{n.cur}}\" aria-label=\"{{n.label}}\" title=\"{{n.label}}\"><svg class=\"ic md\"><use href=\"#{{n.icon}}\"></use></svg><span class=\"nav-l\">{{n.label}}</span><sc-if value=\"{{n.hasN}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"nav-n num\">{{n.n}}</span></sc-if></button></sc-for>\n<sc-if value=\"{{sideOpen}}\" hint-placeholder-val=\"{{ false }}\">\n<sc-if value=\"{{hasBoardsNav}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"nav-h\"><span>تابلوها</span><button class=\"ib\" style=\"width:28px;height:28px\" aria-label=\"تابلوی تازه\" onClick=\"{{hdr.newBoard}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg></button></div>\n<sc-for list=\"{{boardsNav}}\" as=\"b\" hint-placeholder-count=\"2\"><button class=\"{{b.cls}}\" onClick=\"{{b.go}}\" aria-current=\"{{b.cur}}\"><span class=\"bsq\" style=\"background: {{b.bg}}\"></span><span>{{b.name}}</span></button></sc-for>\n</sc-if>\n<div class=\"nav-h\"><span>{{teamsHead}}</span><sc-if value=\"{{isMgr}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib\" style=\"width:28px;height:28px\" aria-label=\"تیم تازه\" onClick=\"{{hdr.newSection}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg></button></sc-if></div>\n<sc-for list=\"{{teamsNav}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" onClick=\"{{t.go}}\" aria-current=\"{{t.cur}}\"><span class=\"bsq\" style=\"background: {{t.bg}}\"></span><span>{{t.name}}</span><sc-if value=\"{{t.hasN}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"nav-n num\">{{t.n}}</span></sc-if></button></sc-for>\n</sc-if>\n</aside>\n<div class=\"main\">\n<sc-if value=\"{{pageLoading}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\" aria-busy=\"true\"><div class=\"sk\" style=\"height:28px;width:220px\"></div><div class=\"row\" style=\"gap:12px;align-items:flex-start\"><sc-for list=\"{{skCols}}\" as=\"s\" hint-placeholder-count=\"3\"><div style=\"width:268px;background:var(--list);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px\"><div class=\"sk\" style=\"height:18px;width:50%\"></div><sc-for list=\"{{s.cards}}\" as=\"k\" hint-placeholder-count=\"2\"><div style=\"background:var(--card);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--shCard)\"><div class=\"sk\" style=\"height:14px;width:40%\"></div><div class=\"sk\" style=\"height:14px;width:85%\"></div></div></sc-for></div></sc-for></div></div>\n</sc-if>\n<sc-if value=\"{{pageError}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\"><div class=\"box empty\" style=\"padding:64px 20px\"><svg class=\"ic xl\" style=\"color:var(--danger)\"><use href=\"#i-wifi-off\"></use></svg><b>ارتباط برقرار نشد</b><span class=\"small\">اینترنت را بررسی کنید و دوباره امتحان کنید.</span><button class=\"btn btn-p\" onClick=\"{{retry}}\"><svg class=\"ic\"><use href=\"#i-refresh\"></use></svg>تلاش دوباره</button></div></div>\n</sc-if>\n<sc-if value=\"{{pageOk}}\" hint-placeholder-val=\"{{ true }}\">\n\n<sc-if value=\"{{pg.home}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page hub\">\n<div class=\"hub-h\"><div><span class=\"hub-k\">گالری طلای رستا</span><h1 class=\"h1\">{{mgrGreet}}</h1><span class=\"small subtle\">{{todayFull}}</span></div><button class=\"btn btn-p btn-lg\" onClick=\"{{hdr.newOrder}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>سفارش تازه</button></div>\n<div class=\"spokes\"><sc-for list=\"{{hub.main}}\" as=\"t\" hint-placeholder-count=\"4\"><button class=\"{{t.cls}}\" onClick=\"{{t.go}}\"><span class=\"spoke-top\"><span class=\"spoke-i\" style=\"background: {{t.bg}}\"><svg class=\"ic md\"><use href=\"#{{t.icon}}\"></use></svg></span><span class=\"spoke-t\">{{t.title}}</span><svg class=\"ic spoke-c\"><use href=\"#i-chev-l\"></use></svg></span><b class=\"spoke-n num\">{{t.n}}</b><span class=\"spoke-s\">{{t.sub}}</span><sc-if value=\"{{t.hasAlert}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill {{t.alertCls}} spoke-a\">{{t.alert}}</span></sc-if></button></sc-for></div>\n<section class=\"box now\"><div class=\"now-h\"><h2 class=\"h2\"><svg class=\"ic md\"><use href=\"#i-zap\"></use></svg>الان مهم</h2><sc-if value=\"{{hub.hasMore}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"btn btn-s\" onClick=\"{{hub.toggleAll}}\">{{hub.allLabel}}</button></sc-if></div>\n<sc-for list=\"{{hub.now}}\" as=\"a\" hint-placeholder-count=\"3\"><div class=\"rowc\"><span class=\"mini\"><svg class=\"art art-photo\"><use href=\"#{{a.art}}\"></use></svg></span><div class=\"grow\" style=\"line-height:1.5\"><button class=\"tlink\" onClick=\"{{a.open}}\">{{a.title}}</button><div class=\"row xs subtle\" style=\"gap:6px\"><span class=\"num\">{{a.code}}</span><span class=\"pill {{a.pill}}\" style=\"height:20px\">{{a.why}}</span></div></div><button class=\"btn\" onClick=\"{{a.go}}\">{{a.btn}}</button></div></sc-for>\n<sc-if value=\"{{hub.nowEmpty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"empty\" style=\"padding:24px\"><svg class=\"ic xl\" style=\"color:var(--ok)\"><use href=\"#i-check-c\"></use></svg><b>کاری منتظر شما نیست</b></div></sc-if>\n</section>\n<div class=\"spokes2\"><sc-for list=\"{{hub.more}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"spoke2\" onClick=\"{{t.go}}\"><svg class=\"ic md\"><use href=\"#{{t.icon}}\"></use></svg>{{t.title}}<svg class=\"ic spoke-c\"><use href=\"#i-chev-l\"></use></svg></button></sc-for></div>\n</div>\n</sc-if>\n\n<sc-if value=\"{{pg.boards}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\">\n<div class=\"row sb wrap\"><h1 class=\"h1\">تابلوها</h1><button class=\"btn\" onClick=\"{{bh.newBoard}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>تابلوی تازه</button></div>\n<section class=\"bh-sec\"><h2 class=\"h2\"><svg class=\"ic md\"><use href=\"#i-layers\"></use></svg>تابلوی واحدها</h2><p class=\"small subtle\">مسیر کامل هر سفارش یا کار، از صف تا تحویل.</p>\n<div class=\"tiles big\"><sc-for list=\"{{bh.boards}}\" as=\"b\" hint-placeholder-count=\"2\"><button class=\"tile\" style=\"background: {{b.bg}}\" onClick=\"{{b.go}}\"><span>{{b.name}}</span><span class=\"tile-f\"><span class=\"xs\" style=\"font-weight:500;opacity:.92\">{{b.sub}}</span><sc-if value=\"{{b.hasAlert}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"tile-a\">{{b.alert}}</span></sc-if></span></button></sc-for></div></section>\n<section class=\"bh-sec\"><h2 class=\"h2\"><svg class=\"ic md\"><use href=\"#i-board\"></use></svg>تابلوی تیم‌ها</h2><p class=\"small subtle\">همه‌ی ستون‌های هر تیم: صف تیم، در حال انجام، انجام شد و ستون‌هایی که خود تیم ساخته.</p>\n<div class=\"tiles big\"><sc-for list=\"{{bh.teams}}\" as=\"b\" hint-placeholder-count=\"3\"><button class=\"tile\" style=\"background: {{b.bg}}\" onClick=\"{{b.go}}\"><span>{{b.name}}</span><span class=\"tile-f\"><span class=\"xs\" style=\"font-weight:500;opacity:.92\">{{b.sub}}</span><sc-if value=\"{{b.hasAlert}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"tile-a\">{{b.alert}}</span></sc-if></span></button></sc-for><button class=\"tile add\" onClick=\"{{bh.newTeam}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>تیم تازه</button></div></section>\n</div>\n</sc-if>\n\n<sc-if value=\"{{pg.today}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page td-page\">\n<div class=\"hub-h td-h\"><div class=\"td-hl\"><span class=\"hub-k\">گزارش امروز · {{todayFull}}</span><h1 class=\"h1\">{{td.headline}}</h1><span class=\"small subtle\">{{td.sub}}</span></div><sc-if value=\"{{td.hasBar}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"td-bar\" role=\"img\" aria-label=\"{{td.sub}}\"><sc-for list=\"{{td.bar}}\" as=\"b\" hint-placeholder-count=\"4\"><i class=\"{{b.cls}}\" style=\"flex: {{b.n}}\" title=\"{{b.t}}\"></i></sc-for></div></sc-if></div>\n<div class=\"td-tiles\"><sc-for list=\"{{td.tiles}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\" aria-pressed=\"{{t.cur}}\"><span class=\"spoke-i\" style=\"background: {{t.bg}}\"><svg class=\"ic md\"><use href=\"#{{t.icon}}\"></use></svg></span><span class=\"tdt-b\"><b class=\"tdt-n num\">{{t.n}}</b><span class=\"tdt-l\">{{t.label}}</span><span class=\"tdt-s\">{{t.sub}}</span></span></button></sc-for></div>\n<sc-if value=\"{{td.filtered}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"td-f\"><span class=\"small subtle\">فقط «{{td.fName}}» نمایش داده می‌شود</span><button class=\"btn btn-s\" onClick=\"{{td.showAll}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg>نمایش همه</button></div></sc-if>\n<sc-if value=\"{{td.attn.show}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"tsec attn\" aria-label=\"نیاز به توجه\">\n<div class=\"tsec-h\"><span class=\"tsec-d\" style=\"background:var(--danger)\"></span><h2 class=\"h2\">نیاز به توجه</h2><span class=\"tsec-n num\">{{td.attn.n}}</span></div>\n<sc-for list=\"{{td.attn.rows}}\" as=\"r\" hint-placeholder-count=\"2\"><button class=\"trep\" onClick=\"{{r.open}}\"><span class=\"av\" style=\"background: {{r.bg}}\">{{r.init}}</span><span class=\"trep-b\"><span class=\"trep-t\">{{r.title}}</span><span class=\"trep-m\">{{r.who}} · {{r.team}}</span><sc-if value=\"{{r.hasQuote}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"trep-q\">{{r.quote}}</span></sc-if><sc-if value=\"{{r.hasFile}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"trep-f\"><svg class=\"ic xs\"><use href=\"#i-clip\"></use></svg><span class=\"num\">{{r.nFile}}</span> فایل پیوست</span></sc-if></span><span class=\"pill {{r.pill}}\">{{r.st}}</span></button></sc-for>\n</section></sc-if>\n<sc-if value=\"{{td.none.show}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"tsec\" aria-label=\"هنوز گزارش نداده‌اند\">\n<div class=\"tsec-h\"><span class=\"tsec-d\" style=\"background:#BFB2A3\"></span><h2 class=\"h2\">هنوز گزارش نداده‌اند</h2><span class=\"tsec-n num\">{{td.none.n}}</span><span class=\"grow\"></span><button class=\"btn btn-s tsec-a\" onClick=\"{{td.none.remindAll}}\"><svg class=\"ic\"><use href=\"#i-bell\"></use></svg>یادآوری به همه</button></div>\n<sc-for list=\"{{td.none.rows}}\" as=\"r\" hint-placeholder-count=\"3\"><button class=\"trow\" onClick=\"{{r.open}}\"><span class=\"av sm\" style=\"background: {{r.bg}}\">{{r.init}}</span><span class=\"trow-b\"><span class=\"trow-t\">{{r.title}}</span><span class=\"trow-s\">{{r.who}} · {{r.team}}</span></span><svg class=\"ic trow-c\"><use href=\"#i-chev-l\"></use></svg></button></sc-for>\n</section></sc-if>\n<sc-if value=\"{{td.ok.show}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"tsec\" aria-label=\"طبق برنامه\">\n<div class=\"tsec-h\"><span class=\"tsec-d\" style=\"background:var(--ok)\"></span><h2 class=\"h2\">طبق برنامه</h2><span class=\"tsec-n num\">{{td.ok.n}}</span><span class=\"grow\"></span><sc-if value=\"{{td.ok.canToggle}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"btn btn-s tsec-a\" onClick=\"{{td.ok.toggle}}\" aria-expanded=\"{{td.ok.open}}\">{{td.ok.tgLabel}}<svg class=\"ic\"><use href=\"#{{td.ok.tgIcon}}\"></use></svg></button></sc-if></div>\n<sc-if value=\"{{td.ok.closed}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"tsec-more\" onClick=\"{{td.ok.toggle}}\"><span class=\"avs\"><sc-for list=\"{{td.ok.rows}}\" as=\"r\" hint-placeholder-count=\"4\"><span class=\"av sm\" style=\"background: {{r.bg}}\" title=\"{{r.who}}\">{{r.init}}</span></sc-for></span><span class=\"small\"><span class=\"num\">{{td.ok.n}}</span> کار پیش می‌رود؛ برای دیدن جزئیات بزنید.</span></button></sc-if>\n<sc-if value=\"{{td.ok.open}}\" hint-placeholder-val=\"{{ false }}\"><sc-for list=\"{{td.ok.rows}}\" as=\"r\" hint-placeholder-count=\"4\"><button class=\"trow\" onClick=\"{{r.open}}\"><span class=\"av sm\" style=\"background: {{r.bg}}\">{{r.init}}</span><span class=\"trow-b\"><span class=\"trow-t\">{{r.title}}</span><span class=\"trow-s\">{{r.who}} · {{r.sum}}</span></span><span class=\"trow-st\"><i class=\"{{r.dot}}\"></i>{{r.st}}</span></button></sc-for></sc-if>\n</section></sc-if>\n<sc-if value=\"{{td.allClear}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"td-clear\"><svg class=\"ic md\"><use href=\"#i-check-c\"></use></svg><span>همه گزارش داده‌اند و هیچ کاری گیر نکرده است.</span></div></sc-if>\n<sc-if value=\"{{td.empty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"td-clear\"><svg class=\"ic md\"><use href=\"#i-check-c\"></use></svg><span>در این دسته چیزی نیست.</span></div></sc-if>\n\n<p class=\"xs subtle td-note\">هر چه همکاران روی کارت انجام می‌دهند یا می‌نویسند (تیک چک‌لیست، ارسال نسخه، یادداشت)، خودکار اینجا می‌آید.</p>\n</div>\n</sc-if>\n\n<sc-if value=\"{{pg.board}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"bwrap\" style=\"background: {{bd.bg}}\">\n<div class=\"bhead\">\n<h1>{{bd.name}}</h1>\n<span class=\"xs hide-s\" style=\"opacity:.9\">{{bd.team}}</span>\n<span class=\"grow\"></span>\n<div class=\"rel\"><button class=\"{{bd.filterCls}}\" onClick=\"{{bd.toggleFilter}}\" aria-expanded=\"{{bd.filterOpen}}\"><svg class=\"ic\"><use href=\"#i-filter\"></use></svg>{{bd.filterLabel}}</button>\n<sc-if value=\"{{bd.filterOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:40px;left:0;color:var(--text)\">\n<div class=\"pop-h\"><b>فیلتر</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{bd.toggleFilter}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"flab\" style=\"margin-bottom:4px\">اعضا</div>\n<sc-for list=\"{{bd.fMembers}}\" as=\"m\" hint-placeholder-count=\"4\"><button class=\"{{m.cls}}\" onClick=\"{{m.pick}}\"><span class=\"radio\"></span><span class=\"av sm\" style=\"background: {{m.bg}}\">{{m.init}}</span><span class=\"grow\">{{m.name}}</span></button></sc-for>\n<div class=\"flab\" style=\"margin:8px 0 4px\">وضعیت</div>\n<sc-for list=\"{{bd.fFlags}}\" as=\"f\" hint-placeholder-count=\"4\"><button class=\"{{f.cls}}\" onClick=\"{{f.pick}}\"><span class=\"radio\"></span><span class=\"lbl {{f.lbl}}\" style=\"height:16px;width:32px;padding:0\"></span><span class=\"grow\">{{f.label}}</span></button></sc-for>\n<button class=\"btn btn-w\" style=\"margin-top:8px\" onClick=\"{{bd.clearFilter}}\">پاک کردن فیلتر</button>\n</div></sc-if>\n</div>\n<div class=\"avs hide-s\"><sc-for list=\"{{bd.members}}\" as=\"m\" hint-placeholder-count=\"5\"><span class=\"av sm\" style=\"background: {{m.bg}}\" title=\"{{m.name}}\">{{m.init}}</span></sc-for></div>\n<button class=\"{{bd.vkCls}}\" onClick=\"{{bd.setK}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg>تابلو</button>\n<button class=\"{{bd.vtCls}}\" onClick=\"{{bd.setT}}\"><svg class=\"ic\"><use href=\"#i-table\"></use></svg>جدول</button>\n</div>\n<sc-if value=\"{{bd.viewK}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"lists\">\n<sc-for list=\"{{bd.lists}}\" as=\"l\" hint-placeholder-count=\"5\">\n<section class=\"{{l.cls}}\" onDragOver=\"{{l.over}}\" onDragLeave=\"{{l.leave}}\" onDrop=\"{{l.drop}}\" aria-label=\"لیست {{l.name}}\">\n<header class=\"list-h\">\n<sc-if value=\"{{l.notEditing}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"list-t lt-btn\" onClick=\"{{l.rename}}\" title=\"برای تغییر نام بزنید\">{{l.name}}</button></sc-if>\n<sc-if value=\"{{l.editing}}\" hint-placeholder-val=\"{{ false }}\"><input class=\"inp list-in\" aria-label=\"نام لیست\" value=\"{{l.editText}}\" onChange=\"{{l.onEdit}}\" onKeyDown=\"{{l.editKey}}\" onBlur=\"{{l.saveEdit}}\" autoFocus=\"{{ true }}\"></sc-if>\n<span class=\"nav-n num\">{{l.n}}</span>\n<sc-if value=\"{{l.hasTeam}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" style=\"width:30px;height:30px\" aria-label=\"تابلوی تیم {{l.name}}\" title=\"دیدن تابلوی تیم با همه‌ی ستون‌هایش\" onClick=\"{{l.goTeam}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg></button></sc-if>\n<div class=\"rel\"><button class=\"ib\" style=\"width:30px;height:30px\" aria-label=\"منوی لیست {{l.name}}\" onClick=\"{{l.menu}}\" aria-expanded=\"{{l.menuOpen}}\"><svg class=\"ic\"><use href=\"#i-more\"></use></svg></button>\n<sc-if value=\"{{l.menuOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:34px;left:0;width:240px;padding:6px\">\n<div class=\"pop-h\"><b>{{l.name}}</b></div>\n<sc-if value=\"{{l.hasInfo}}\" hint-placeholder-val=\"{{ true }}\"><p class=\"xs subtle\" style=\"padding:0 10px 6px\">{{l.menuInfo}}</p></sc-if>\n<sc-if value=\"{{l.canEdit}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{l.rename}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>تغییر نام</button>\n<sc-if value=\"{{l.canRight}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{l.mvRight}}\"><svg class=\"ic\"><use href=\"#i-arrow-r\"></use></svg>جابه‌جایی به راست</button></sc-if>\n<sc-if value=\"{{l.canLeft}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{l.mvLeft}}\"><svg class=\"ic\"><use href=\"#i-arrow-l\"></use></svg>جابه‌جایی به چپ</button></sc-if></sc-if>\n<sc-if value=\"{{l.hasTeam}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"mi\" onClick=\"{{l.goTeam}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg>دیدن تابلوی تیم</button></sc-if>\n<sc-if value=\"{{l.canDel}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"msep\"></div><button class=\"mi dan\" onClick=\"{{l.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg>حذف لیست</button></sc-if>\n</div></sc-if>\n</div>\n</header>\n<sc-if value=\"{{l.hasSub}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"list-sec\"><svg class=\"ic xs\"><use href=\"#{{l.subIcon}}\"></use></svg>{{l.sub}}</div></sc-if>\n<div class=\"list-c\">\n<sc-for list=\"{{l.cards}}\" as=\"c\" hint-placeholder-count=\"2\">\n<article class=\"{{c.cls}}\" draggable=\"true\" onDragStart=\"{{c.dragStart}}\" onDragEnd=\"{{dragEnd}}\">\n<button class=\"hit\" onClick=\"{{c.open}}\" aria-label=\"{{c.aria}}\"></button>\n<sc-if value=\"{{c.hasCover}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"cover\"><svg class=\"art {{c.coverStyle}}\" aria-hidden=\"true\"><use href=\"#{{c.art}}\"></use><use class=\"u2\" href=\"#{{c.art}}\"></use></svg></div></sc-if>\n<div class=\"cb\">\n<sc-if value=\"{{c.hasLbls}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"lbls\"><sc-for list=\"{{c.lbls}}\" as=\"g\" hint-placeholder-count=\"1\"><span class=\"lbl {{g.cls}}\">{{g.t}}</span></sc-for></div></sc-if>\n<div class=\"ctitle\">{{c.title}}</div>\n<sc-if value=\"{{c.hasBdgs}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"bdgs\">\n<sc-if value=\"{{c.hasDue}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.dueCls}}\" title=\"{{c.dueTitle}}\"><svg class=\"ic xs\"><use href=\"#{{c.dueIcon}}\"></use></svg>{{c.dueTxt}}</span></sc-if>\n<sc-if value=\"{{c.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.chkCls}}\" title=\"چک‌لیست\"><svg class=\"ic xs\"><use href=\"#i-check-sq\"></use></svg><span class=\"num\">{{c.chkTxt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasCmt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"نظرها\"><svg class=\"ic xs\"><use href=\"#i-msg\"></use></svg><span class=\"num\">{{c.nCmt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasAtt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"پیوست‌ها\"><svg class=\"ic xs\"><use href=\"#i-clip\"></use></svg><span class=\"num\">{{c.nAtt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasVer}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"نسخه‌ها\"><svg class=\"ic xs\"><use href=\"#i-layers\"></use></svg><span class=\"num\">{{c.nVer}}</span></span></sc-if>\n<sc-if value=\"{{c.hasRep}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"{{c.repTitle}}\"><span class=\"{{c.repDot}}\" style=\"width:8px;height:8px;border-radius:50%;display:block\"></span></span></sc-if>\n<sc-if value=\"{{c.hasTeamBdg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"{{c.teamCls}}\" title=\"{{c.teamTitle}}\"><svg class=\"ic xs\"><use href=\"#i-board\"></use></svg>{{c.teamBdg}}</span></sc-if>\n<span class=\"cmem\"><sc-if value=\"{{c.hasWho}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"avs\"><sc-for list=\"{{c.avs}}\" as=\"a\" hint-placeholder-count=\"1\"><span class=\"av sm\" style=\"background: {{a.bg}}\" title=\"{{a.name}}\">{{a.init}}</span></sc-for></span></sc-if></span>\n</div></sc-if>\n</div>\n<sc-if value=\"{{c.canQe}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"{{c.qeCls}}\" aria-label=\"ویرایش سریع {{c.title}}\" aria-expanded=\"{{c.qOpen}}\" onClick=\"{{c.qToggle}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg></button></sc-if>\n</article>\n</sc-for>\n<sc-if value=\"{{l.quickOpen}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"quick\"><textarea aria-label=\"عنوان کارت\" placeholder=\"عنوان کارت را بنویسید…\" value=\"{{quickText}}\" onChange=\"{{onQuick}}\" onKeyDown=\"{{quickKey}}\" autoFocus=\"{{ true }}\"></textarea>\n<sc-if value=\"{{l.qHasRefs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{l.qRefs}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<button class=\"btn btn-s\" style=\"height:32px;align-self:flex-start\" onClick=\"{{quickRef}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس نمونه</button>\n</div>\n<sc-if value=\"{{l.quickHint}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"xs muted\" style=\"padding:0 4px;line-height:1.7\">{{l.quickHint}}</p></sc-if>\n<div class=\"row\"><button class=\"btn btn-p\" onClick=\"{{quickAdd}}\">ثبت کارت</button><button class=\"btn\" onClick=\"{{quickClose}}\">لغو</button></div>\n</sc-if>\n<sc-if value=\"{{l.empty}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"xs subtle\" style=\"text-align:center;padding:10px 4px\">{{l.emptyTxt}}</p></sc-if>\n</div>\n<sc-if value=\"{{l.canAdd}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"list-f\"><button class=\"btn addc\" onClick=\"{{l.add}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>{{l.addLabel}}</button></div></sc-if>\n</section>\n\n</sc-for>\n<sc-if value=\"{{bd.canAddList}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"addlist\">\n<sc-if value=\"{{bd.al.closed}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"addlist-b\" onClick=\"{{bd.al.start}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>افزودن لیست دیگر</button></sc-if>\n<sc-if value=\"{{bd.al.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"addlist-f\">\n<input class=\"inp\" aria-label=\"نام لیست\" placeholder=\"نام لیست…\" value=\"{{bd.al.text}}\" onChange=\"{{bd.al.onText}}\" onKeyDown=\"{{bd.al.key}}\" autoFocus=\"{{ true }}\">\n<sc-if value=\"{{bd.al.isPipe}}\" hint-placeholder-val=\"{{ false }}\"><label class=\"flab\" for=\"al-s\">کار کدام تیم است؟</label><select id=\"al-s\" class=\"inp\" value=\"{{bd.al.sec}}\" onChange=\"{{bd.al.onSec}}\"><sc-for list=\"{{bd.al.secOpts}}\" as=\"o\" hint-placeholder-count=\"3\"><option value=\"{{o.id}}\">{{o.name}}</option></sc-for></select></sc-if>\n<div class=\"row\"><button class=\"btn btn-p\" onClick=\"{{bd.al.save}}\">افزودن لیست</button><button class=\"btn\" onClick=\"{{bd.al.cancel}}\">لغو</button></div>\n</div></sc-if>\n</div></sc-if>\n\n</div>\n</sc-if>\n<sc-if value=\"{{bd.viewT}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"tbox\"><table class=\"tbl\"><thead><tr><th>کارت</th><th>لیست</th><th>برچسب‌ها</th><th>اعضا</th><th>تاریخ تحویل</th><th>چک‌لیست</th></tr></thead><tbody>\n<sc-for list=\"{{bd.rows}}\" as=\"c\" hint-placeholder-count=\"6\"><tr><td><div class=\"row\"><span class=\"mini\" style=\"width:32px;height:32px\"><svg class=\"art art-photo\"><use href=\"#{{c.art}}\"></use></svg></span><div style=\"line-height:1.5\"><button class=\"tlink\" onClick=\"{{c.open}}\">{{c.title}}</button><div class=\"xs subtle num\">{{c.code}}</div></div></div></td><td><span class=\"lchip\"><i class=\"{{c.listLbl}}\"></i>{{c.listName}}</span></td><td><div class=\"lbls\"><sc-for list=\"{{c.lbls}}\" as=\"g\" hint-placeholder-count=\"1\"><span class=\"lbl {{g.cls}}\">{{g.t}}</span></sc-for></div></td><td><sc-if value=\"{{c.hasWho}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row\"><div class=\"avs\"><sc-for list=\"{{c.avs}}\" as=\"a\" hint-placeholder-count=\"1\"><span class=\"av sm\" style=\"background: {{a.bg}}\" title=\"{{a.name}}\">{{a.init}}</span></sc-for></div><span class=\"small\">{{c.who}}</span></div></sc-if><sc-if value=\"{{c.hasTeamBdg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle\">{{c.teamBdg}}</span></sc-if></td><td><sc-if value=\"{{c.hasDue}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.dueCls}}\"><svg class=\"ic xs\"><use href=\"#{{c.dueIcon}}\"></use></svg>{{c.dueTxt}}</span></sc-if></td><td><sc-if value=\"{{c.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"small num\">{{c.chkTxt}}</span></sc-if></td></tr></sc-for>\n</tbody></table></div>\n</sc-if>\n</div>\n</sc-if>\n\n<sc-if value=\"{{pg.team}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"bwrap\" style=\"background: {{tb.bg}}\">\n<div class=\"bhead\">\n<h1>{{tb.name}}</h1>\n<span class=\"xs hide-s\" style=\"opacity:.9\">{{tb.unit}}</span>\n<sc-if value=\"{{tb.hasPool}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill\" style=\"background:rgba(255,255,255,.22);color:#fff\"><svg class=\"ic xs\"><use href=\"#i-team\"></use></svg>{{tb.nPool}} کار بدون صاحب</span></sc-if>\n<span class=\"grow\"></span>\n<sc-if value=\"{{tb.showMine}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row\" style=\"gap:4px\"><button class=\"{{tb.allCls}}\" onClick=\"{{tb.setAll}}\">همه‌ی تیم</button><button class=\"{{tb.mineCls}}\" onClick=\"{{tb.setMine}}\">فقط من</button></div></sc-if>\n<div class=\"rel\"><button class=\"{{tb.filterCls}}\" onClick=\"{{tb.toggleFilter}}\" aria-expanded=\"{{tb.filterOpen}}\"><svg class=\"ic\"><use href=\"#i-filter\"></use></svg>{{tb.filterLabel}}</button>\n<sc-if value=\"{{tb.filterOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:40px;left:0;color:var(--text)\">\n<div class=\"pop-h\"><b>فیلتر</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{tb.toggleFilter}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"flab\" style=\"margin-bottom:4px\">اعضا</div>\n<sc-for list=\"{{tb.fMembers}}\" as=\"m\" hint-placeholder-count=\"3\"><button class=\"{{m.cls}}\" onClick=\"{{m.pick}}\"><span class=\"radio\"></span><span class=\"av sm\" style=\"background: {{m.bg}}\">{{m.init}}</span><span class=\"grow\">{{m.name}}</span></button></sc-for>\n<div class=\"flab\" style=\"margin:8px 0 4px\">وضعیت</div>\n<sc-for list=\"{{tb.fFlags}}\" as=\"f\" hint-placeholder-count=\"4\"><button class=\"{{f.cls}}\" onClick=\"{{f.pick}}\"><span class=\"radio\"></span><span class=\"lbl {{f.lbl}}\" style=\"height:16px;width:32px;padding:0\"></span><span class=\"grow\">{{f.label}}</span></button></sc-for>\n<button class=\"btn btn-w\" style=\"margin-top:8px\" onClick=\"{{tb.clearFilter}}\">پاک کردن فیلتر</button>\n</div></sc-if>\n</div>\n<div class=\"avs hide-s\"><sc-for list=\"{{tb.members}}\" as=\"m\" hint-placeholder-count=\"3\"><span class=\"av sm\" style=\"background: {{m.bg}}\" title=\"{{m.name}}\">{{m.init}}</span></sc-for></div>\n</div>\n<sc-if value=\"{{tb.hasTabs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"ttabs\"><sc-for list=\"{{tb.tabs}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" style=\"height:30px\" onClick=\"{{t.go}}\">تیم {{t.name}}</button></sc-for></div></sc-if>\n<sc-if value=\"{{tb.rp.show}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"repbar\">\n<button class=\"repbar-h\" onClick=\"{{tb.rp.toggle}}\" aria-expanded=\"{{tb.rp.open}}\"><svg class=\"ic md\"><use href=\"#i-report\"></use></svg><b>{{tb.rp.title}}</b><span class=\"pill {{tb.rp.pill}}\">{{tb.rp.left}}</span><span class=\"grow\"></span><sc-if value=\"{{tb.rp.closed}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"small\">باز کردن</span><svg class=\"ic\"><use href=\"#i-chev-d\"></use></svg></sc-if><sc-if value=\"{{tb.rp.open}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small\">بستن</span><svg class=\"ic\"><use href=\"#i-chev-u\"></use></svg></sc-if></button>\n<sc-if value=\"{{tb.rp.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"repbar-b\">\n<p class=\"xs muted\" style=\"line-height:1.8\">{{tb.rp.hint}}</p>\n<sc-for list=\"{{tb.rp.rows}}\" as=\"r\" hint-placeholder-count=\"2\"><div class=\"reprow\">\n<div class=\"row rp-t\" style=\"align-items:flex-start;gap:10px\"><span class=\"mini\"><svg class=\"art art-photo\"><use href=\"#{{r.art}}\"></use></svg></span><div class=\"grow\" style=\"line-height:1.6;min-width:0\"><button class=\"tlink\" onClick=\"{{r.open}}\">{{r.title}}</button><div class=\"auto\"><svg class=\"ic xs\" style=\"margin-top:5px\"><use href=\"#i-refresh\"></use></svg><span>{{r.auto}}</span></div><sc-if value=\"{{r.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{r.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if></div></div>\n<div class=\"row wrap\" style=\"gap:6px\"><div class=\"dr\"><sc-for list=\"{{r.chips}}\" as=\"h\" hint-placeholder-count=\"3\"><button class=\"{{h.cls}}\" onClick=\"{{h.pick}}\" aria-pressed=\"{{h.on}}\"><i class=\"{{h.dot}}\"></i>{{h.label}}</button></sc-for></div><button class=\"btn btn-s\" onClick=\"{{r.toggleNote}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>{{r.noteLabel}}</button></div>\n<sc-if value=\"{{r.noteOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"composer\"><textarea class=\"inp\" style=\"min-height:52px\" placeholder=\"یک جمله دربارهٔ امروز، اختیاری\" aria-label=\"توضیح گزارش امروز\" value=\"{{r.note}}\" onChange=\"{{r.onNote}}\"></textarea><sc-if value=\"{{r.hasNFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{r.nFiles}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if><div class=\"row\"><button class=\"btn\" onClick=\"{{r.addFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>فایل یا عکس</button><span class=\"grow\"></span><button class=\"btn btn-p\" onClick=\"{{r.save}}\">ثبت</button></div></div></sc-if>\n</div></sc-for>\n</div></sc-if>\n</div>\n</sc-if>\n<div class=\"lists\">\n<sc-for list=\"{{tb.lists}}\" as=\"l\" hint-placeholder-count=\"3\">\n<section class=\"{{l.cls}}\" onDragOver=\"{{l.over}}\" onDragLeave=\"{{l.leave}}\" onDrop=\"{{l.drop}}\" aria-label=\"لیست {{l.name}}\">\n<header class=\"list-h\">\n<sc-if value=\"{{l.notEditing}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"list-t lt-btn\" onClick=\"{{l.rename}}\" title=\"برای تغییر نام بزنید\">{{l.name}}</button></sc-if>\n<sc-if value=\"{{l.editing}}\" hint-placeholder-val=\"{{ false }}\"><input class=\"inp list-in\" aria-label=\"نام لیست\" value=\"{{l.editText}}\" onChange=\"{{l.onEdit}}\" onKeyDown=\"{{l.editKey}}\" onBlur=\"{{l.saveEdit}}\" autoFocus=\"{{ true }}\"></sc-if>\n<span class=\"nav-n num\">{{l.n}}</span>\n<sc-if value=\"{{l.hasTeam}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" style=\"width:30px;height:30px\" aria-label=\"تابلوی تیم {{l.name}}\" title=\"دیدن تابلوی تیم با همه‌ی ستون‌هایش\" onClick=\"{{l.goTeam}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg></button></sc-if>\n<div class=\"rel\"><button class=\"ib\" style=\"width:30px;height:30px\" aria-label=\"منوی لیست {{l.name}}\" onClick=\"{{l.menu}}\" aria-expanded=\"{{l.menuOpen}}\"><svg class=\"ic\"><use href=\"#i-more\"></use></svg></button>\n<sc-if value=\"{{l.menuOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:34px;left:0;width:240px;padding:6px\">\n<div class=\"pop-h\"><b>{{l.name}}</b></div>\n<sc-if value=\"{{l.hasInfo}}\" hint-placeholder-val=\"{{ true }}\"><p class=\"xs subtle\" style=\"padding:0 10px 6px\">{{l.menuInfo}}</p></sc-if>\n<sc-if value=\"{{l.canEdit}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{l.rename}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>تغییر نام</button>\n<sc-if value=\"{{l.canRight}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{l.mvRight}}\"><svg class=\"ic\"><use href=\"#i-arrow-r\"></use></svg>جابه‌جایی به راست</button></sc-if>\n<sc-if value=\"{{l.canLeft}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{l.mvLeft}}\"><svg class=\"ic\"><use href=\"#i-arrow-l\"></use></svg>جابه‌جایی به چپ</button></sc-if></sc-if>\n<sc-if value=\"{{l.hasTeam}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"mi\" onClick=\"{{l.goTeam}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg>دیدن تابلوی تیم</button></sc-if>\n<sc-if value=\"{{l.canDel}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"msep\"></div><button class=\"mi dan\" onClick=\"{{l.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg>حذف لیست</button></sc-if>\n</div></sc-if>\n</div>\n</header>\n<sc-if value=\"{{l.hasSub}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"list-sec\"><svg class=\"ic xs\"><use href=\"#{{l.subIcon}}\"></use></svg>{{l.sub}}</div></sc-if>\n<div class=\"list-c\">\n<sc-for list=\"{{l.cards}}\" as=\"c\" hint-placeholder-count=\"2\">\n<article class=\"{{c.cls}}\" draggable=\"true\" onDragStart=\"{{c.dragStart}}\" onDragEnd=\"{{dragEnd}}\">\n<button class=\"hit\" onClick=\"{{c.open}}\" aria-label=\"{{c.aria}}\"></button>\n<sc-if value=\"{{c.hasCover}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"cover\"><svg class=\"art {{c.coverStyle}}\" aria-hidden=\"true\"><use href=\"#{{c.art}}\"></use><use class=\"u2\" href=\"#{{c.art}}\"></use></svg></div></sc-if>\n<div class=\"cb\">\n<sc-if value=\"{{c.hasLbls}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"lbls\"><sc-for list=\"{{c.lbls}}\" as=\"g\" hint-placeholder-count=\"1\"><span class=\"lbl {{g.cls}}\">{{g.t}}</span></sc-for></div></sc-if>\n<div class=\"ctitle\">{{c.title}}</div>\n<sc-if value=\"{{c.hasBdgs}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"bdgs\">\n<sc-if value=\"{{c.hasDue}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.dueCls}}\" title=\"{{c.dueTitle}}\"><svg class=\"ic xs\"><use href=\"#{{c.dueIcon}}\"></use></svg>{{c.dueTxt}}</span></sc-if>\n<sc-if value=\"{{c.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.chkCls}}\" title=\"چک‌لیست\"><svg class=\"ic xs\"><use href=\"#i-check-sq\"></use></svg><span class=\"num\">{{c.chkTxt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasCmt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"نظرها\"><svg class=\"ic xs\"><use href=\"#i-msg\"></use></svg><span class=\"num\">{{c.nCmt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasAtt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"پیوست‌ها\"><svg class=\"ic xs\"><use href=\"#i-clip\"></use></svg><span class=\"num\">{{c.nAtt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasVer}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"نسخه‌ها\"><svg class=\"ic xs\"><use href=\"#i-layers\"></use></svg><span class=\"num\">{{c.nVer}}</span></span></sc-if>\n<sc-if value=\"{{c.hasRep}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"{{c.repTitle}}\"><span class=\"{{c.repDot}}\" style=\"width:8px;height:8px;border-radius:50%;display:block\"></span></span></sc-if>\n<sc-if value=\"{{c.hasTeamBdg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"{{c.teamCls}}\" title=\"{{c.teamTitle}}\"><svg class=\"ic xs\"><use href=\"#i-board\"></use></svg>{{c.teamBdg}}</span></sc-if>\n<span class=\"cmem\"><sc-if value=\"{{c.hasWho}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"avs\"><sc-for list=\"{{c.avs}}\" as=\"a\" hint-placeholder-count=\"1\"><span class=\"av sm\" style=\"background: {{a.bg}}\" title=\"{{a.name}}\">{{a.init}}</span></sc-for></span></sc-if></span>\n</div></sc-if>\n</div>\n<sc-if value=\"{{c.canQe}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"{{c.qeCls}}\" aria-label=\"ویرایش سریع {{c.title}}\" aria-expanded=\"{{c.qOpen}}\" onClick=\"{{c.qToggle}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg></button></sc-if>\n</article>\n</sc-for>\n<sc-if value=\"{{l.quickOpen}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"quick\"><textarea aria-label=\"عنوان کارت\" placeholder=\"عنوان کارت را بنویسید…\" value=\"{{quickText}}\" onChange=\"{{onQuick}}\" onKeyDown=\"{{quickKey}}\" autoFocus=\"{{ true }}\"></textarea>\n<sc-if value=\"{{l.qHasRefs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{l.qRefs}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<button class=\"btn btn-s\" style=\"height:32px;align-self:flex-start\" onClick=\"{{quickRef}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس نمونه</button>\n</div>\n<sc-if value=\"{{l.quickHint}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"xs muted\" style=\"padding:0 4px;line-height:1.7\">{{l.quickHint}}</p></sc-if>\n<div class=\"row\"><button class=\"btn btn-p\" onClick=\"{{quickAdd}}\">ثبت کارت</button><button class=\"btn\" onClick=\"{{quickClose}}\">لغو</button></div>\n</sc-if>\n<sc-if value=\"{{l.empty}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"xs subtle\" style=\"text-align:center;padding:10px 4px\">{{l.emptyTxt}}</p></sc-if>\n</div>\n<sc-if value=\"{{l.canAdd}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"list-f\"><button class=\"btn addc\" onClick=\"{{l.add}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>{{l.addLabel}}</button></div></sc-if>\n</section>\n\n</sc-for>\n<sc-if value=\"{{tb.canAddList}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"addlist\">\n<sc-if value=\"{{tb.al.closed}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"addlist-b\" onClick=\"{{tb.al.start}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>افزودن لیست دیگر</button></sc-if>\n<sc-if value=\"{{tb.al.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"addlist-f\">\n<input class=\"inp\" aria-label=\"نام لیست\" placeholder=\"نام لیست…\" value=\"{{tb.al.text}}\" onChange=\"{{tb.al.onText}}\" onKeyDown=\"{{tb.al.key}}\" autoFocus=\"{{ true }}\">\n<sc-if value=\"{{tb.al.isPipe}}\" hint-placeholder-val=\"{{ false }}\"><label class=\"flab\" for=\"al-s\">کار کدام تیم است؟</label><select id=\"al-s\" class=\"inp\" value=\"{{tb.al.sec}}\" onChange=\"{{tb.al.onSec}}\"><sc-for list=\"{{tb.al.secOpts}}\" as=\"o\" hint-placeholder-count=\"3\"><option value=\"{{o.id}}\">{{o.name}}</option></sc-for></select></sc-if>\n<div class=\"row\"><button class=\"btn btn-p\" onClick=\"{{tb.al.save}}\">افزودن لیست</button><button class=\"btn\" onClick=\"{{tb.al.cancel}}\">لغو</button></div>\n</div></sc-if>\n</div></sc-if>\n\n</div>\n</div>\n</sc-if>\n\n<sc-if value=\"{{pg.reviews}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\" style=\"max-width:900px\">\n<h1 class=\"h1\">صف بررسی</h1>\n<div class=\"box\" style=\"padding:6px\">\n<sc-for list=\"{{revs}}\" as=\"r\" hint-placeholder-count=\"3\"><div class=\"rowc\"><span class=\"mini\" style=\"width:56px;height:56px\"><svg class=\"art {{r.style}}\"><use href=\"#{{r.art}}\"></use><use class=\"u2\" href=\"#{{r.art}}\"></use></svg></span><div class=\"grow\" style=\"line-height:1.6\"><button class=\"tlink\" onClick=\"{{r.open}}\">{{r.title}}</button><div class=\"row xs subtle wrap\" style=\"gap:6px\"><span class=\"num\">{{r.code}}</span><span class=\"lchip\" style=\"height:22px\"><i class=\"{{r.listLbl}}\"></i>{{r.listName}}</span><span>{{r.ver}}</span><span class=\"row\" style=\"gap:4px\"><span class=\"av sm\" style=\"background: {{r.bg}}\">{{r.init}}</span>{{r.who}}</span></div></div><span class=\"pill {{r.waitPill}}\"><svg class=\"ic xs\"><use href=\"#i-clock\"></use></svg>{{r.wait}}</span><button class=\"btn btn-p\" onClick=\"{{r.open}}\">بررسی</button></div></sc-for>\n<sc-if value=\"{{revsEmpty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"empty\"><svg class=\"ic xl\" style=\"color:var(--ok)\"><use href=\"#i-check-c\"></use></svg><b>همه بررسی شده‌اند</b></div></sc-if>\n</div>\n</div>\n</sc-if>\n<sc-if value=\"{{pg.archive}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\" style=\"max-width:960px\">\n<h1 class=\"h1\">آرشیو</h1>\n<div class=\"row sb wrap\">\n<div class=\"tabs\" role=\"tablist\"><button class=\"{{ar.tDCls}}\" role=\"tab\" aria-selected=\"{{ar.isDone}}\" onClick=\"{{ar.goDone}}\">تکمیل‌شده‌ها<span class=\"nav-n num\">{{ar.nDone}}</span></button><button class=\"{{ar.tCCls}}\" role=\"tab\" aria-selected=\"{{ar.isCancel}}\" onClick=\"{{ar.goCancel}}\">لغوشده‌ها<span class=\"nav-n num\">{{ar.nCancel}}</span></button></div>\n<div class=\"row\"><input class=\"inp\" style=\"width:220px\" type=\"search\" aria-label=\"جست‌وجو در آرشیو\" placeholder=\"جست‌وجوی کد، عنوان یا مشتری\" value=\"{{ar.q}}\" onChange=\"{{ar.onQ}}\"><div class=\"seg\"><sc-for list=\"{{ar.ranges}}\" as=\"r\" hint-placeholder-count=\"3\"><button class=\"{{r.cls}}\" onClick=\"{{r.pick}}\">{{r.label}}</button></sc-for></div><button class=\"btn\" onClick=\"{{ar.openCal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>{{ar.customTxt}}</button></div>\n</div>\n<div class=\"box\" style=\"padding:6px\">\n<sc-for list=\"{{ar.items}}\" as=\"a\" hint-placeholder-count=\"3\"><div class=\"rowc\"><span class=\"mini\" style=\"width:48px;height:48px\"><svg class=\"art art-render\"><use href=\"#{{a.art}}\"></use></svg></span><div class=\"grow\" style=\"line-height:1.6\"><button class=\"tlink\" onClick=\"{{a.open}}\">{{a.title}}</button><div class=\"xs subtle row wrap\" style=\"gap:6px\"><span class=\"num\">{{a.code}}</span><span>{{a.where}}</span><span>·</span><span>{{a.date}}</span><sc-if value=\"{{a.hasReason}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill P-rs\" style=\"height:20px\">{{a.reason}}</span></sc-if></div></div><button class=\"btn\" onClick=\"{{a.restore}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>بازگرداندن</button></div></sc-for>\n<sc-if value=\"{{ar.empty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"empty\"><svg class=\"ic xl\" style=\"color:var(--text3)\"><use href=\"#i-archive\"></use></svg><b>موردی پیدا نشد</b><button class=\"btn\" onClick=\"{{ar.clear}}\">پاک کردن جست‌وجو</button></div></sc-if>\n</div>\n</div>\n</sc-if>\n<sc-if value=\"{{pg.members}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\" style=\"max-width:960px\">\n<div class=\"row sb wrap\"><h1 class=\"h1\">اعضا و امتیازها</h1><button class=\"btn btn-p\" onClick=\"{{addStaff}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>افزودن عضو</button></div>\n<sc-if value=\"{{trial}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"banner\" style=\"border-radius:6px\"><svg class=\"ic\"><use href=\"#i-alert\"></use></svg>دوره‌ی آزمایشی: پاداشی محاسبه نمی‌شود.</div></sc-if>\n<sc-if value=\"{{mm.hasObj}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"call yellow\"><b class=\"row\"><svg class=\"ic\"><use href=\"#i-flag\"></use></svg>اعتراض در انتظار بررسی</b><sc-for list=\"{{mm.obj}}\" as=\"o\" hint-placeholder-count=\"3\"><div class=\"row sb\"><span class=\"small row\"><span class=\"av sm\" style=\"background: {{o.bg}}\">{{o.init}}</span>{{o.who}} · ارجاع <span class=\"num\">{{o.code}}</span></span><button class=\"btn btn-p\" onClick=\"{{o.review}}\">بررسی</button></div></sc-for></div></sc-if>\n<sc-for list=\"{{mm.teams}}\" as=\"t\" hint-placeholder-count=\"3\">\n<section class=\"box\" style=\"padding:6px\">\n<div class=\"row sb\" style=\"padding:10px 12px 6px\"><h2 class=\"h2\"><span class=\"av sm\" style=\"background: {{t.bg}}\"><svg class=\"ic xs\"><use href=\"#i-team\"></use></svg></span>{{t.name}}</h2><span class=\"xs subtle\">{{t.secs}}</span></div>\n<sc-for list=\"{{t.people}}\" as=\"p\" hint-placeholder-count=\"3\"><button class=\"rowc\" style=\"width:100%;border:0;background:none;cursor:pointer;text-align:right\" onClick=\"{{p.open}}\"><span class=\"av lg\" style=\"background: {{p.bg}}\">{{p.init}}</span><span class=\"grow\" style=\"line-height:1.5\"><b>{{p.name}}</b><span class=\"xs subtle\" style=\"display:block\">{{p.sec}} · <span class=\"num\">{{p.active}}</span> کار فعال</span></span><span class=\"row small muted\"><span class=\"kt s {{p.ktCls}}\">{{p.kt}}</span>{{p.ktTxt}}</span><svg class=\"ic\" style=\"color:var(--text3)\"><use href=\"#i-chev-l\"></use></svg></button></sc-for>\n</section>\n</sc-for>\n</div>\n</sc-if>\n<sc-if value=\"{{pg.person}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\" style=\"max-width:960px\">\n<button class=\"btn btn-s\" style=\"align-self:flex-start\" onClick=\"{{goMembers}}\"><svg class=\"ic\"><use href=\"#i-arrow-r\"></use></svg>اعضا</button>\n<section class=\"box pad row wrap\" style=\"gap:20px\">\n<span class=\"av xl\" style=\"background: {{pp.bg}}\">{{pp.init}}</span>\n<div class=\"grow\" style=\"min-width:220px;line-height:1.6\"><h1 class=\"h1\">{{pp.name}}</h1><div class=\"small muted\">{{pp.sec}} · <span class=\"num\">{{pp.active}}</span> کار فعال · <span class=\"num\">{{pp.tasks}}</span> کار در این فصل</div>\n<sc-if value=\"{{pp.enough}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row\" style=\"margin-top:8px;max-width:360px\"><div class=\"prog\"><i style=\"width: {{pp.scoreN}}%\"></i></div><b class=\"num small\">{{pp.score}}</b></div><div class=\"xs subtle\">{{pp.toNext}}</div></sc-if></div>\n<span class=\"kt l {{pp.ktCls}}\">{{pp.kt}}<small>عیار</small></span>\n<button class=\"btn\" onClick=\"{{pp.bonus}}\"><svg class=\"ic\"><use href=\"#i-report\"></use></svg>گزارش پاداش</button>\n</section>\n<sc-if value=\"{{pp.insufficient}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"box empty\"><svg class=\"ic xl\" style=\"color:var(--text3)\"><use href=\"#i-hourglass\"></use></svg><b>داده‌ی کافی نیست</b><span class=\"small\">حداقل ۵ کار در فصل لازم است.</span></div></sc-if>\n<sc-if value=\"{{pp.enough}}\" hint-placeholder-val=\"{{ true }}\">\n<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px\"><sc-for list=\"{{pp.metrics}}\" as=\"m\" hint-placeholder-count=\"3\"><div class=\"box pad\" style=\"display:flex;flex-direction:column;gap:6px\"><div class=\"row sb\"><span class=\"xs b muted\">{{m.name}}</span><span class=\"xs subtle num\">{{m.w}}</span></div><b class=\"num\" style=\"font-size:22px;font-weight:600\">{{m.val}}</b><div class=\"prog\"><i style=\"width: {{m.pct}}%\"></i></div></div></sc-for></div>\n<div class=\"g2\">\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\"><h2 class=\"h2\">دلیل ارجاع‌ها</h2><sc-for list=\"{{pp.reasons}}\" as=\"r\" hint-placeholder-count=\"3\"><div class=\"hb\" style=\"grid-template-columns:160px minmax(0,1fr) 30px\"><span>{{r.label}}</span><span class=\"hb-t\"><span class=\"hb-f\" style=\"display:block;width: {{r.pct}}%;background: {{r.color}}\"></span></span><b class=\"num\">{{r.n}}</b></div></sc-for></section>\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:8px\"><h2 class=\"h2\">اعتراض‌ها</h2><sc-for list=\"{{pp.objs}}\" as=\"o\" hint-placeholder-count=\"3\"><div class=\"row sb\"><span class=\"small\">ارجاع <span class=\"num\">{{o.code}}</span></span><span class=\"pill {{o.pill}}\">{{o.status}}</span><sc-if value=\"{{o.pending}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-p\" onClick=\"{{o.review}}\">بررسی</button></sc-if></div></sc-for><sc-if value=\"{{pp.noObjs}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle\">اعتراضی ثبت نشده.</span></sc-if></section>\n</div>\n</sc-if>\n</div>\n</sc-if>\n<sc-if value=\"{{pg.reports}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\">\n<div class=\"row sb wrap\"><h1 class=\"h1\">گزارش‌ها</h1><div class=\"row\"><div class=\"seg\"><sc-for list=\"{{rp.ranges}}\" as=\"r\" hint-placeholder-count=\"3\"><button class=\"{{r.cls}}\" onClick=\"{{r.pick}}\">{{r.label}}</button></sc-for></div><button class=\"btn\" onClick=\"{{rp.openCal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>{{rp.customTxt}}</button><button class=\"btn\" onClick=\"{{rp.pdf}}\" disabled=\"{{rp.busy}}\"><svg class=\"ic\"><use href=\"#i-download\"></use></svg>پی‌دی‌اف</button><button class=\"btn\" onClick=\"{{rp.xls}}\" disabled=\"{{rp.busy}}\"><svg class=\"ic\"><use href=\"#i-download\"></use></svg>اکسل</button></div></div>\n<div class=\"g2\">\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\"><h2 class=\"h2\">میانگین روزهای هر لیست</h2><sc-for list=\"{{rp.times}}\" as=\"s\" hint-placeholder-count=\"3\"><div class=\"hb\"><span class=\"row\" style=\"gap:6px\"><i class=\"{{s.lbl}}\" style=\"width:10px;height:10px;border-radius:2px;display:block\"></i>{{s.name}}</span><span class=\"hb-t\"><span class=\"hb-f\" style=\"display:block;width: {{s.pct}}%\"></span></span><b class=\"num\">{{s.val}}</b></div></sc-for></section>\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\"><h2 class=\"h2\">دیرکردها در این فصل</h2><sc-for list=\"{{rp.late}}\" as=\"p\" hint-placeholder-count=\"3\"><div class=\"hb\"><span class=\"row\" style=\"gap:6px\"><span class=\"av sm\" style=\"background: {{p.bg}}\">{{p.init}}</span>{{p.name}}</span><span class=\"hb-t\"><span class=\"hb-f\" style=\"display:block;width: {{p.pct}}%;background:var(--danger)\"></span></span><b class=\"num\">{{p.n}}</b></div></sc-for></section>\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:12px\"><h2 class=\"h2\">دلیل ارجاع‌ها</h2><div class=\"row wrap\" style=\"gap:28px\"><div class=\"donut\" style=\"background: conic-gradient({{rp.donut}})\" role=\"img\" aria-label=\"{{rp.donutAria}}\"><div class=\"donut-c\"><div><b class=\"num\" style=\"font-size:24px\">{{rp.retTotal}}</b><div class=\"xs subtle\">ارجاع</div></div></div></div><div style=\"display:flex;flex-direction:column;gap:8px\"><sc-for list=\"{{rp.legend}}\" as=\"l\" hint-placeholder-count=\"3\"><div class=\"row small\"><i class=\"{{l.lbl}}\" style=\"width:10px;height:10px;border-radius:2px;display:block\"></i><span class=\"grow\">{{l.label}}</span><b class=\"num\">{{l.n}}</b></div></sc-for></div></div></section>\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\"><h2 class=\"h2\">گزارش سه‌ماهه‌ی پاداش</h2><sc-if value=\"{{trial}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill P-ys\">دوره‌ی آزمایشی: پاداشی محاسبه نمی‌شود</span></sc-if><sc-for list=\"{{rp.bonus}}\" as=\"b\" hint-placeholder-count=\"3\"><div class=\"row\"><span class=\"av sm\" style=\"background: {{b.bg}}\">{{b.init}}</span><span class=\"grow small\">{{b.name}} <span class=\"subtle xs\">· {{b.sec}}</span></span><span class=\"kt s {{b.ktCls}}\">{{b.kt}}</span><span class=\"pill {{b.pill}}\">{{b.st}}</span></div></sc-for></section>\n</div>\n</div>\n</sc-if>\n<sc-if value=\"{{pg.settings}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\">\n<h1 class=\"h1\">تنظیمات</h1>\n<div class=\"tabs\" role=\"tablist\"><sc-for list=\"{{st.tabs}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" role=\"tab\" aria-selected=\"{{t.on}}\" onClick=\"{{t.pick}}\"><svg class=\"ic\"><use href=\"#{{t.icon}}\"></use></svg>{{t.label}}</button></sc-for></div>\n<sc-if value=\"{{st.tTeams}}\" hint-placeholder-val=\"{{ true }}\">\n<section style=\"display:flex;flex-direction:column;gap:12px\">\n<div class=\"row sb wrap\"><h2 class=\"h2\"><svg class=\"ic md\"><use href=\"#i-team\"></use></svg>واحدها و تیم‌ها</h2><div class=\"row\"><button class=\"btn\" onClick=\"{{hdr.newSection}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>تیم تازه</button><button class=\"btn btn-p\" onClick=\"{{hdr.newTeam}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>واحد تازه</button></div></div>\n<p class=\"small muted\" style=\"line-height:1.8\">هر تیم تابلوی خودش را دارد و اعضایش فقط کارهای تیم خودشان را می‌بینند. کاری که به «کل تیم» سپرده شود در صف تابلوی تیم می‌نشیند تا خودشان تقسیم کنند.</p>\n<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr));gap:12px\">\n<sc-for list=\"{{st.teams}}\" as=\"t\" hint-placeholder-count=\"2\"><div class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\">\n<div class=\"row\"><span class=\"av\" style=\"background: {{t.bg}}\"><svg class=\"ic xs\"><use href=\"#i-team\"></use></svg></span><b class=\"grow\">{{t.name}}</b><span class=\"xs subtle num\">{{t.n}} نفر</span></div>\n<sc-for list=\"{{t.secs}}\" as=\"s\" hint-placeholder-count=\"3\"><div class=\"row wrap\" style=\"background:var(--btn);border-radius:8px;padding:8px 10px;gap:8px\"><span class=\"bsq\" style=\"background: {{s.bg}}\"></span><div class=\"grow\" style=\"line-height:1.5;min-width:120px\"><b class=\"small\">تیم {{s.name}}</b><div class=\"xs subtle\">{{s.lists}}</div></div><div class=\"avs\"><sc-for list=\"{{s.avs}}\" as=\"a\" hint-placeholder-count=\"2\"><span class=\"av sm\" style=\"background: {{a.bg}}\" title=\"{{a.name}}\">{{a.init}}</span></sc-for></div><button class=\"btn btn-s\" onClick=\"{{s.board}}\">تابلو</button><button class=\"btn btn-s\" onClick=\"{{s.manage}}\">اعضا</button></div></sc-for>\n<button class=\"btn btn-s\" style=\"align-self:flex-start\" onClick=\"{{t.addSec}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>افزودن تیم</button>\n</div></sc-for>\n</div>\n<div class=\"row sb wrap\" style=\"margin-top:12px\"><h2 class=\"h2\"><svg class=\"ic md\"><use href=\"#i-board\"></use></svg>تابلوهای واحد و مراحل</h2><button class=\"btn btn-p\" onClick=\"{{hdr.newBoard}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>تابلوی تازه</button></div>\n<sc-for list=\"{{st.boards}}\" as=\"b\" hint-placeholder-count=\"2\"><div class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\">\n<div class=\"row\"><span class=\"bsq\" style=\"background: {{b.bg}}\"></span><b class=\"grow\">{{b.name}}</b><span class=\"xs subtle\">{{b.team}}</span></div>\n<div class=\"row wrap\" style=\"gap:6px\"><sc-for list=\"{{b.lists}}\" as=\"l\" hint-placeholder-count=\"3\"><span class=\"lchip\" title=\"{{l.tip}}\"><i class=\"{{l.lbl}}\"></i>{{l.name}}<span class=\"xs subtle\">{{l.sub}}</span></span><sc-if value=\"{{l.arrow}}\" hint-placeholder-val=\"{{ false }}\"><svg class=\"ic xs\" style=\"color:var(--text3)\"><use href=\"#i-chev-l\"></use></svg></sc-if></sc-for><button class=\"btn btn-s\" style=\"height:28px\" onClick=\"{{b.addList}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>افزودن لیست روی تابلو</button></div>\n</div></sc-for>\n</section>\n</sc-if>\n<sc-if value=\"{{st.tPeople}}\" hint-placeholder-val=\"{{ false }}\">\n<section class=\"box\" style=\"padding:6px\">\n<div class=\"row sb\" style=\"padding:8px 10px\"><h2 class=\"h2\">اعضای فضای کار</h2><button class=\"btn btn-p\" onClick=\"{{addStaff}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>افزودن عضو</button></div>\n<sc-for list=\"{{st.people}}\" as=\"p\" hint-placeholder-count=\"3\"><div class=\"rowc\"><span class=\"av\" style=\"background: {{p.bg}}\">{{p.init}}</span><div class=\"grow\" style=\"line-height:1.5\"><b class=\"small\">{{p.name}}</b><sc-if value=\"{{p.isNew}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill P-gs\" style=\"height:20px;margin-inline-start:6px\">تازه</span></sc-if><div class=\"xs subtle num\" dir=\"ltr\" style=\"text-align:right\">{{p.phone}}</div></div><div class=\"row wrap\" style=\"gap:4px;max-width:300px\"><sc-for list=\"{{p.secs}}\" as=\"s\" hint-placeholder-count=\"3\"><span class=\"lchip\" style=\"height:24px\"><i style=\"background: {{s.bg}}\"></i>{{s.name}}</span></sc-for></div><button class=\"{{p.swCls}}\" role=\"switch\" aria-checked=\"{{p.active}}\" aria-label=\"فعال بودن {{p.name}}\" onClick=\"{{p.toggle}}\"></button></div></sc-for>\n</section>\n</sc-if>\n<sc-if value=\"{{st.tDaily}}\" hint-placeholder-val=\"{{ false }}\">\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:14px;max-width:720px\">\n<h2 class=\"h2\"><svg class=\"ic md\"><use href=\"#i-report\"></use></svg>گزارش روزانه</h2>\n<sc-for list=\"{{st.daily}}\" as=\"d\" hint-placeholder-count=\"3\"><div class=\"row\"><div class=\"grow\" style=\"line-height:1.6\"><b class=\"small\">{{d.label}}</b><div class=\"xs subtle\">{{d.sub}}</div></div><button class=\"{{d.swCls}}\" role=\"switch\" aria-checked=\"{{d.on}}\" aria-label=\"{{d.label}}\" onClick=\"{{d.toggle}}\"></button></div></sc-for>\n<div class=\"row\"><span class=\"grow small b\">زمان یادآوری</span><select class=\"inp\" style=\"width:120px\" aria-label=\"زمان یادآوری\" value=\"{{st.remTime}}\" onChange=\"{{st.onRem}}\"><option value=\"17\">۱۷:۰۰</option><option value=\"18\">۱۸:۰۰</option><option value=\"19\">۱۹:۰۰</option></select></div>\n<div class=\"call gray\"><span class=\"xs b muted\">پیش‌نمایش آنچه پرسنل می‌بینند</span><div class=\"dr\"><span class=\"drb\"><i class=\"dot-g\"></i>طبق برنامه</span><span class=\"drb\"><i class=\"dot-y\"></i>کمی عقبم</span><span class=\"drb\"><i class=\"dot-r\"></i>گیر کرده‌ام</span></div><span class=\"auto\"><svg class=\"ic xs\" style=\"margin-top:5px\"><use href=\"#i-refresh\"></use></svg>خودکار: ۲ مورد از چک‌لیست · نسخه‌ی ۲ بارگذاری شد</span></div>\n</section>\n</sc-if>\n<sc-if value=\"{{st.tSms}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"g2\">\n<section class=\"box\" style=\"padding:6px\"><sc-for list=\"{{st.sms}}\" as=\"r\" hint-placeholder-count=\"3\"><div class=\"rowc\"><span class=\"pill {{r.pill}}\">{{r.rec}}</span><button class=\"tlink grow\" onClick=\"{{r.pick}}\">{{r.ev}}</button><button class=\"{{r.swCls}}\" role=\"switch\" aria-checked=\"{{r.on}}\" aria-label=\"پیامک برای {{r.ev}}\" onClick=\"{{r.toggle}}\"></button></div></sc-for></section>\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:10px\"><b>{{st.smsSel.ev}}</b><textarea class=\"inp\" aria-label=\"متن پیامک\" value=\"{{st.smsSel.text}}\" onChange=\"{{st.smsSel.onText}}\"></textarea><div class=\"row wrap\" style=\"gap:4px\"><sc-for list=\"{{st.smsSel.vars}}\" as=\"v\" hint-placeholder-count=\"3\"><button class=\"btn btn-s\" style=\"height:26px\" onClick=\"{{v.ins}}\">{{v.label}}</button></sc-for></div><div style=\"background:var(--btn);border-radius:16px 16px 16px 4px;padding:10px 14px;align-self:flex-start;max-width:320px;line-height:1.8\">{{st.smsSel.preview}}</div><span class=\"xs subtle num\">{{st.smsSel.chars}} کاراکتر · {{st.smsSel.parts}} پیامک</span><sc-if value=\"{{st.smsSel.warn}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill P-ys\" style=\"align-self:flex-start;height:auto;padding:4px 8px;white-space:normal\">هر پیامک فارسی ۷۰ کاراکتر است؛ این متن {{st.smsSel.parts}} پیامک حساب می‌شود.</span></sc-if></section>\n</div>\n</sc-if>\n<sc-if value=\"{{st.tScore}}\" hint-placeholder-val=\"{{ false }}\">\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;gap:14px;max-width:720px\">\n<div class=\"row sb\"><h2 class=\"h2\">امتیازدهی</h2><div class=\"row small\"><span>دوره‌ی آزمایشی</span><button class=\"{{trialSw}}\" role=\"switch\" aria-checked=\"{{trial}}\" aria-label=\"دوره‌ی آزمایشی\" onClick=\"{{toggleTrial}}\"></button></div></div>\n<div class=\"seg\" style=\"align-self:flex-start\"><sc-for list=\"{{st.scSecs}}\" as=\"s\" hint-placeholder-count=\"3\"><button class=\"{{s.cls}}\" onClick=\"{{s.pick}}\">{{s.label}}</button></sc-for></div>\n<sc-for list=\"{{st.weights}}\" as=\"w\" hint-placeholder-count=\"3\"><div class=\"row\"><label class=\"small grow\" for=\"{{w.id}}\">{{w.name}}</label><input id=\"{{w.id}}\" type=\"range\" min=\"0\" max=\"60\" step=\"5\" value=\"{{w.v}}\" onChange=\"{{w.on}}\" style=\"width:220px;accent-color:#0C66E4\"><b class=\"num\" style=\"width:44px;text-align:left\">{{w.vTxt}}</b></div></sc-for>\n<span class=\"pill {{st.sumPill}}\" style=\"align-self:flex-start\">جمع: {{st.sumTxt}}</span>\n<div class=\"row wrap\" style=\"gap:16px\"><sc-for list=\"{{st.levels}}\" as=\"l\" hint-placeholder-count=\"3\"><div class=\"row\"><span class=\"kt s {{l.ktCls}}\">{{l.kt}}</span><input class=\"inp num\" style=\"width:64px\" aria-label=\"مرز {{l.kt}} عیار\" value=\"{{l.v}}\" onChange=\"{{l.on}}\"></div></sc-for></div>\n</section>\n</sc-if>\n<sc-if value=\"{{st.tGallery}}\" hint-placeholder-val=\"{{ false }}\">\n<section class=\"box pad row wrap\" style=\"gap:24px;align-items:flex-start;max-width:720px\">\n<img src=\"assets/img/rasta-logo.png\" alt=\"لوگوی گالری\" style=\"width:120px;height:120px;border-radius:12px\">\n<div class=\"grow\" style=\"display:flex;flex-direction:column;gap:12px;min-width:240px\">\n<div class=\"fld\"><label for=\"st-gn\">نام گالری</label><input id=\"st-gn\" class=\"inp\" value=\"{{st.gName}}\" onChange=\"{{st.onGName}}\"></div>\n<div class=\"row small\" style=\"color:var(--okT)\"><svg class=\"ic\"><use href=\"#i-shield\"></use></svg>آخرین پشتیبان: امروز، ۰۳:۰۰ ✓</div>\n<a class=\"btn\" href=\"install.html\" style=\"align-self:flex-start\"><svg class=\"ic\"><use href=\"#i-mobile\"></use></svg>راهنمای نصب روی گوشی</a>\n</div>\n</section>\n</sc-if>\n</div>\n</sc-if>\n<sc-if value=\"{{pg.score}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"page\" style=\"max-width:900px\">\n<h1 class=\"h1\">امتیاز من</h1>\n<sc-if value=\"{{trial}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"banner\" style=\"border-radius:6px\"><svg class=\"ic\"><use href=\"#i-alert\"></use></svg>دوره‌ی آزمایشی: پاداشی محاسبه نمی‌شود.</div></sc-if>\n<sc-if value=\"{{ms.insufficient}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"box empty\" style=\"padding:56px 20px\"><svg class=\"ic xl\" style=\"color:var(--text3)\"><use href=\"#i-hourglass\"></use></svg><b>داده‌ی کافی نیست</b><span class=\"small\">حداقل ۵ کار در فصل لازم است؛ تا امروز <span class=\"num\">{{ms.tasks}}</span> کار.</span></div></sc-if>\n<sc-if value=\"{{ms.enough}}\" hint-placeholder-val=\"{{ true }}\">\n<section class=\"box pad row wrap\" style=\"gap:28px;justify-content:center\"><span class=\"kt l {{ms.ktCls}}\">{{ms.kt}}<small>عیار</small></span><div style=\"min-width:240px;display:flex;flex-direction:column;gap:8px\"><span class=\"small muted\">امتیاز این فصل</span><b class=\"num\" style=\"font-size:36px;font-weight:600;line-height:1.1\">{{ms.score}}</b><div class=\"prog\"><i style=\"width: {{ms.scoreN}}%\"></i></div><span class=\"small\" style=\"color:var(--blue)\">{{ms.toNext}}</span></div></section>\n<div style=\"display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px\"><sc-for list=\"{{ms.metrics}}\" as=\"m\" hint-placeholder-count=\"3\"><div class=\"box pad\" style=\"display:flex;flex-direction:column;gap:6px\"><span class=\"xs b muted\">{{m.name}}</span><b class=\"num\" style=\"font-size:20px;font-weight:600\">{{m.val}}</b><div class=\"prog\"><i style=\"width: {{m.pct}}%\"></i></div><span class=\"xs subtle\">{{m.plain}}</span></div></sc-for></div>\n<section class=\"box\" style=\"padding:6px\"><h2 class=\"h2\" style=\"padding:10px 12px\">ارجاع‌های من</h2>\n<sc-for list=\"{{ms.returns}}\" as=\"r\" hint-placeholder-count=\"3\"><div class=\"rowc\"><div class=\"grow\" style=\"line-height:1.6\"><span class=\"small\">{{r.title}}</span><div class=\"xs subtle\"><span class=\"num\">{{r.code}}</span> · {{r.date}}</div></div><span class=\"pill {{r.rPill}}\">{{r.reason}}</span><sc-if value=\"{{r.hasStatus}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill {{r.sPill}}\">{{r.status}}</span></sc-if><sc-if value=\"{{r.canObj}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{r.obj}}\"><svg class=\"ic\"><use href=\"#i-flag\"></use></svg>اعتراض</button></sc-if></div></sc-for>\n</section>\n</sc-if>\n</div>\n</sc-if>\n</sc-if>\n</div>\n</div>\n</sc-if>\n<sc-if value=\"{{loggedIn}}\" hint-placeholder-val=\"{{ true }}\">\n<sc-if value=\"{{anyPop}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"scrim\" aria-label=\"بستن منو\" onClick=\"{{closePops}}\"></button></sc-if>\n<sc-if value=\"{{qm.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"qfix\" style=\"top: {{qm.y}}px; left: {{qm.x}}px\" role=\"menu\" aria-label=\"ویرایش سریع\">\n<button class=\"mi\" onClick=\"{{qm.openCard}}\"><svg class=\"ic\"><use href=\"#i-card\"></use></svg>باز کردن کارت</button>\n<sc-if value=\"{{qm.canAssign}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{qm.assign}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>{{qm.assignLabel}}</button></sc-if>\n<sc-if value=\"{{qm.canClaim}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"mi\" onClick=\"{{qm.claim}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>{{qm.claimLabel}}</button></sc-if>\n<div class=\"mh\">انتقال به</div>\n<sc-for list=\"{{qm.moves}}\" as=\"mv\" hint-placeholder-count=\"4\"><button class=\"mi\" onClick=\"{{mv.go}}\" disabled=\"{{mv.cur}}\"><span class=\"lbl {{mv.lbl}}\" style=\"height:10px;width:20px;padding:0\"></span><span class=\"grow\">{{mv.label}}</span><sc-if value=\"{{mv.cur}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"xs subtle\">فعلی</span></sc-if></button></sc-for>\n<sc-if value=\"{{qm.isMgr}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"msep\"></div>\n<button class=\"mi\" onClick=\"{{qm.urgent}}\"><svg class=\"ic\"><use href=\"#i-zap\"></use></svg>{{qm.urgentLabel}}</button>\n<button class=\"mi dan\" onClick=\"{{qm.cancel}}\"><svg class=\"ic\"><use href=\"#i-archive\"></use></svg>لغو و بایگانی</button></sc-if>\n</div></sc-if>\n\n<sc-if value=\"{{cb.open}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"ov\" onClick=\"{{cb.bg}}\" onKeyDown=\"{{cb.esc}}\">\n<div class=\"cbk\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cb-t\" onClick=\"{{cb.bodyClick}}\">\n<button class=\"ib cbk-x\" aria-label=\"بستن کارت\" onClick=\"{{cb.close}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button>\n<sc-if value=\"{{cb.hasCover}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"cbk-cov\"><svg class=\"art {{cb.coverStyle}}\" aria-hidden=\"true\"><use href=\"#{{cb.art}}\"></use><use class=\"u2\" href=\"#{{cb.art}}\"></use></svg></div></sc-if>\n<div class=\"cbk-h\"><svg class=\"ic md\" style=\"margin-top:7px;color:var(--text2)\"><use href=\"#i-card\"></use></svg><div class=\"grow\">\n<sc-if value=\"{{cb.tView}}\" hint-placeholder-val=\"{{ true }}\"><h2 class=\"cbk-t\" id=\"cb-t\"><button class=\"lt-btn\" style=\"font:inherit;font-size:20px;font-weight:600;text-align:right\" onClick=\"{{cb.editTitle}}\" disabled=\"{{cb.isArch}}\">{{cb.title}}</button></h2></sc-if>\n<sc-if value=\"{{cb.tEdit}}\" hint-placeholder-val=\"{{ false }}\"><textarea class=\"inp\" id=\"cb-t\" aria-label=\"عنوان کارت\" style=\"font-size:18px;font-weight:600;min-height:44px\" value=\"{{cb.tText}}\" onChange=\"{{cb.onTText}}\" onKeyDown=\"{{cb.tKey}}\" onBlur=\"{{cb.saveTitle}}\" autoFocus=\"{{ true }}\"></textarea></sc-if>\n<div class=\"small muted row wrap\" style=\"gap:6px;margin-top:2px\">در لیست<span class=\"lchip\" style=\"height:22px\"><i class=\"{{cb.listLbl}}\"></i>{{cb.listName}}</span><span class=\"subtle\">·</span><span class=\"num subtle\">{{cb.code}}</span><span class=\"subtle\">·</span><span class=\"subtle\">{{cb.boardName}}</span><sc-if value=\"{{cb.hasTl}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"subtle\">·</span><button class=\"tlink small\" onClick=\"{{cb.goTeam}}\">{{cb.tlTeam}}: {{cb.tlName}}</button></sc-if></div></div></div>\n<div class=\"cbk-body\">\n<div style=\"display:flex;flex-direction:column;gap:24px;min-width:0\">\n<div class=\"meta\">\n<sc-if value=\"{{cb.showWho}}\" hint-placeholder-val=\"{{ true }}\"><div><div class=\"meta-k\">اعضا</div><div class=\"row\" style=\"min-height:32px\">\n<sc-if value=\"{{cb.hasWho}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"avs\"><sc-for list=\"{{cb.whos}}\" as=\"w\" hint-placeholder-count=\"1\"><span class=\"av\" style=\"background: {{w.bg}}\" title=\"{{w.name}}\">{{w.init}}</span></sc-for></div><span class=\"small\">{{cb.who}}</span></sc-if>\n<sc-if value=\"{{cb.isPool}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill P-ps\"><svg class=\"ic xs\"><use href=\"#i-team\"></use></svg>{{cb.poolTxt}}</span></sc-if>\n<sc-if value=\"{{cb.noWho}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle\">هنوز سپرده نشده</span></sc-if>\n<sc-if value=\"{{cb.canAddWho}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib round\" aria-label=\"سپردن و اعضا\" onClick=\"{{cb.addWho}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg></button></sc-if>\n</div></div></sc-if>\n<sc-if value=\"{{cb.hasLbls}}\" hint-placeholder-val=\"{{ true }}\"><div><div class=\"meta-k\">برچسب‌ها</div><div class=\"lbls\" style=\"min-height:32px;align-items:center\"><sc-for list=\"{{cb.lbls}}\" as=\"g\" hint-placeholder-count=\"1\"><span class=\"lbl {{g.cls}}\" style=\"height:28px;padding:0 10px\">{{g.t}}</span></sc-for></div></div></sc-if>\n<sc-if value=\"{{cb.hasDue}}\" hint-placeholder-val=\"{{ true }}\"><div><div class=\"meta-k\">تاریخ تحویل</div><span class=\"row small\" style=\"min-height:32px\">{{cb.dueFull}}<sc-if value=\"{{cb.hasDueTag}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg {{cb.dueCls}}\" style=\"height:20px\">{{cb.dueTag}}</span></sc-if></span></div></sc-if>\n<sc-if value=\"{{cb.hasSpec}}\" hint-placeholder-val=\"{{ true }}\"><div><div class=\"meta-k\">مشخصات</div><span class=\"row small\" style=\"min-height:32px\">{{cb.spec}}</span></div></sc-if>\n<sc-if value=\"{{cb.hasLink}}\" hint-placeholder-val=\"{{ false }}\"><div><div class=\"meta-k\">کارت مرتبط</div><button class=\"lnk\" onClick=\"{{cb.openLink}}\"><svg class=\"ic xs\"><use href=\"#i-link\"></use></svg>{{cb.linkTxt}}</button></div></sc-if>\n</div>\n<sc-if value=\"{{cb.hasCall}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"call {{cb.callCls}}\"><div class=\"row\" style=\"gap:10px;align-items:flex-start\"><svg class=\"ic md\" style=\"margin-top:2px;flex:none\"><use href=\"#{{cb.callIcon}}\"></use></svg><div class=\"grow\" style=\"line-height:1.7\"><b>{{cb.callTitle}}</b><sc-if value=\"{{cb.hasCallText}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"small muted\">{{cb.callText}}</div></sc-if></div></div><sc-if value=\"{{cb.hasCallBtns}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row wrap\" style=\"padding-inline-start:30px\"><sc-for list=\"{{cb.callBtns}}\" as=\"b\" hint-placeholder-count=\"2\"><button class=\"btn {{b.cls}}\" onClick=\"{{b.go}}\"><svg class=\"ic\"><use href=\"#{{b.icon}}\"></use></svg>{{b.label}}</button></sc-for></div></sc-if></div></sc-if>\n<sc-if value=\"{{cb.hasFb}}\" hint-placeholder-val=\"{{ false }}\"><section class=\"sec\"><svg class=\"ic md\" style=\"color:var(--dangerT)\"><use href=\"#i-return\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">بازخورد مدیر<span class=\"pill P-rs\">{{cb.fb.reason}}</span></div>\n<sc-if value=\"{{cb.fb.hasVoice}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"vp\"><button class=\"vp-b\" aria-label=\"{{cb.fb.v.label}}\" onClick=\"{{cb.fb.v.toggle}}\"><svg class=\"ic fill\"><use href=\"#{{cb.fb.v.icon}}\"></use></svg></button><span class=\"wave\"><sc-for list=\"{{cb.fb.v.bars}}\" as=\"w\" hint-placeholder-count=\"20\"><i class=\"{{w.c}}\" style=\"height: {{w.h}}px\"></i></sc-for></span><span class=\"xs num muted\">{{cb.fb.v.t}}</span></div></sc-if>\n<sc-if value=\"{{cb.fb.hasText}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"cmt\">{{cb.fb.text}}</div></sc-if>\n<sc-if value=\"{{cb.fb.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{cb.fb.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if>\n<sc-if value=\"{{cb.fb.hasAnno}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ver\" style=\"width:168px\" onClick=\"{{cb.fb.openAnno}}\"><span class=\"big-img\" style=\"border-radius:0\"><svg class=\"art {{cb.fb.style}}\"><use href=\"#{{cb.art}}\"></use><use class=\"u2\" href=\"#{{cb.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{cb.fb.path}}\"></path></svg></span><span class=\"ver-b\">علامت‌ها روی نسخه‌ی {{cb.fb.n}}</span></button></sc-if>\n<span class=\"xs subtle\">{{cb.fb.when}}</span>\n</div></section></sc-if>\n<sc-if value=\"{{cb.canUpload}}\" hint-placeholder-val=\"{{ false }}\"><section class=\"{{cb.upCls}}\"><svg class=\"ic md\"><use href=\"#i-upload\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">{{cb.upTitle}}</div>\n<div class=\"row wrap\" style=\"gap:8px\"><sc-for list=\"{{cb.ups}}\" as=\"u\" hint-placeholder-count=\"1\"><span class=\"mini\" style=\"width:72px;height:72px;position:relative\"><svg class=\"art {{u.style}}\"><use href=\"#{{u.art}}\"></use><use class=\"u2\" href=\"#{{u.art}}\"></use></svg><button class=\"ib\" style=\"position:absolute;top:2px;left:2px;width:24px;height:24px;background:var(--card)\" aria-label=\"حذف فایل\" onClick=\"{{u.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></span></sc-for><button class=\"btn\" style=\"height:72px;width:84px;flex-direction:column;gap:4px;font-size:12px\" onClick=\"{{cb.addUp}}\"><svg class=\"ic md\"><use href=\"#i-camera\"></use></svg>عکس یا فایل</button></div>\n<input class=\"inp\" placeholder=\"توضیح کوتاه برای مدیر (اختیاری)\" aria-label=\"توضیح نسخه\" value=\"{{cb.upNote}}\" onChange=\"{{cb.onUpNote}}\">\n<sc-if value=\"{{cb.upErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>حداقل یک فایل یا عکس اضافه کنید.</p></sc-if>\n<button class=\"btn btn-p\" style=\"align-self:flex-start\" onClick=\"{{cb.submit}}\"><svg class=\"ic\"><use href=\"#i-send\"></use></svg>{{cb.submitLabel}}</button>\n</div></section></sc-if>\n<sc-if value=\"{{cb.hasDailyView}}\" hint-placeholder-val=\"{{ false }}\"><section class=\"sec\"><svg class=\"ic md\"><use href=\"#i-report\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">گزارش امروز</div>\n<sc-for list=\"{{cb.reps}}\" as=\"r\" hint-placeholder-count=\"1\"><div class=\"row\" style=\"align-items:flex-start;gap:10px\"><span class=\"av sm\" style=\"background: {{r.bg}}\" title=\"{{r.name}}\">{{r.init}}</span><div class=\"grow\" style=\"line-height:1.7\"><div class=\"row\" style=\"gap:6px\"><b class=\"small\">{{r.name}}</b><span class=\"pill {{r.pill}}\" style=\"height:20px\">{{r.st}}</span></div><div class=\"xs muted\">{{r.line}}</div><sc-if value=\"{{r.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{r.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if></div></div></sc-for>\n</div></section></sc-if>\n<section class=\"sec\"><svg class=\"ic md\"><use href=\"#i-desc\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">توضیحات</div><p style=\"white-space:pre-line;line-height:1.8\">{{cb.desc}}</p>\n<sc-if value=\"{{cb.hasCust}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row wrap small muted\" style=\"gap:16px;background:var(--btn);border-radius:6px;padding:8px 12px\"><span class=\"row\" style=\"gap:6px\"><svg class=\"ic\"><use href=\"#i-user\"></use></svg>{{cb.custName}}</span><span class=\"row num\" style=\"gap:6px\"><svg class=\"ic\"><use href=\"#i-phone\"></use></svg><span dir=\"ltr\">{{cb.custPhone}}</span></span><span class=\"row\" style=\"gap:6px\"><svg class=\"ic\"><use href=\"#{{cb.chIcon}}\"></use></svg>{{cb.chName}}</span></div></sc-if>\n<sc-if value=\"{{cb.hidCust}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"lock\"><svg class=\"ic xs\"><use href=\"#i-lock\"></use></svg>اطلاعات مشتری فقط برای مدیر نمایش داده می‌شود</span></sc-if>\n</div></section>\n<sc-if value=\"{{cb.hasAtt}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"sec\"><svg class=\"ic md\"><use href=\"#i-clip\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">پیوست‌ها و عکس‌های نمونه</div>\n<sc-if value=\"{{cb.noAtt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle\">هنوز پیوستی نیست.</span></sc-if>\n<div class=\"fchips big\"><sc-for list=\"{{cb.atts}}\" as=\"f\" hint-placeholder-count=\"2\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div>\n<sc-if value=\"{{cb.canAtt}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row wrap\"><button class=\"btn\" onClick=\"{{cb.addRef}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس نمونه</button><button class=\"btn\" onClick=\"{{cb.addAtt}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>فایل</button></div></sc-if>\n</div></section></sc-if>\n<sc-if value=\"{{cb.hasVers}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"sec\"><svg class=\"ic md\"><use href=\"#i-layers\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">نسخه‌ها<span class=\"grow\"></span><sc-if value=\"{{cb.canCompare}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{cb.compare}}\"><svg class=\"ic\"><use href=\"#i-compare\"></use></svg>مقایسه</button></sc-if></div><div class=\"vers\"><sc-for list=\"{{cb.vers}}\" as=\"v\" hint-placeholder-count=\"2\"><button class=\"ver\" onClick=\"{{v.open}}\" aria-label=\"{{v.aria}}\"><span class=\"ver-img\" style=\"display:block\"><svg class=\"art {{v.style}}\"><use href=\"#{{v.art}}\"></use><use class=\"u2\" href=\"#{{v.art}}\"></use></svg></span><span class=\"ver-b\"><span class=\"row sb\"><b>{{v.label}}</b><span class=\"pill {{v.pill}}\" style=\"height:20px\">{{v.status}}</span></span><span class=\"subtle\">{{v.when}}</span></span></button></sc-for></div></div></section></sc-if>\n<sc-if value=\"{{cb.showChk}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"sec\"><svg class=\"ic md\"><use href=\"#i-check-sq\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">چک‌لیست</div>\n<sc-if value=\"{{cb.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row\"><span class=\"xs num muted\" style=\"width:34px\">{{cb.chkPct}}</span><div class=\"{{cb.progCls}}\"><i style=\"width: {{cb.chkPctN}}%\"></i></div></div></sc-if>\n<sc-for list=\"{{cb.chk}}\" as=\"k\" hint-placeholder-count=\"3\"><button class=\"{{k.cls}}\" role=\"checkbox\" aria-checked=\"{{k.on}}\" onClick=\"{{k.toggle}}\" disabled=\"{{k.dis}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"t\">{{k.t}}</span></button></sc-for>\n<sc-if value=\"{{cb.chkAdding}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row\"><input class=\"inp\" aria-label=\"مورد تازه\" placeholder=\"مورد تازه\" value=\"{{cb.chkText}}\" onChange=\"{{cb.onChkText}}\" onKeyDown=\"{{cb.chkKey}}\" autoFocus=\"{{ true }}\"><button class=\"btn btn-p\" onClick=\"{{cb.chkAdd}}\">افزودن</button><button class=\"btn\" onClick=\"{{cb.chkCancel}}\">لغو</button></div></sc-if>\n<sc-if value=\"{{cb.chkCanAdd}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"btn\" style=\"align-self:flex-start\" onClick=\"{{cb.chkOpen}}\">افزودن مورد</button></sc-if>\n</div></section></sc-if>\n<section class=\"sec\"><svg class=\"ic md\"><use href=\"#i-act\"></use></svg><div class=\"sec-c\"><div class=\"sec-t\">فعالیت و گزارش روزانه<span class=\"grow\"></span><button class=\"btn\" onClick=\"{{cb.toggleDetails}}\">{{cb.detailsLabel}}</button></div>\n<div class=\"act\"><span class=\"av\" style=\"background: {{user.bg}}\">{{user.init}}</span><div class=\"act-b composer\">\n<sc-if value=\"{{cb.isAssignee}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row wrap\" style=\"gap:6px\"><span class=\"pill {{cb.myStPill}}\">{{cb.myStTxt}}</span><span class=\"xs subtle\">وضعیت امروز (اختیاری):</span></div><div class=\"dr\"><sc-for list=\"{{cb.cChips}}\" as=\"h\" hint-placeholder-count=\"3\"><button class=\"{{h.cls}}\" onClick=\"{{h.pick}}\" aria-pressed=\"{{h.on}}\"><i class=\"{{h.dot}}\"></i>{{h.label}}</button></sc-for></div></sc-if>\n<textarea class=\"inp\" style=\"min-height:52px\" placeholder=\"{{cb.cmtPh}}\" aria-label=\"نوشتن نظر یا گزارش\" value=\"{{cb.cmtText}}\" onChange=\"{{cb.onCmt}}\"></textarea>\n<sc-if value=\"{{cb.hasCFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{cb.cfiles}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<div class=\"row\"><button class=\"btn btn-s\" onClick=\"{{cb.addCFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>فایل یا عکس</button><span class=\"grow\"></span><sc-if value=\"{{cb.cmtTyping}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-p\" onClick=\"{{cb.saveCmt}}\">{{cb.sendLabel}}</button></sc-if></div>\n</div></div>\n<sc-for list=\"{{cb.acts}}\" as=\"a\" hint-placeholder-count=\"3\"><div class=\"act\"><span class=\"av\" style=\"background: {{a.bg}}\">{{a.init}}</span><div class=\"act-b\"><div class=\"small row wrap\" style=\"line-height:1.7;gap:6px\"><b>{{a.who}}</b><span>{{a.text}}</span><sc-if value=\"{{a.hasSt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill {{a.stPill}}\" style=\"height:20px\">{{a.stTxt}}</span></sc-if></div><sc-if value=\"{{a.isCmt}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"cmt\">{{a.body}}</div></sc-if><sc-if value=\"{{a.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{a.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if><sc-if value=\"{{a.hasVoice}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"vp\"><button class=\"vp-b\" aria-label=\"{{a.v.label}}\" onClick=\"{{a.v.toggle}}\"><svg class=\"ic fill\"><use href=\"#{{a.v.icon}}\"></use></svg></button><span class=\"wave\"><sc-for list=\"{{a.v.bars}}\" as=\"w\" hint-placeholder-count=\"20\"><i class=\"{{w.c}}\" style=\"height: {{w.h}}px\"></i></sc-for></span><span class=\"xs num muted\">{{a.v.t}}</span></div></sc-if><span class=\"xs subtle\">{{a.when}}</span></div></div></sc-for>\n</div></section>\n</div>\n<aside class=\"cbk-side\">\n<sc-if value=\"{{cb.isMgr}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"side-h\">کارت</div>\n<button class=\"btn sbtn\" onClick=\"{{cb.assign}}\" disabled=\"{{cb.noAssign}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>سپردن و اعضا</button>\n<div class=\"rel\"><button class=\"btn sbtn\" onClick=\"{{cb.popDates}}\" disabled=\"{{cb.noDates}}\"><svg class=\"ic\"><use href=\"#i-clock\"></use></svg>تاریخ تحویل</button>\n<sc-if value=\"{{cb.pDates}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:38px;left:0\"><div class=\"pop-h\"><b>تاریخ تحویل</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cb.popClose}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"flab\" style=\"margin-bottom:4px\">روز</div><div class=\"opts\"><sc-for list=\"{{cb.dueOpts}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<div class=\"flab\" style=\"margin:10px 0 4px\">ساعت</div><div class=\"opts\"><sc-for list=\"{{cb.dueHours}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<button class=\"btn btn-w\" style=\"margin-top:10px\" onClick=\"{{cb.dueCal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>انتخاب از تقویم</button>\n<button class=\"btn btn-s btn-w\" style=\"margin-top:4px\" onClick=\"{{cb.duePause}}\"><svg class=\"ic\"><use href=\"#i-pause-c\"></use></svg>{{cb.pauseLabel}}</button></div></sc-if></div>\n<button class=\"btn sbtn\" onClick=\"{{cb.addAtt}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست</button>\n<div class=\"rel\"><button class=\"btn sbtn\" onClick=\"{{cb.popUrgent}}\"><svg class=\"ic\"><use href=\"#i-zap\"></use></svg>{{cb.urgentLabel}}</button>\n<sc-if value=\"{{cb.pUrgent}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:38px;left:0\"><div class=\"pop-h\"><b>علامت فوری</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cb.popClose}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div><p class=\"small muted\" style=\"margin-bottom:8px\">کارت با برچسب قرمز بالای لیست می‌نشیند و به اعضای کارت خبر می‌رسد.</p>\n<div class=\"opts\"><sc-for list=\"{{cb.ugQuick}}\" as=\"q\" hint-placeholder-count=\"3\"><button class=\"{{q.cls}}\" onClick=\"{{q.pick}}\">{{q.label}}</button></sc-for></div>\n<button class=\"btn btn-d btn-w\" style=\"margin-top:10px\" onClick=\"{{cb.ugGo}}\">فوری شود</button></div></sc-if></div>\n<div class=\"rel\"><button class=\"btn sbtn\" onClick=\"{{cb.popMove}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-move\"></use></svg>انتقال</button>\n<sc-if value=\"{{cb.pMove}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:38px;left:0\"><div class=\"pop-h\"><b>انتقال کارت</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cb.popClose}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div><div class=\"flab\" style=\"margin-bottom:4px\">لیست در {{cb.boardName}}</div>\n<sc-for list=\"{{cb.mvLists}}\" as=\"l\" hint-placeholder-count=\"4\"><button class=\"{{l.cls}}\" onClick=\"{{l.pick}}\" disabled=\"{{l.cur}}\"><span class=\"lbl {{l.lbl}}\" style=\"height:10px;width:20px;padding:0\"></span><span class=\"grow small\">{{l.name}}</span><sc-if value=\"{{l.cur}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"xs subtle\">فعلی</span></sc-if></button></sc-for></div></sc-if></div>\n<div class=\"rel\"><button class=\"btn sbtn\" onClick=\"{{cb.popTeam}}\" disabled=\"{{cb.noTeam}}\"><svg class=\"ic\"><use href=\"#i-team\"></use></svg>ارسال به واحد دیگر</button>\n<sc-if value=\"{{cb.pTeam}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:38px;left:0\"><div class=\"pop-h\"><b>ارسال به واحد دیگر</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cb.popClose}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div><p class=\"small muted\" style=\"margin-bottom:8px\">یک کارت مرتبط در تابلوی آن واحد ساخته می‌شود؛ این کارت سر جایش می‌ماند.</p>\n<sc-for list=\"{{cb.xBoards}}\" as=\"t\" hint-placeholder-count=\"1\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\"><span class=\"radio\"></span><span class=\"bsq\" style=\"background: {{t.bg}}\"></span><span class=\"grow small\">{{t.name}}</span></button></sc-for>\n<div class=\"fld\" style=\"margin-top:8px\"><label for=\"x-t\">عنوان کارت تازه</label><input id=\"x-t\" class=\"inp\" value=\"{{cb.xTitle}}\" onChange=\"{{cb.onXTitle}}\"></div>\n<button class=\"btn btn-p btn-w\" style=\"margin-top:10px\" onClick=\"{{cb.xGo}}\">ساخت کارت</button></div></sc-if></div>\n<button class=\"btn sbtn\" onClick=\"{{cb.edit}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>ویرایش مشخصات</button>\n<div class=\"side-h\" style=\"margin-top:12px\">اقدامات</div>\n<sc-if value=\"{{cb.isArch}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn sbtn\" onClick=\"{{cb.restore}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>بازگرداندن</button></sc-if>\n<sc-if value=\"{{cb.notArch}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"rel\"><button class=\"btn sbtn\" onClick=\"{{cb.popCancel}}\" style=\"color:var(--dangerT)\"><svg class=\"ic\"><use href=\"#i-archive\"></use></svg>لغو و بایگانی</button>\n<sc-if value=\"{{cb.pCancel}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"pop\" style=\"top:auto;bottom:38px;left:0\"><div class=\"pop-h\"><b>لغو و بایگانی</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cb.popClose}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div><p class=\"small muted\" style=\"margin-bottom:8px\">کارت به آرشیو «لغوشده‌ها» می‌رود و هر وقت بخواهید برمی‌گردد.</p>\n<div class=\"opts\"><sc-for list=\"{{cb.cnQuick}}\" as=\"q\" hint-placeholder-count=\"3\"><button class=\"{{q.cls}}\" onClick=\"{{q.pick}}\">{{q.label}}</button></sc-for></div>\n<sc-if value=\"{{cb.cnErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\" style=\"margin-top:6px\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>دلیل را انتخاب کنید.</p></sc-if>\n<button class=\"btn btn-d btn-w\" style=\"margin-top:10px\" onClick=\"{{cb.cnGo}}\">لغو و انتقال به آرشیو</button></div></sc-if></div></sc-if>\n</sc-if>\n<sc-if value=\"{{cb.isStf}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"side-h\">کارت</div>\n<sc-if value=\"{{cb.canClaim}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-p sbtn\" onClick=\"{{cb.claim}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>{{cb.claimLabel}}</button></sc-if>\n<button class=\"btn sbtn\" onClick=\"{{cb.addAtt}}\" disabled=\"{{cb.noChk}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست فایل</button>\n<button class=\"btn sbtn\" onClick=\"{{cb.stuck}}\" disabled=\"{{cb.noStuck}}\"><svg class=\"ic\"><use href=\"#i-flag\"></use></svg>گیر کرده‌ام</button>\n<button class=\"btn sbtn\" onClick=\"{{cb.chkOpen}}\" disabled=\"{{cb.noChk}}\"><svg class=\"ic\"><use href=\"#i-check-sq\"></use></svg>مورد چک‌لیست</button>\n</sc-if>\n</aside>\n</div>\n</div>\n</div>\n</sc-if>\n\n<sc-if value=\"{{dlg.open}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"ov\" style=\"z-index:110\" onClick=\"{{dlg.bg}}\" onKeyDown=\"{{dlg.esc}}\">\n<div class=\"{{dlg.cls}}\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"dlg-t\">\n<div class=\"dlg-h\"><div class=\"grow\"><h2 class=\"dlg-t\" id=\"dlg-t\">{{dlg.title}}</h2><sc-if value=\"{{dlg.hasSub}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small muted\" style=\"margin-top:2px\">{{dlg.sub}}</p></sc-if></div><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{dlg.close}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"dlg-b\">\n<sc-if value=\"{{dlg.isApprove}}\" hint-placeholder-val=\"{{ false }}\"><div style=\"display:flex;flex-direction:column;gap:6px\"><span class=\"flab\">کیفیت این نسخه</span><sc-for list=\"{{ap.grades}}\" as=\"g\" hint-placeholder-count=\"3\"><button class=\"{{g.cls}}\" onClick=\"{{g.pick}}\"><span class=\"radio\"></span><span class=\"grow\" style=\"line-height:1.5\"><b class=\"small\">{{g.label}}</b><span class=\"xs subtle\" style=\"display:block\">{{g.hint}}</span></span></button></sc-for></div></sc-if>\n<sc-if value=\"{{dlg.isAssign}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld\"><span class=\"flab\">۱. کدام مرحله؟</span><div class=\"stgs\"><sc-for list=\"{{as.stages}}\" as=\"g\" hint-placeholder-count=\"3\"><button class=\"{{g.cls}}\" onClick=\"{{g.pick}}\" aria-pressed=\"{{g.on}}\"><b>{{g.name}}</b><span>{{g.sub}}</span></button></sc-for></div>\n<sc-if value=\"{{as.hasSkip}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"xs\" style=\"color:var(--warnT);display:flex;gap:6px;align-items:center\"><svg class=\"ic xs\"><use href=\"#i-forward\"></use></svg>{{as.skipTxt}}</span></sc-if></div>\n<div class=\"fld\"><span class=\"flab\">۲. به چه کسی؟ (یک یا چند نفر، یا کل تیم)</span><div style=\"display:flex;flex-direction:column;gap:4px\">\n<button class=\"{{as.poolCls}}\" role=\"checkbox\" aria-checked=\"{{as.pool}}\" onClick=\"{{as.togglePool}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"av\" style=\"background:var(--purpleT)\"><svg class=\"ic xs\" style=\"color:#fff\"><use href=\"#i-team\"></use></svg></span><span class=\"grow\" style=\"line-height:1.4\"><span class=\"small b\" style=\"display:block\">کل تیم {{as.teamName}} — خودشان تقسیم کنند</span><span class=\"xs subtle\">{{as.poolSub}}</span></span></button>\n<sc-for list=\"{{as.staff}}\" as=\"p\" hint-placeholder-count=\"2\"><button class=\"{{p.cls}}\" role=\"checkbox\" aria-checked=\"{{p.on}}\" onClick=\"{{p.toggle}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"av\" style=\"background: {{p.bg}}\">{{p.init}}</span><span class=\"grow\" style=\"line-height:1.4\"><span class=\"small\" style=\"display:block\">{{p.name}}</span><span class=\"xs subtle\">{{p.load}}</span></span><sc-if value=\"{{p.hasKt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"kt s {{p.ktCls}}\">{{p.kt}}</span></sc-if></button></sc-for>\n<sc-if value=\"{{as.noStaff}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"call gray small\">هنوز کسی در این تیم نیست. از «تنظیمات › اعضا» اضافه کنید.</div></sc-if></div></div>\n<div class=\"fld\"><span class=\"flab\">۳. تحویل: {{as.dueTxt}}</span><div class=\"opts\"><sc-for list=\"{{as.dues}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for><button class=\"opt\" onClick=\"{{as.cal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>{{as.calTxt}}</button></div><div class=\"opts\"><sc-for list=\"{{as.hours}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div></div>\n<div class=\"fld\"><span class=\"flab\">۴. توضیح، فایل یا پیام صوتی (اختیاری)</span>\n<textarea class=\"inp\" style=\"min-height:56px\" aria-label=\"توضیح\" placeholder=\"هر چه طراح باید بداند…\" value=\"{{as.note}}\" onChange=\"{{as.onNote}}\"></textarea>\n<sc-if value=\"{{as.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{as.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<div class=\"row wrap\" style=\"gap:8px;align-items:stretch\"><button class=\"btn\" style=\"height:auto;min-height:44px\" onClick=\"{{as.addFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست فایل یا عکس</button>\n<div class=\"rec grow\" style=\"padding:4px 8px\"><button class=\"{{rec.cls}}\" style=\"width:36px;height:36px\" aria-label=\"برای ضبط پیام صوتی نگه دارید\" onPointerDown=\"{{rec.down}}\" onPointerUp=\"{{rec.up}}\" onPointerLeave=\"{{rec.up}}\"><svg class=\"ic\"><use href=\"#i-mic\"></use></svg></button><div class=\"grow xs\">{{rec.label}}</div><sc-if value=\"{{rec.isRec}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"rec-bars\"><i></i><i style=\"animation-delay:.15s\"></i><i style=\"animation-delay:.3s\"></i></span></sc-if><sc-if value=\"{{rec.has}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" aria-label=\"حذف پیام صوتی\" onClick=\"{{rec.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg></button></sc-if></div></div>\n</div>\n</sc-if>\n<sc-if value=\"{{dlg.isReturn}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld\"><span class=\"flab\">دلیل برگشت</span><div class=\"opts\"><sc-for list=\"{{rt.reasons}}\" as=\"r\" hint-placeholder-count=\"4\"><button class=\"{{r.cls}}\" onClick=\"{{r.pick}}\">{{r.label}}</button></sc-for></div><span class=\"xs subtle\">{{rt.reasonHint}}</span></div>\n<div class=\"fld\"><div class=\"row sb\"><span class=\"flab\">روی نسخه‌ی {{rt.n}} علامت بزنید (اختیاری)</span><div class=\"seg\"><sc-for list=\"{{rt.tools}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\">{{t.label}}</button></sc-for></div></div>\n<div class=\"anno-w\" style=\"width:100%;max-width:300px;align-self:center\" onPointerDown=\"{{rt.aDown}}\" onPointerMove=\"{{rt.aMove}}\" onPointerUp=\"{{rt.aUp}}\"><svg class=\"art {{rt.style}}\"><use href=\"#{{rt.art}}\"></use><use class=\"u2\" href=\"#{{rt.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{rt.path}}\"></path></svg></div>\n<sc-if value=\"{{rt.hasAnno}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-s\" style=\"align-self:center\" onClick=\"{{rt.undoAnno}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>برداشتن آخرین علامت</button></sc-if></div>\n<div class=\"fld\"><label for=\"rt-t\">توضیح</label><textarea id=\"rt-t\" class=\"inp\" style=\"min-height:56px\" placeholder=\"چه چیزی باید اصلاح شود؟\" value=\"{{rt.text}}\" onChange=\"{{rt.onText}}\"></textarea>\n<sc-if value=\"{{rt.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{rt.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<div class=\"row wrap\" style=\"gap:8px;align-items:stretch\"><button class=\"btn\" style=\"height:auto;min-height:44px\" onClick=\"{{rt.addFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست فایل یا عکس</button>\n<div class=\"rec grow\" style=\"padding:4px 8px\"><button class=\"{{rec.cls}}\" style=\"width:36px;height:36px\" aria-label=\"برای ضبط پیام صوتی نگه دارید\" onPointerDown=\"{{rec.down}}\" onPointerUp=\"{{rec.up}}\" onPointerLeave=\"{{rec.up}}\"><svg class=\"ic\"><use href=\"#i-mic\"></use></svg></button><div class=\"grow xs\">{{rec.label}}</div><sc-if value=\"{{rec.has}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" aria-label=\"حذف پیام صوتی\" onClick=\"{{rec.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg></button></sc-if></div></div></div>\n<div class=\"fld\"><span class=\"flab\">تحویل اصلاحیه</span><div class=\"opts\"><sc-for list=\"{{rt.dues}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for><button class=\"opt\" onClick=\"{{rt.cal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>{{rt.calTxt}}</button></div></div>\n</sc-if>\n<sc-if value=\"{{dlg.isSend}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"call gray\" style=\"flex-direction:row;align-items:center\"><span class=\"mini\" style=\"width:56px;height:56px\"><svg class=\"art art-render\"><use href=\"#{{sd.art}}\"></use></svg></span><div class=\"small\" style=\"line-height:1.7\"><b>{{sd.title}}</b><div class=\"muted\">{{sd.cust}}</div></div></div>\n<div class=\"fld\"><span class=\"flab\">از چه راهی فرستادید؟</span><div class=\"opts\"><sc-for list=\"{{sd.chs}}\" as=\"c\" hint-placeholder-count=\"5\"><button class=\"{{c.cls}}\" onClick=\"{{c.pick}}\"><svg class=\"ic\"><use href=\"#{{c.icon}}\"></use></svg>{{c.label}}</button></sc-for></div></div>\n</sc-if>\n<sc-if value=\"{{dlg.isCust}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld\"><span class=\"flab\">مشتری کِی تأیید کرد؟</span><div class=\"opts\"><sc-for list=\"{{co.dates}}\" as=\"d\" hint-placeholder-count=\"3\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div></div>\n<div class=\"fld\"><label for=\"co-n\">یادداشت (اختیاری)</label><textarea id=\"co-n\" class=\"inp\" style=\"min-height:56px\" value=\"{{co.note}}\" onChange=\"{{co.onNote}}\"></textarea></div>\n</sc-if>\n<sc-if value=\"{{dlg.isCreate}}\" hint-placeholder-val=\"{{ false }}\">\n<sc-if value=\"{{cr.showKinds}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"seg\" style=\"align-self:flex-start\"><sc-for list=\"{{cr.kinds}}\" as=\"k\" hint-placeholder-count=\"2\"><button class=\"{{k.cls}}\" onClick=\"{{k.pick}}\">{{k.label}}</button></sc-for></div></sc-if>\n<div class=\"fld {{cr.titleErr}}\"><label for=\"cr-t\">عنوان</label><input id=\"cr-t\" class=\"inp\" value=\"{{cr.title}}\" onChange=\"{{cr.onTitle}}\" placeholder=\"{{cr.titlePh}}\"></div>\n<div class=\"fld\"><span class=\"flab\">عکس‌های نمونه</span><sc-if value=\"{{cr.hasRefs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips big\"><sc-for list=\"{{cr.refs}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if><div class=\"row wrap\"><button class=\"btn\" onClick=\"{{cr.addRefCust}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس مشتری</button><button class=\"btn\" onClick=\"{{cr.addRefUs}}\"><svg class=\"ic\"><use href=\"#i-image\"></use></svg>عکس از گالری خودمان</button></div></div>\n<sc-if value=\"{{cr.isOrder}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"fld\"><span class=\"flab\">نوع</span><div class=\"opts\"><sc-for list=\"{{cr.types}}\" as=\"t\" hint-placeholder-count=\"6\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\"><svg class=\"ic\"><use href=\"#{{t.art}}\"></use></svg>{{t.label}}</button></sc-for></div></div>\n<div class=\"row wrap\" style=\"gap:16px;align-items:flex-start\"><div class=\"fld\"><span class=\"flab\">عیار</span><div class=\"seg\"><sc-for list=\"{{cr.karats}}\" as=\"k\" hint-placeholder-count=\"3\"><button class=\"{{k.cls}}\" onClick=\"{{k.pick}}\">{{k.label}}</button></sc-for></div></div><div class=\"fld grow\"><label for=\"cr-w\">وزن تقریبی (گرم)</label><input id=\"cr-w\" class=\"inp num\" inputmode=\"decimal\" value=\"{{cr.weight}}\" onChange=\"{{cr.onWeight}}\"></div></div>\n<div class=\"row wrap\" style=\"gap:16px;align-items:flex-start\"><div class=\"fld grow {{cr.nameErr}}\"><label for=\"cr-n\">نام مشتری</label><input id=\"cr-n\" class=\"inp\" value=\"{{cr.name}}\" onChange=\"{{cr.onName}}\"></div><div class=\"fld grow {{cr.phoneErr}}\"><label for=\"cr-p\">موبایل مشتری</label><input id=\"cr-p\" class=\"inp num\" dir=\"ltr\" inputmode=\"numeric\" placeholder=\"09…\" value=\"{{cr.phone}}\" onChange=\"{{cr.onPhone}}\"></div></div>\n<div class=\"fld\"><span class=\"flab\">راه ارتباط مشتری</span><div class=\"opts\"><sc-for list=\"{{cr.chs}}\" as=\"c\" hint-placeholder-count=\"5\"><button class=\"{{c.cls}}\" onClick=\"{{c.pick}}\"><svg class=\"ic\"><use href=\"#{{c.icon}}\"></use></svg>{{c.label}}</button></sc-for></div></div>\n</sc-if>\n<div class=\"fld\"><label for=\"cr-d\">توضیحات (اختیاری)</label><textarea id=\"cr-d\" class=\"inp\" style=\"min-height:56px\" value=\"{{cr.desc}}\" onChange=\"{{cr.onDesc}}\"></textarea></div>\n</sc-if>\n<sc-if value=\"{{dlg.isTeam}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld {{tm.nameErr}}\"><label for=\"tm-n\">نام واحد</label><input id=\"tm-n\" class=\"inp\" placeholder=\"مثلاً واحد فروش آنلاین\" value=\"{{tm.name}}\" onChange=\"{{tm.onName}}\"></div>\n<div class=\"fld\"><span class=\"flab\">رنگ</span><div class=\"row wrap\" style=\"gap:8px\"><sc-for list=\"{{tm.colors}}\" as=\"c\" hint-placeholder-count=\"6\"><button class=\"{{c.cls}}\" style=\"background: {{c.bg}}\" aria-label=\"{{c.label}}\" aria-pressed=\"{{c.on}}\" onClick=\"{{c.pick}}\"></button></sc-for></div></div>\n<div class=\"fld\"><label for=\"tm-s\">تیم‌های این واحد</label><input id=\"tm-s\" class=\"inp\" placeholder=\"مثلاً پاسخ به دایرکت، ارسال سفارش\" value=\"{{tm.secs}}\" onChange=\"{{tm.onSecs}}\"><span class=\"xs subtle\">با «،» جدا کنید. هر تیم تابلوی خودش را می‌گیرد و یک لیست کاری در تابلوی واحد می‌شود.</span></div>\n<div class=\"row\"><button class=\"{{tm.boardSw}}\" role=\"switch\" aria-checked=\"{{tm.withBoard}}\" aria-label=\"ساخت تابلو برای واحد\" onClick=\"{{tm.toggleBoard}}\"></button><span class=\"small\">یک تابلو هم با همین لیست‌ها برای واحد بساز</span></div>\n<sc-if value=\"{{tm.withBoard}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row wrap\" style=\"gap:6px\"><sc-for list=\"{{tm.preview}}\" as=\"l\" hint-placeholder-count=\"3\"><span class=\"lchip\"><i class=\"{{l.lbl}}\"></i>{{l.name}}</span></sc-for></div></sc-if>\n</sc-if>\n<sc-if value=\"{{dlg.isSection}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld\"><label for=\"sc-t\">واحد</label><select id=\"sc-t\" class=\"inp\" value=\"{{scn.team}}\" onChange=\"{{scn.onTeam}}\"><sc-for list=\"{{scn.teams}}\" as=\"t\" hint-placeholder-count=\"2\"><option value=\"{{t.id}}\">{{t.name}}</option></sc-for></select></div>\n<div class=\"fld {{scn.nameErr}}\"><label for=\"sc-n\">نام تیم</label><input id=\"sc-n\" class=\"inp\" placeholder=\"مثلاً رندر نهایی\" value=\"{{scn.name}}\" onChange=\"{{scn.onName}}\"></div>\n<div class=\"row\"><button class=\"{{scn.listSw}}\" role=\"switch\" aria-checked=\"{{scn.withList}}\" aria-label=\"ساخت لیست در تابلو\" onClick=\"{{scn.toggleList}}\"></button><span class=\"small\">یک لیست کاری هم در «{{scn.boardName}}» بساز</span></div>\n<span class=\"xs subtle\">تیم تازه تابلوی خودش را با لیست‌های صف، در حال انجام و انجام شد می‌گیرد.</span>\n</sc-if>\n<sc-if value=\"{{dlg.isBoard}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld {{bn.nameErr}}\"><label for=\"bn-n\">نام تابلو</label><input id=\"bn-n\" class=\"inp\" placeholder=\"مثلاً کمپین نوروز\" value=\"{{bn.name}}\" onChange=\"{{bn.onName}}\"></div>\n<div class=\"fld\"><label for=\"bn-t\">واحد</label><select id=\"bn-t\" class=\"inp\" value=\"{{bn.team}}\" onChange=\"{{bn.onTeam}}\"><sc-for list=\"{{bn.teams}}\" as=\"t\" hint-placeholder-count=\"2\"><option value=\"{{t.id}}\">{{t.name}}</option></sc-for></select></div>\n<div class=\"fld\"><span class=\"flab\">پس‌زمینه</span><div class=\"row wrap\" style=\"gap:8px\"><sc-for list=\"{{bn.bgs}}\" as=\"c\" hint-placeholder-count=\"6\"><button class=\"{{c.cls}}\" style=\"background: {{c.bg}}\" aria-label=\"{{c.label}}\" aria-pressed=\"{{c.on}}\" onClick=\"{{c.pick}}\"></button></sc-for></div></div>\n<div class=\"fld\"><span class=\"flab\">لیست‌ها (خودکار از تیم‌های واحد؛ بعداً روی تابلو هم اضافه یا عوض می‌شوند)</span><div class=\"row wrap\" style=\"gap:6px\"><sc-for list=\"{{bn.preview}}\" as=\"l\" hint-placeholder-count=\"3\"><span class=\"lchip\"><i class=\"{{l.lbl}}\"></i>{{l.name}}</span></sc-for></div></div>\n</sc-if>\n<sc-if value=\"{{dlg.isStaff}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"row wrap\" style=\"gap:16px;align-items:flex-start\"><div class=\"fld grow {{sf.nameErr}}\"><label for=\"sf-n\">نام و نام خانوادگی</label><input id=\"sf-n\" class=\"inp\" value=\"{{sf.name}}\" onChange=\"{{sf.onName}}\"></div><div class=\"fld grow {{sf.phoneErr}}\"><label for=\"sf-p\">موبایل</label><input id=\"sf-p\" class=\"inp num\" dir=\"ltr\" inputmode=\"numeric\" placeholder=\"09…\" value=\"{{sf.phone}}\" onChange=\"{{sf.onPhone}}\"></div></div>\n<div class=\"fld {{sf.secErr}}\"><span class=\"flab\">تیم‌ها</span><sc-for list=\"{{sf.teams}}\" as=\"t\" hint-placeholder-count=\"2\"><div style=\"display:flex;flex-direction:column;gap:6px;margin-top:4px\"><span class=\"xs subtle\">{{t.name}}</span><div class=\"opts\"><sc-for list=\"{{t.secs}}\" as=\"o\" hint-placeholder-count=\"3\"><button class=\"{{o.cls}}\" onClick=\"{{o.pick}}\" aria-pressed=\"{{o.on}}\">{{o.name}}</button></sc-for></div></div></sc-for></div>\n<span class=\"xs subtle\">پیامک دعوت با لینک ورود برای این شماره فرستاده می‌شود.</span>\n</sc-if>\n<sc-if value=\"{{dlg.isMembers}}\" hint-placeholder-val=\"{{ false }}\">\n<div style=\"display:flex;flex-direction:column;gap:4px\"><sc-for list=\"{{mbs.people}}\" as=\"p\" hint-placeholder-count=\"5\"><button class=\"{{p.cls}}\" role=\"checkbox\" aria-checked=\"{{p.on}}\" onClick=\"{{p.toggle}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"av sm\" style=\"background: {{p.bg}}\">{{p.init}}</span><span class=\"grow small\">{{p.name}}</span><span class=\"xs subtle\">{{p.secs}}</span></button></sc-for></div>\n</sc-if>\n<sc-if value=\"{{dlg.isObj}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"call gray small\" style=\"gap:4px\"><b>{{ob.title}}</b><span class=\"muted\">دلیل: {{ob.reason}} · {{ob.date}}</span><span>«{{ob.mgr}}»</span></div>\n<div class=\"fld {{ob.err}}\"><label for=\"ob-t\">چرا فکر می‌کنید این ارجاع درست نیست؟</label><textarea id=\"ob-t\" class=\"inp\" value=\"{{ob.text}}\" onChange=\"{{ob.onText}}\"></textarea></div>\n</sc-if>\n<sc-if value=\"{{dlg.isObjRev}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"call gray small\" style=\"gap:4px\"><b>{{orv.who}} · ارجاع <span class=\"num\">{{orv.code}}</span></b><span class=\"muted\">دلیل ثبت‌شده: {{orv.reason}}</span><span>«{{orv.text}}»</span></div>\n<div class=\"opts\"><sc-for list=\"{{orv.decs}}\" as=\"d\" hint-placeholder-count=\"2\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<div class=\"fld\"><label for=\"orv-n\">پاسخ شما (اختیاری)</label><textarea id=\"orv-n\" class=\"inp\" style=\"min-height:56px\" value=\"{{orv.note}}\" onChange=\"{{orv.onNote}}\"></textarea></div>\n</sc-if>\n<sc-if value=\"{{dlg.isCompare}}\" hint-placeholder-val=\"{{ false }}\">\n<div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px\"><sc-for list=\"{{cmp.items}}\" as=\"v\" hint-placeholder-count=\"2\"><div style=\"display:flex;flex-direction:column;gap:6px\"><div class=\"big-img\"><svg class=\"art {{v.style}}\"><use href=\"#{{v.art}}\"></use><use class=\"u2\" href=\"#{{v.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{v.path}}\"></path></svg></div><div class=\"row sb small\"><b>{{v.label}}</b><span class=\"pill {{v.pill}}\">{{v.status}}</span></div><span class=\"xs subtle\">{{v.when}}</span></div></sc-for></div>\n</sc-if>\n<sc-if value=\"{{dlg.isLight}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"big-img\" style=\"max-width:520px;align-self:center\"><svg class=\"art {{lb.style}}\"><use href=\"#{{lb.art}}\"></use><use class=\"u2\" href=\"#{{lb.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{lb.path}}\"></path></svg></div>\n<sc-if value=\"{{lb.hasNote}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"cmt\">{{lb.note}}</div></sc-if>\n</sc-if>\n</div>\n<sc-if value=\"{{dlg.hasFoot}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"dlg-f\"><button class=\"btn {{dlg.okCls}}\" onClick=\"{{dlg.ok}}\">{{dlg.okLabel}}</button><button class=\"btn btn-s\" onClick=\"{{dlg.close}}\">انصراف</button><span class=\"grow\"></span><sc-if value=\"{{dlg.hasErr}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>{{dlg.err}}</span></sc-if></div></sc-if>\n</div>\n</div>\n</sc-if>\n\n<sc-if value=\"{{cal.open}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"ov\" style=\"z-index:120\" onClick=\"{{cal.bg}}\" onKeyDown=\"{{cal.esc}}\">\n<div class=\"dlg\" style=\"width:min(340px,100%)\" role=\"dialog\" aria-modal=\"true\" aria-label=\"{{cal.title}}\">\n<div class=\"dlg-h\"><h2 class=\"dlg-t\" style=\"font-size:16px\">{{cal.title}}</h2><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cal.close}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"dlg-b\" style=\"gap:8px\">\n<div class=\"row sb\"><button class=\"ib\" aria-label=\"ماه قبل\" onClick=\"{{cal.prev}}\" disabled=\"{{cal.noPrev}}\"><svg class=\"ic\"><use href=\"#i-chev-r\"></use></svg></button><b>{{cal.month}}</b><button class=\"ib\" aria-label=\"ماه بعد\" onClick=\"{{cal.next}}\" disabled=\"{{cal.noNext}}\"><svg class=\"ic\"><use href=\"#i-chev-l\"></use></svg></button></div>\n<div class=\"cal\"><sc-for list=\"{{cal.wds}}\" as=\"w\" hint-placeholder-count=\"7\"><span class=\"cal-h\">{{w.t}}</span></sc-for><sc-for list=\"{{cal.days}}\" as=\"d\" hint-placeholder-count=\"30\"><button class=\"{{d.cls}}\" disabled=\"{{d.dis}}\" aria-label=\"{{d.aria}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<span class=\"xs subtle\">{{cal.hint}}</span>\n</div>\n</div>\n</div>\n</sc-if>\n\n<sc-if value=\"{{toast.on}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"toast\" role=\"status\" aria-live=\"polite\"><svg class=\"ic\"><use href=\"#{{toast.icon}}\"></use></svg><span class=\"grow small\">{{toast.text}}</span><sc-if value=\"{{toast.hasUndo}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{toast.undo}}\">برگرداندن</button></sc-if><sc-if value=\"{{toast.hasAct}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{toast.act}}\">{{toast.actLabel}}</button></sc-if><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{toast.close}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div></sc-if>\n\n<sc-if value=\"{{showDemo}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"demo\"><sc-if value=\"{{demo.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"demo-p\"><div class=\"mh\">ابزار نمایش (فقط در پروتوتایپ)</div><sc-for list=\"{{demo.items}}\" as=\"d\" hint-placeholder-count=\"8\"><button class=\"mi\" onClick=\"{{d.go}}\"><svg class=\"ic\"><use href=\"#{{d.icon}}\"></use></svg><span class=\"grow\">{{d.label}}</span><sc-if value=\"{{d.isOn}}\" hint-placeholder-val=\"{{ false }}\"><svg class=\"ic\" style=\"color:var(--ok)\"><use href=\"#i-check\"></use></svg></sc-if></button></sc-for></div></sc-if><button class=\"demo-b\" onClick=\"{{demo.toggle}}\" aria-expanded=\"{{demo.open}}\"><svg class=\"ic\"><use href=\"#i-tools\"></use></svg>ابزار نمایش</button></div></sc-if>\n</sc-if>\n\n</div>";
window.RASTA_T_MOBILE = "<div class=\"tr {{themeCls}}\" dir=\"rtl\" lang=\"fa\">\n<div class=\"screen\">\n<sc-if value=\"{{notLogged}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"mbody\"><main class=\"login mlogin\">\n<div class=\"login-c\">\n<svg class=\"lg-logo\" role=\"img\" aria-label=\"گالری طلای رستا\"><use href=\"#lg-full\"></use></svg>\n<h1 class=\"h1\">ورود به رستا</h1>\n<div class=\"lg-orn\" aria-hidden=\"true\"><svg><use href=\"#lg-mark\"></use></svg></div>\n<sc-if value=\"{{login.phoneStep}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld {{login.errCls}}\" style=\"width:100%;text-align:right\"><label for=\"lg-p\">شماره‌ی موبایل</label><input id=\"lg-p\" class=\"inp num\" inputmode=\"numeric\" value=\"{{login.phone}}\" onChange=\"{{onLoginPhone}}\" placeholder=\"۰۹۱۲۳۴۵۶۷۸۹\"><sc-if value=\"{{login.hasErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>{{login.err}}</p></sc-if></div>\n<button class=\"btn btn-p btn-lg btn-w\" onClick=\"{{loginSend}}\">دریافت کد</button>\n<div class=\"lg-acc\"><div class=\"lg-acc-h\"><span class=\"flab\">حساب‌های نمایشی</span><span class=\"xs subtle\">برای ورود روی یکی بزنید</span></div>\n<sc-for list=\"{{loginAccounts}}\" as=\"a\" hint-placeholder-count=\"4\"><button class=\"pick lg-a\" onClick=\"{{a.pick}}\"><span class=\"av\" style=\"background: {{a.bg}}\">{{a.init}}</span><span class=\"grow lg-a-t\"><b class=\"small\">{{a.name}}</b><span class=\"xs subtle\">{{a.label}}</span></span><span class=\"xs subtle num\" dir=\"ltr\">{{a.phoneFa}}</span></button></sc-for></div>\n</sc-if>\n<sc-if value=\"{{login.codeStep}}\" hint-placeholder-val=\"{{ false }}\">\n<p class=\"small muted\">کد به <b class=\"num\">{{login.phone}}</b> پیامک شد · <button class=\"btn btn-s\" style=\"height:24px;padding:0 6px\" onClick=\"{{loginBack}}\">ویرایش</button></p>\n<div class=\"fld {{login.errCls}}\" style=\"width:100%;text-align:right\"><label for=\"lg-c\">کد ۵ رقمی</label><input id=\"lg-c\" class=\"inp otp num\" inputmode=\"numeric\" autocomplete=\"one-time-code\" value=\"{{login.code}}\" onChange=\"{{onLoginCode}}\"><sc-if value=\"{{login.hasErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>{{login.err}}</p></sc-if><p class=\"xs subtle\">کد نمایشی: ۱۲۳۴۵</p></div>\n<button class=\"btn btn-p btn-lg btn-w\" onClick=\"{{loginVerify}}\">ورود</button>\n<sc-if value=\"{{login.waiting}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle num\">ارسال دوباره تا {{login.timerTxt}}</span></sc-if>\n<sc-if value=\"{{login.canResend}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-s\" onClick=\"{{loginResend}}\"><svg class=\"ic\"><use href=\"#i-refresh\"></use></svg>ارسال دوباره‌ی کد</button></sc-if>\n</sc-if>\n<div class=\"lg-foot\"><a class=\"lg-guide\" href=\"guide.html\"><svg class=\"ic\"><use href=\"#i-desc\"></use></svg>راهنمای استفاده از رستا</a><span class=\"xs subtle\">طراحی و توسعه: سکان</span><button class=\"lg-reset\" onClick=\"{{resetData}}\">بازنشانی داده‌های نمایشی</button></div>\n</div>\n</main></div>\n</sc-if>\n\n\n\n\n\n<sc-if value=\"{{loggedIn}}\" hint-placeholder-val=\"{{ true }}\">\n<sc-if value=\"{{offline}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"banner\" role=\"status\" style=\"padding:6px 12px;font-size:12px\"><svg class=\"ic xs\"><use href=\"#i-wifi-off\"></use></svg>آفلاین؛ تغییرات پس از اتصال ارسال می‌شوند.</div></sc-if>\n\n<sc-if value=\"{{inCard}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"abar\"><button class=\"ib\" aria-label=\"بازگشت\" onClick=\"{{cb.close}}\"><svg class=\"ic md\"><use href=\"#i-arrow-r\"></use></svg></button><span class=\"lchip\" style=\"height:26px\"><i class=\"{{cb.listLbl}}\"></i>{{cb.listName}}</span><span class=\"grow\"></span><span class=\"xs subtle num\">{{cb.code}}</span><sc-if value=\"{{cb.isMgr}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib\" aria-label=\"کارهای بیشتر روی کارت\" onClick=\"{{cb.popMenu}}\"><svg class=\"ic md\"><use href=\"#i-more\"></use></svg></button></sc-if></div>\n<div class=\"mbody\">\n<sc-if value=\"{{cb.hasCover}}\" hint-placeholder-val=\"{{ true }}\"><div style=\"height:150px;flex:none;background:#F6F1E9\"><svg class=\"art {{cb.coverStyle}}\" aria-hidden=\"true\"><use href=\"#{{cb.art}}\"></use><use class=\"u2\" href=\"#{{cb.art}}\"></use></svg></div></sc-if>\n<div class=\"mpad\" style=\"gap:20px\">\n<div style=\"display:flex;flex-direction:column;gap:10px\">\n<sc-if value=\"{{cb.tView}}\" hint-placeholder-val=\"{{ true }}\"><h2 class=\"mtitle\"><button class=\"lt-btn\" onClick=\"{{cb.editTitle}}\" disabled=\"{{cb.isArch}}\">{{cb.title}}</button></h2></sc-if>\n<sc-if value=\"{{cb.tEdit}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"composer\"><textarea class=\"inp\" aria-label=\"عنوان کارت\" style=\"font-size:17px;font-weight:600;min-height:52px\" value=\"{{cb.tText}}\" onChange=\"{{cb.onTText}}\" onKeyDown=\"{{cb.tKey}}\" autoFocus=\"{{ true }}\"></textarea><button class=\"btn btn-p\" style=\"align-self:flex-start\" onClick=\"{{cb.saveTitle}}\">ذخیره‌ی عنوان</button></div></sc-if>\n<div class=\"mmeta\">\n<sc-if value=\"{{cb.showWho}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mmeta-r\"><span class=\"meta-k\">اعضا</span><div class=\"row wrap\" style=\"gap:6px\">\n<sc-if value=\"{{cb.hasWho}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"avs\"><sc-for list=\"{{cb.whos}}\" as=\"w\" hint-placeholder-count=\"1\"><span class=\"av sm\" style=\"background: {{w.bg}}\" title=\"{{w.name}}\">{{w.init}}</span></sc-for></div><span class=\"small\">{{cb.who}}</span></sc-if>\n<sc-if value=\"{{cb.isPool}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill P-ps\"><svg class=\"ic xs\"><use href=\"#i-team\"></use></svg>{{cb.poolTxt}}</span></sc-if>\n<sc-if value=\"{{cb.noWho}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle\">هنوز سپرده نشده</span></sc-if>\n<sc-if value=\"{{cb.canAddWho}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib round\" aria-label=\"سپردن و اعضا\" onClick=\"{{cb.addWho}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg></button></sc-if>\n</div></div></sc-if>\n<sc-if value=\"{{cb.hasDue}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mmeta-r\"><span class=\"meta-k\">تحویل</span><span class=\"row small wrap\" style=\"gap:6px\">{{cb.dueFull}}<sc-if value=\"{{cb.hasDueTag}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg {{cb.dueCls}}\" style=\"height:20px\">{{cb.dueTag}}</span></sc-if></span></div></sc-if>\n<sc-if value=\"{{cb.hasLbls}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mmeta-r\"><span class=\"meta-k\">برچسب</span><div class=\"lbls\"><sc-for list=\"{{cb.lbls}}\" as=\"g\" hint-placeholder-count=\"1\"><span class=\"lbl {{g.cls}}\" style=\"height:24px;padding:0 8px\">{{g.t}}</span></sc-for></div></div></sc-if>\n<sc-if value=\"{{cb.hasSpec}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mmeta-r\"><span class=\"meta-k\">مشخصات</span><span class=\"small\">{{cb.spec}}</span></div></sc-if>\n<sc-if value=\"{{cb.hasTl}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mmeta-r\"><span class=\"meta-k\">تیم</span><button class=\"tlink small\" onClick=\"{{cb.goTeam}}\">{{cb.tlTeam}} · {{cb.tlName}}</button></div></sc-if>\n<sc-if value=\"{{cb.hasLink}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mmeta-r\"><span class=\"meta-k\">مرتبط</span><button class=\"lnk\" onClick=\"{{cb.openLink}}\"><svg class=\"ic xs\"><use href=\"#i-link\"></use></svg>{{cb.linkTxt}}</button></div></sc-if>\n</div>\n<sc-if value=\"{{cb.isMgr}}\" hint-placeholder-val=\"{{ true }}\"><sc-if value=\"{{cb.notArch}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mqa\" role=\"toolbar\" aria-label=\"کارهای سریع روی کارت\">\n<button class=\"mqa-b\" onClick=\"{{cb.assign}}\" disabled=\"{{cb.noAssign}}\"><svg class=\"ic md\"><use href=\"#i-user-plus\"></use></svg>سپردن</button>\n<button class=\"mqa-b\" onClick=\"{{cb.popDates}}\" disabled=\"{{cb.noDates}}\"><svg class=\"ic md\"><use href=\"#i-clock\"></use></svg>تحویل</button>\n<button class=\"mqa-b\" onClick=\"{{cb.addAtt}}\"><svg class=\"ic md\"><use href=\"#i-clip\"></use></svg>پیوست</button>\n<button class=\"mqa-b\" onClick=\"{{cb.popMove}}\"><svg class=\"ic md\"><use href=\"#i-move\"></use></svg>انتقال</button>\n<button class=\"mqa-b\" onClick=\"{{cb.popMenu}}\"><svg class=\"ic md\"><use href=\"#i-more\"></use></svg>بیشتر</button>\n</div></sc-if></sc-if>\n</div>\n<sc-if value=\"{{cb.hasCall}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"call {{cb.callCls}}\"><div class=\"row\" style=\"gap:10px;align-items:flex-start\"><svg class=\"ic md\" style=\"margin-top:2px;flex:none\"><use href=\"#{{cb.callIcon}}\"></use></svg><div class=\"grow\" style=\"line-height:1.7\"><b>{{cb.callTitle}}</b><sc-if value=\"{{cb.hasCallText}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"small muted\">{{cb.callText}}</div></sc-if></div></div><sc-if value=\"{{cb.hasCallBtns}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mbtns\"><sc-for list=\"{{cb.callBtns}}\" as=\"b\" hint-placeholder-count=\"2\"><button class=\"btn btn-lg {{b.cls}}\" onClick=\"{{b.go}}\"><svg class=\"ic\"><use href=\"#{{b.icon}}\"></use></svg>{{b.label}}</button></sc-for></div></sc-if></div></sc-if>\n<sc-if value=\"{{cb.hasFb}}\" hint-placeholder-val=\"{{ false }}\"><section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\" style=\"color:var(--dangerT)\"><use href=\"#i-return\"></use></svg>بازخورد مدیر<span class=\"pill P-rs\">{{cb.fb.reason}}</span></div>\n<sc-if value=\"{{cb.fb.hasVoice}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"vp\" style=\"max-width:none\"><button class=\"vp-b\" aria-label=\"{{cb.fb.v.label}}\" onClick=\"{{cb.fb.v.toggle}}\"><svg class=\"ic fill\"><use href=\"#{{cb.fb.v.icon}}\"></use></svg></button><span class=\"wave\"><sc-for list=\"{{cb.fb.v.bars}}\" as=\"w\" hint-placeholder-count=\"20\"><i class=\"{{w.c}}\" style=\"height: {{w.h}}px\"></i></sc-for></span><span class=\"xs num muted\">{{cb.fb.v.t}}</span></div></sc-if>\n<sc-if value=\"{{cb.fb.hasText}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"cmt\">{{cb.fb.text}}</div></sc-if>\n<sc-if value=\"{{cb.fb.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{cb.fb.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if>\n<sc-if value=\"{{cb.fb.hasAnno}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ver\" style=\"width:200px\" onClick=\"{{cb.fb.openAnno}}\"><span class=\"big-img\" style=\"border-radius:0\"><svg class=\"art {{cb.fb.style}}\"><use href=\"#{{cb.art}}\"></use><use class=\"u2\" href=\"#{{cb.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{cb.fb.path}}\"></path></svg></span><span class=\"ver-b\">علامت‌ها روی نسخه‌ی {{cb.fb.n}}</span></button></sc-if>\n<span class=\"xs subtle\">{{cb.fb.when}}</span></section></sc-if>\n<sc-if value=\"{{cb.canUpload}}\" hint-placeholder-val=\"{{ false }}\"><section class=\"msec {{cb.upCls}}\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-upload\"></use></svg>{{cb.upTitle}}</div>\n<div class=\"row\" style=\"gap:8px\"><button class=\"btn btn-lg grow\" style=\"height:72px;flex-direction:column;gap:4px\" onClick=\"{{cb.addUp}}\"><svg class=\"ic lg\"><use href=\"#i-camera\"></use></svg>گرفتن عکس</button><button class=\"btn btn-lg grow\" style=\"height:72px;flex-direction:column;gap:4px\" onClick=\"{{cb.addUp}}\"><svg class=\"ic lg\"><use href=\"#i-image\"></use></svg>گالری یا فایل</button></div>\n<sc-if value=\"{{cb.hasUps}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row wrap\" style=\"gap:8px\"><sc-for list=\"{{cb.ups}}\" as=\"u\" hint-placeholder-count=\"2\"><span class=\"mini\" style=\"width:76px;height:76px;position:relative\"><svg class=\"art {{u.style}}\"><use href=\"#{{u.art}}\"></use><use class=\"u2\" href=\"#{{u.art}}\"></use></svg><button class=\"ib\" style=\"position:absolute;top:2px;left:2px;width:28px;height:28px;background:var(--card)\" aria-label=\"حذف عکس\" onClick=\"{{u.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></span></sc-for></div></sc-if>\n<input class=\"inp\" placeholder=\"توضیح کوتاه برای مدیر (اختیاری)\" aria-label=\"توضیح نسخه\" value=\"{{cb.upNote}}\" onChange=\"{{cb.onUpNote}}\">\n<sc-if value=\"{{cb.upErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>حداقل یک عکس یا فایل اضافه کنید.</p></sc-if>\n<button class=\"btn btn-p btn-lg btn-w\" onClick=\"{{cb.submit}}\"><svg class=\"ic\"><use href=\"#i-send\"></use></svg>{{cb.submitLabel}}</button></section></sc-if>\n<sc-if value=\"{{cb.hasDailyView}}\" hint-placeholder-val=\"{{ false }}\"><section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-report\"></use></svg>گزارش امروز</div>\n<sc-for list=\"{{cb.reps}}\" as=\"r\" hint-placeholder-count=\"1\"><div class=\"row\" style=\"align-items:flex-start;gap:10px\"><span class=\"av sm\" style=\"background: {{r.bg}}\" title=\"{{r.name}}\">{{r.init}}</span><div class=\"grow\" style=\"line-height:1.7\"><div class=\"row\" style=\"gap:6px\"><b class=\"small\">{{r.name}}</b><span class=\"pill {{r.pill}}\" style=\"height:20px\">{{r.st}}</span></div><div class=\"xs muted\">{{r.line}}</div><sc-if value=\"{{r.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{r.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if></div></div></sc-for></section></sc-if>\n<section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-desc\"></use></svg>توضیحات</div><p style=\"white-space:pre-line;line-height:1.8\">{{cb.desc}}</p>\n<sc-if value=\"{{cb.hasCust}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row wrap small muted\" style=\"gap:12px;background:var(--btn);border-radius:6px;padding:8px 12px\"><span class=\"row\" style=\"gap:6px\"><svg class=\"ic\"><use href=\"#i-user\"></use></svg>{{cb.custName}}</span><span class=\"row num\" style=\"gap:6px\"><svg class=\"ic\"><use href=\"#i-phone\"></use></svg><span dir=\"ltr\">{{cb.custPhone}}</span></span><span class=\"row\" style=\"gap:6px\"><svg class=\"ic\"><use href=\"#{{cb.chIcon}}\"></use></svg>{{cb.chName}}</span></div></sc-if>\n<sc-if value=\"{{cb.hidCust}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"lock\"><svg class=\"ic xs\"><use href=\"#i-lock\"></use></svg>اطلاعات مشتری فقط برای مدیر نمایش داده می‌شود</span></sc-if></section>\n<sc-if value=\"{{cb.hasAtt}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-clip\"></use></svg>پیوست‌ها و عکس‌های نمونه</div>\n<sc-if value=\"{{cb.noAtt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"small subtle\">هنوز پیوستی نیست.</span></sc-if>\n<div class=\"fchips big\"><sc-for list=\"{{cb.atts}}\" as=\"f\" hint-placeholder-count=\"2\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div>\n<sc-if value=\"{{cb.canAtt}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"row\" style=\"gap:8px\"><button class=\"btn grow\" onClick=\"{{cb.addRef}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس نمونه</button><button class=\"btn grow\" onClick=\"{{cb.addAtt}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>فایل</button></div></sc-if></section></sc-if>\n<sc-if value=\"{{cb.hasVers}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-layers\"></use></svg>نسخه‌ها<span class=\"grow\"></span><sc-if value=\"{{cb.canCompare}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-s\" onClick=\"{{cb.compare}}\"><svg class=\"ic\"><use href=\"#i-compare\"></use></svg>مقایسه</button></sc-if></div><div class=\"hscroll\"><sc-for list=\"{{cb.vers}}\" as=\"v\" hint-placeholder-count=\"2\"><button class=\"ver\" style=\"width:132px;flex:none\" onClick=\"{{v.open}}\" aria-label=\"{{v.aria}}\"><span class=\"ver-img\" style=\"display:block\"><svg class=\"art {{v.style}}\"><use href=\"#{{v.art}}\"></use><use class=\"u2\" href=\"#{{v.art}}\"></use></svg></span><span class=\"ver-b\"><b>{{v.label}}</b><span class=\"pill {{v.pill}}\" style=\"height:20px;align-self:flex-start\">{{v.status}}</span></span></button></sc-for></div></section></sc-if>\n<sc-if value=\"{{cb.showChk}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-check-sq\"></use></svg>چک‌لیست<sc-if value=\"{{cb.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"xs num muted\" style=\"font-weight:400\">{{cb.chkPct}}</span></sc-if></div>\n<sc-if value=\"{{cb.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"{{cb.progCls}}\" style=\"flex:none\"><i style=\"width: {{cb.chkPctN}}%\"></i></div></sc-if>\n<sc-for list=\"{{cb.chk}}\" as=\"k\" hint-placeholder-count=\"3\"><button class=\"{{k.cls}}\" style=\"min-height:44px\" role=\"checkbox\" aria-checked=\"{{k.on}}\" onClick=\"{{k.toggle}}\" disabled=\"{{k.dis}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"t\">{{k.t}}</span></button></sc-for>\n<sc-if value=\"{{cb.chkAdding}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row\"><input class=\"inp\" aria-label=\"مورد تازه\" placeholder=\"مورد تازه\" value=\"{{cb.chkText}}\" onChange=\"{{cb.onChkText}}\" onKeyDown=\"{{cb.chkKey}}\" autoFocus=\"{{ true }}\"><button class=\"btn btn-p\" onClick=\"{{cb.chkAdd}}\">افزودن</button><button class=\"ib\" aria-label=\"لغو\" onClick=\"{{cb.chkCancel}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg></button></div></sc-if>\n<sc-if value=\"{{cb.chkCanAdd}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"btn btn-s\" style=\"align-self:flex-start\" onClick=\"{{cb.chkOpen}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>افزودن مورد</button></sc-if></section></sc-if>\n<section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-act\"></use></svg>فعالیت و گزارش روزانه<span class=\"grow\"></span><button class=\"btn btn-s\" onClick=\"{{cb.toggleDetails}}\">{{cb.detailsLabel}}</button></div>\n<div class=\"mcomp composer\">\n<sc-if value=\"{{cb.isAssignee}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"row wrap\" style=\"gap:6px\"><span class=\"pill {{cb.myStPill}}\">{{cb.myStTxt}}</span></div><div class=\"dr\"><sc-for list=\"{{cb.cChips}}\" as=\"h\" hint-placeholder-count=\"3\"><button class=\"{{h.cls}}\" onClick=\"{{h.pick}}\" aria-pressed=\"{{h.on}}\"><i class=\"{{h.dot}}\"></i>{{h.label}}</button></sc-for></div></sc-if>\n<textarea class=\"inp\" style=\"min-height:56px\" placeholder=\"{{cb.cmtPh}}\" aria-label=\"نوشتن نظر یا گزارش\" value=\"{{cb.cmtText}}\" onChange=\"{{cb.onCmt}}\"></textarea>\n<sc-if value=\"{{cb.hasCFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{cb.cfiles}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<div class=\"row\"><button class=\"btn btn-s\" onClick=\"{{cb.addCFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>فایل یا عکس</button><span class=\"grow\"></span><sc-if value=\"{{cb.cmtTyping}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-p\" onClick=\"{{cb.saveCmt}}\"><svg class=\"ic\"><use href=\"#i-send\"></use></svg>{{cb.sendLabel}}</button></sc-if></div>\n</div>\n<sc-for list=\"{{cb.acts}}\" as=\"a\" hint-placeholder-count=\"3\"><div class=\"act\"><span class=\"av sm\" style=\"background: {{a.bg}}\">{{a.init}}</span><div class=\"act-b\"><div class=\"small row wrap\" style=\"line-height:1.7;gap:6px\"><b>{{a.who}}</b><span>{{a.text}}</span><sc-if value=\"{{a.hasSt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill {{a.stPill}}\" style=\"height:20px\">{{a.stTxt}}</span></sc-if></div><sc-if value=\"{{a.isCmt}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"cmt\">{{a.body}}</div></sc-if><sc-if value=\"{{a.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{a.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if><sc-if value=\"{{a.hasVoice}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"vp\" style=\"max-width:none\"><button class=\"vp-b\" aria-label=\"{{a.v.label}}\" onClick=\"{{a.v.toggle}}\"><svg class=\"ic fill\"><use href=\"#{{a.v.icon}}\"></use></svg></button><span class=\"wave\"><sc-for list=\"{{a.v.bars}}\" as=\"w\" hint-placeholder-count=\"20\"><i class=\"{{w.c}}\" style=\"height: {{w.h}}px\"></i></sc-for></span><span class=\"xs num muted\">{{a.v.t}}</span></div></sc-if><span class=\"xs subtle\">{{a.when}}</span></div></div></sc-for>\n</section>\n</div>\n</div>\n</sc-if>\n\n<sc-if value=\"{{notCard}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"abar\"><sc-if value=\"{{abBack}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" aria-label=\"بازگشت به تابلوها\" onClick=\"{{goBoards}}\"><svg class=\"ic md\"><use href=\"#i-arrow-r\"></use></svg></button></sc-if><sc-if value=\"{{abLogo}}\" hint-placeholder-val=\"{{ true }}\"><img src=\"assets/img/rasta-logo-tile.svg\" alt=\"رستا\" style=\"height:30px;border-radius:7px\"></sc-if><span class=\"t\">{{mTitle}}</span><sc-if value=\"{{bell.show}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib bell\" aria-label=\"اعلان‌ها\" onClick=\"{{bell.go}}\"><svg class=\"ic md\"><use href=\"#i-bell\"></use></svg><sc-if value=\"{{bell.hasN}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"nbadge num\">{{bell.n}}</span></sc-if></button></sc-if><button class=\"ib acct-b\" aria-label=\"حساب کاربری\" onClick=\"{{acct.toggle}}\"><span class=\"av\" style=\"background: {{user.bg}}\">{{user.init}}</span></button></div>\n<div class=\"mbody\">\n\n<sc-if value=\"{{pgBoardLike}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"mboard\" style=\"background: {{mbg}}\">\n<sc-if value=\"{{hasChips}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"chiprow\"><sc-for list=\"{{boardChips}}\" as=\"b\" hint-placeholder-count=\"2\"><button class=\"{{b.cls}}\" onClick=\"{{b.pick}}\"><svg class=\"ic\"><use href=\"#i-layers\"></use></svg>{{b.name}}</button></sc-for><sc-if value=\"{{chipSep}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"chipsep\" aria-hidden=\"true\"></span></sc-if><sc-for list=\"{{teamChips}}\" as=\"b\" hint-placeholder-count=\"3\"><button class=\"{{b.cls}}\" onClick=\"{{b.pick}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg>{{b.name}}</button></sc-for></div></sc-if>\n<sc-if value=\"{{pg.team}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"mbhead\"><b>{{tb.name}}</b><span class=\"xs\" style=\"opacity:.85\">{{tb.unit}}</span><span class=\"grow\"></span><sc-if value=\"{{tb.hasPool}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill\" style=\"background:rgba(255,255,255,.22);color:#fff\"><svg class=\"ic xs\"><use href=\"#i-team\"></use></svg>{{tb.nPool}} بدون صاحب</span></sc-if></div>\n<sc-if value=\"{{tb.showMine}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"chiprow\" style=\"padding-top:0\"><button class=\"{{tb.allCls}}\" onClick=\"{{tb.setAll}}\">همه‌ی تیم</button><button class=\"{{tb.mineCls}}\" onClick=\"{{tb.setMine}}\">فقط کارهای من</button></div></sc-if>\n<sc-if value=\"{{tb.rp.show}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"repbar mrep\">\n<button class=\"repbar-h\" onClick=\"{{tb.rp.toggle}}\" aria-expanded=\"{{tb.rp.open}}\"><svg class=\"ic md\"><use href=\"#i-report\"></use></svg><b>{{tb.rp.title}}</b><span class=\"pill {{tb.rp.pill}}\">{{tb.rp.left}}</span><span class=\"grow\"></span><sc-if value=\"{{tb.rp.closed}}\" hint-placeholder-val=\"{{ true }}\"><svg class=\"ic\"><use href=\"#i-chev-d\"></use></svg></sc-if><sc-if value=\"{{tb.rp.open}}\" hint-placeholder-val=\"{{ false }}\"><svg class=\"ic\"><use href=\"#i-chev-u\"></use></svg></sc-if></button>\n<sc-if value=\"{{tb.rp.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"repbar-b\">\n<p class=\"xs muted\" style=\"line-height:1.8\">{{tb.rp.hint}}</p>\n<sc-for list=\"{{tb.rp.rows}}\" as=\"r\" hint-placeholder-count=\"2\"><div class=\"reprow\">\n<div class=\"row rp-t\" style=\"align-items:flex-start;gap:10px\"><span class=\"mini\"><svg class=\"art art-photo\"><use href=\"#{{r.art}}\"></use></svg></span><div class=\"grow\" style=\"line-height:1.6;min-width:0\"><button class=\"tlink\" onClick=\"{{r.open}}\">{{r.title}}</button><div class=\"auto\"><svg class=\"ic xs\" style=\"margin-top:5px\"><use href=\"#i-refresh\"></use></svg><span>{{r.auto}}</span></div><sc-if value=\"{{r.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{r.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button></span></sc-for></div></sc-if></div></div>\n<div class=\"dr\" style=\"width:100%\"><sc-for list=\"{{r.chips}}\" as=\"h\" hint-placeholder-count=\"3\"><button class=\"{{h.cls}}\" onClick=\"{{h.pick}}\" aria-pressed=\"{{h.on}}\"><i class=\"{{h.dot}}\"></i>{{h.label}}</button></sc-for><button class=\"btn btn-s\" onClick=\"{{r.toggleNote}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>{{r.noteLabel}}</button></div>\n<sc-if value=\"{{r.noteOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"composer\"><textarea class=\"inp\" style=\"min-height:52px\" placeholder=\"یک جمله دربارهٔ امروز، اختیاری\" aria-label=\"توضیح گزارش امروز\" value=\"{{r.note}}\" onChange=\"{{r.onNote}}\"></textarea><sc-if value=\"{{r.hasNFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{r.nFiles}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if><div class=\"row\"><button class=\"btn\" onClick=\"{{r.addFile}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس یا فایل</button><span class=\"grow\"></span><button class=\"btn btn-p\" onClick=\"{{r.save}}\">ثبت</button></div></div></sc-if>\n</div></sc-for>\n</div></sc-if>\n</div></sc-if>\n</sc-if>\n<div class=\"ltabs\" role=\"tablist\" aria-label=\"لیست‌ها\"><sc-for list=\"{{mb.tabs}}\" as=\"t\" hint-placeholder-count=\"4\"><button class=\"{{t.cls}}\" role=\"tab\" aria-selected=\"{{t.on}}\" onClick=\"{{t.pick}}\">{{t.name}}<span class=\"num\">{{t.n}}</span></button></sc-for><sc-if value=\"{{mb.canAddList}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"{{mb.addTabCls}}\" onClick=\"{{mb.addTab}}\" aria-label=\"افزودن لیست\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>لیست</button></sc-if></div>\n<sc-if value=\"{{mb.addOpen}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"addlist-f mlistf\">\n<b class=\"small\">لیست تازه</b>\n<input class=\"inp\" aria-label=\"نام لیست\" placeholder=\"نام لیست…\" value=\"{{mb.al.text}}\" onChange=\"{{mb.al.onText}}\" onKeyDown=\"{{mb.al.key}}\" autoFocus=\"{{ true }}\">\n<sc-if value=\"{{mb.al.isPipe}}\" hint-placeholder-val=\"{{ false }}\"><label class=\"flab\" for=\"mal-s\">کار کدام تیم است؟</label><select id=\"mal-s\" class=\"inp\" value=\"{{mb.al.sec}}\" onChange=\"{{mb.al.onSec}}\"><sc-for list=\"{{mb.al.secOpts}}\" as=\"o\" hint-placeholder-count=\"3\"><option value=\"{{o.id}}\">{{o.name}}</option></sc-for></select></sc-if>\n<div class=\"row\"><button class=\"btn btn-p grow\" onClick=\"{{mb.al.save}}\">افزودن لیست</button><button class=\"btn\" onClick=\"{{mb.al.cancel}}\">لغو</button></div>\n</div></sc-if>\n<sc-if value=\"{{mb.showList}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"list mlist\" aria-label=\"لیست {{mb.cur.name}}\">\n<header class=\"list-h\">\n<sc-if value=\"{{mb.cur.notEditing}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"list-t lt-btn\" onClick=\"{{mb.cur.rename}}\" title=\"برای تغییر نام بزنید\">{{mb.cur.name}}</button></sc-if>\n<sc-if value=\"{{mb.cur.editing}}\" hint-placeholder-val=\"{{ false }}\"><input class=\"inp list-in\" aria-label=\"نام لیست\" value=\"{{mb.cur.editText}}\" onChange=\"{{mb.cur.onEdit}}\" onKeyDown=\"{{mb.cur.editKey}}\" autoFocus=\"{{ true }}\"><button class=\"btn btn-p\" onClick=\"{{mb.cur.saveEdit}}\">ذخیره</button></sc-if>\n<span class=\"nav-n num\">{{mb.cur.n}}</span>\n<button class=\"ib\" aria-label=\"منوی لیست {{mb.cur.name}}\" onClick=\"{{mb.cur.menu}}\" aria-expanded=\"{{mb.cur.menuOpen}}\"><svg class=\"ic\"><use href=\"#i-more\"></use></svg></button>\n</header>\n<sc-if value=\"{{mb.team.show}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mteam\" onClick=\"{{mb.team.go}}\" aria-label=\"باز کردن تابلوی تیم {{mb.team.name}}\"><span class=\"mteam-h\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg><b class=\"grow\">تابلوی تیم {{mb.team.name}}</b><span class=\"xs\">همه‌ی ستون‌ها</span><svg class=\"ic\"><use href=\"#i-chev-l\"></use></svg></span><span class=\"mteam-cols\"><sc-for list=\"{{mb.team.cols}}\" as=\"t\" hint-placeholder-count=\"3\"><span class=\"mteam-c\"><i class=\"{{t.lbl}}\"></i>{{t.name}}<b class=\"num\">{{t.n}}</b></span></sc-for></span></button></sc-if>\n<sc-if value=\"{{mb.cur.hasSub}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"list-sec\"><svg class=\"ic xs\"><use href=\"#{{mb.cur.subIcon}}\"></use></svg>{{mb.cur.sub}}</div></sc-if>\n<div class=\"list-c\">\n<sc-for list=\"{{mb.cur.cards}}\" as=\"c\" hint-placeholder-count=\"3\">\n<article class=\"{{c.cls}}\">\n<button class=\"hit\" onClick=\"{{c.open}}\" aria-label=\"{{c.aria}}\"></button>\n<sc-if value=\"{{c.hasCover}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"cover\" style=\"height:120px\"><svg class=\"art {{c.coverStyle}}\" aria-hidden=\"true\"><use href=\"#{{c.art}}\"></use><use class=\"u2\" href=\"#{{c.art}}\"></use></svg></div></sc-if>\n<div class=\"cb\">\n<sc-if value=\"{{c.hasLbls}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"lbls\"><sc-for list=\"{{c.lbls}}\" as=\"g\" hint-placeholder-count=\"1\"><span class=\"lbl {{g.cls}}\">{{g.t}}</span></sc-for></div></sc-if>\n<div class=\"ctitle\">{{c.title}}</div>\n<sc-if value=\"{{c.hasBdgs}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"bdgs\">\n<sc-if value=\"{{c.hasDue}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.dueCls}}\"><svg class=\"ic xs\"><use href=\"#{{c.dueIcon}}\"></use></svg>{{c.dueTxt}}</span></sc-if>\n<sc-if value=\"{{c.hasChk}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"bdg {{c.chkCls}}\"><svg class=\"ic xs\"><use href=\"#i-check-sq\"></use></svg><span class=\"num\">{{c.chkTxt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasCmt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\"><svg class=\"ic xs\"><use href=\"#i-msg\"></use></svg><span class=\"num\">{{c.nCmt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasAtt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\"><svg class=\"ic xs\"><use href=\"#i-clip\"></use></svg><span class=\"num\">{{c.nAtt}}</span></span></sc-if>\n<sc-if value=\"{{c.hasRep}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"bdg\" title=\"{{c.repTitle}}\"><span class=\"{{c.repDot}}\" style=\"width:8px;height:8px;border-radius:50%;display:block\"></span></span></sc-if>\n<sc-if value=\"{{c.hasTeamBdg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"{{c.teamCls}}\"><svg class=\"ic xs\"><use href=\"#i-board\"></use></svg>{{c.teamBdg}}</span></sc-if>\n<span class=\"cmem\"><sc-if value=\"{{c.hasWho}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"avs\"><sc-for list=\"{{c.avs}}\" as=\"a\" hint-placeholder-count=\"1\"><span class=\"av sm\" style=\"background: {{a.bg}}\" title=\"{{a.name}}\">{{a.init}}</span></sc-for></span></sc-if></span>\n</div></sc-if>\n</div>\n<sc-if value=\"{{c.canQe}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"{{c.qeCls}}\" aria-label=\"کارهای سریع {{c.title}}\" aria-expanded=\"{{c.qOpen}}\" onClick=\"{{c.qToggle}}\"><svg class=\"ic\"><use href=\"#i-more\"></use></svg></button></sc-if>\n</article>\n</sc-for>\n<sc-if value=\"{{mb.cur.quickOpen}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"quick\"><textarea aria-label=\"عنوان کارت\" placeholder=\"عنوان کارت را بنویسید…\" value=\"{{quickText}}\" onChange=\"{{onQuick}}\" onKeyDown=\"{{quickKey}}\" autoFocus=\"{{ true }}\"></textarea>\n<sc-if value=\"{{mb.cur.qHasRefs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{mb.cur.qRefs}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<div class=\"row\" style=\"gap:6px\"><button class=\"btn btn-s\" onClick=\"{{quickRef}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس نمونه</button><button class=\"btn btn-s\" onClick=\"{{quickRef}}\"><svg class=\"ic\"><use href=\"#i-image\"></use></svg>از گالری</button></div>\n</div>\n<sc-if value=\"{{mb.cur.quickHint}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"xs muted\" style=\"padding:0 4px;line-height:1.7\">{{mb.cur.quickHint}}</p></sc-if>\n<div class=\"row\"><button class=\"btn btn-p grow\" onClick=\"{{quickAdd}}\">ثبت کارت</button><button class=\"btn\" onClick=\"{{quickClose}}\">لغو</button></div>\n</sc-if>\n<sc-if value=\"{{mb.cur.empty}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"xs subtle\" style=\"text-align:center;padding:12px 4px\">{{mb.cur.emptyTxt}}</p></sc-if>\n</div>\n<sc-if value=\"{{mb.cur.canAdd}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"list-f\"><button class=\"btn addc\" onClick=\"{{mb.cur.add}}\"><svg class=\"ic\"><use href=\"#i-plus\"></use></svg>{{mb.cur.addLabel}}</button></div></sc-if>\n</section>\n<p class=\"mswipe\">برای جابه‌جا کردن کارت بین لیست‌ها، روی <svg class=\"ic xs\"><use href=\"#i-more\"></use></svg> کارت بزنید.</p>\n</sc-if>\n</div></sc-if>\n\n<sc-if value=\"{{pg.score}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mpad\">\n<sc-if value=\"{{trial}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"banner\" style=\"border-radius:6px\">دوره‌ی آزمایشی: پاداشی محاسبه نمی‌شود.</div></sc-if>\n<sc-if value=\"{{ms.insufficient}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"box empty\"><svg class=\"ic xl\" style=\"color:var(--text3)\"><use href=\"#i-hourglass\"></use></svg><b>داده‌ی کافی نیست</b><span class=\"small\">حداقل ۵ کار در فصل لازم است؛ تا امروز <span class=\"num\">{{ms.tasks}}</span> کار.</span></div></sc-if>\n<sc-if value=\"{{ms.enough}}\" hint-placeholder-val=\"{{ true }}\">\n<section class=\"box pad\" style=\"display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center\"><span class=\"kt l {{ms.ktCls}}\">{{ms.kt}}<small>عیار</small></span><b class=\"num\" style=\"font-size:30px;font-weight:600;line-height:1.1\">{{ms.score}}</b><div class=\"prog\" style=\"width:100%;flex:none\"><i style=\"width: {{ms.scoreN}}%\"></i></div><span class=\"small\" style=\"color:var(--blue)\">{{ms.toNext}}</span></section>\n<sc-for list=\"{{ms.metrics}}\" as=\"m\" hint-placeholder-count=\"4\"><div class=\"box\" style=\"padding:12px;display:flex;flex-direction:column;gap:6px\"><div class=\"row sb\"><span class=\"small b\">{{m.name}}</span><b class=\"num\">{{m.val}}</b></div><div class=\"prog\" style=\"flex:none\"><i style=\"width: {{m.pct}}%\"></i></div><span class=\"xs subtle\">{{m.plain}}</span></div></sc-for>\n<b class=\"small\">ارجاع‌های من</b>\n<sc-for list=\"{{ms.returns}}\" as=\"r\" hint-placeholder-count=\"2\"><div class=\"box\" style=\"padding:12px;display:flex;flex-direction:column;gap:6px\"><div class=\"row sb\"><span class=\"small\">{{r.title}}</span><span class=\"xs subtle\">{{r.date}}</span></div><div class=\"row wrap\" style=\"gap:6px\"><span class=\"pill {{r.rPill}}\">{{r.reason}}</span><sc-if value=\"{{r.hasStatus}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill {{r.sPill}}\">{{r.status}}</span></sc-if><span class=\"grow\"></span><sc-if value=\"{{r.canObj}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{r.obj}}\"><svg class=\"ic\"><use href=\"#i-flag\"></use></svg>اعتراض</button></sc-if></div></div></sc-for>\n</sc-if>\n</div></sc-if>\n\n<sc-if value=\"{{pg.home}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mpad mhub\">\n<div class=\"mhero\"><span class=\"hub-k\">گالری طلای رستا</span><b>{{mgrGreet}}</b><div class=\"xs subtle\">{{todayFull}}</div></div>\n<div class=\"mspokes\"><sc-for list=\"{{hub.mobile}}\" as=\"t\" hint-placeholder-count=\"4\"><button class=\"mspoke\" onClick=\"{{t.go}}\"><span class=\"mspoke-top\"><span class=\"spoke-i\" style=\"background: {{t.bg}}\"><svg class=\"ic\"><use href=\"#{{t.icon}}\"></use></svg></span><svg class=\"ic spoke-c\"><use href=\"#i-chev-l\"></use></svg></span><b class=\"mspoke-n num\">{{t.n}}</b><span class=\"mspoke-t\">{{t.title}}</span><span class=\"mspoke-s\">{{t.sub}}</span><sc-if value=\"{{t.hasAlert}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"pill {{t.alertCls}}\" style=\"height:20px;margin-top:4px\">{{t.alert}}</span></sc-if></button></sc-for></div>\n<section class=\"box now\"><div class=\"now-h\"><b class=\"row\" style=\"gap:6px\"><svg class=\"ic\" style=\"color:var(--text2)\"><use href=\"#i-zap\"></use></svg>الان مهم</b><sc-if value=\"{{hub.hasMore}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"btn btn-s\" onClick=\"{{hub.toggleAll}}\">{{hub.allLabel}}</button></sc-if></div>\n<sc-for list=\"{{hub.now}}\" as=\"a\" hint-placeholder-count=\"3\"><button class=\"rowc\" style=\"width:100%;border:0;background:none;text-align:right;cursor:pointer\" onClick=\"{{a.open}}\"><span class=\"mini\"><svg class=\"art art-photo\"><use href=\"#{{a.art}}\"></use></svg></span><span class=\"grow\" style=\"line-height:1.5\"><span class=\"small\" style=\"display:block\">{{a.title}}</span><span class=\"pill {{a.pill}}\" style=\"height:20px\">{{a.why}}</span></span><svg class=\"ic\" style=\"color:var(--text3)\"><use href=\"#i-chev-l\"></use></svg></button></sc-for>\n<sc-if value=\"{{hub.nowEmpty}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small subtle\" style=\"padding:12px\">کاری منتظر شما نیست.</p></sc-if></section>\n</div></sc-if>\n\n<sc-if value=\"{{pg.boards}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mpad\">\n<section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-layers\"></use></svg>تابلوی واحدها</div>\n<div class=\"mtiles\"><sc-for list=\"{{bh.boards}}\" as=\"b\" hint-placeholder-count=\"2\"><button class=\"mtile\" style=\"background: {{b.bg}}\" onClick=\"{{b.go}}\"><b>{{b.name}}</b><span class=\"mtile-f\"><span>{{b.sub}}</span><sc-if value=\"{{b.hasAlert}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"tile-a\">{{b.alert}}</span></sc-if></span></button></sc-for></div></section>\n<section class=\"msec\"><div class=\"sec-t\"><svg class=\"ic md\"><use href=\"#i-board\"></use></svg>تابلوی تیم‌ها</div><p class=\"xs subtle\">همه‌ی ستون‌های هر تیم: صف تیم، در حال انجام، انجام شد و…</p>\n<div class=\"mtiles\"><sc-for list=\"{{bh.teams}}\" as=\"b\" hint-placeholder-count=\"3\"><button class=\"mtile\" style=\"background: {{b.bg}}\" onClick=\"{{b.go}}\"><b>{{b.name}}</b><span class=\"mtile-f\"><span>{{b.sub}}</span><sc-if value=\"{{b.hasAlert}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"tile-a\">{{b.alert}}</span></sc-if></span></button></sc-for></div></section>\n</div></sc-if>\n\n<sc-if value=\"{{pg.today}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mpad\">\n<div class=\"mhero td-mh\"><span class=\"hub-k\">{{todayFull}}</span><b>{{td.headline}}</b><div class=\"xs subtle\">{{td.sub}}</div><sc-if value=\"{{td.hasBar}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"td-bar\" role=\"img\" aria-label=\"{{td.sub}}\"><sc-for list=\"{{td.bar}}\" as=\"b\" hint-placeholder-count=\"4\"><i class=\"{{b.cls}}\" style=\"flex: {{b.n}}\" title=\"{{b.t}}\"></i></sc-for></div></sc-if></div>\n<div class=\"td-tiles\"><sc-for list=\"{{td.tiles}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\" aria-pressed=\"{{t.cur}}\"><span class=\"spoke-i\" style=\"background: {{t.bg}}\"><svg class=\"ic md\"><use href=\"#{{t.icon}}\"></use></svg></span><span class=\"tdt-b\"><b class=\"tdt-n num\">{{t.n}}</b><span class=\"tdt-l\">{{t.label}}</span><span class=\"tdt-s\">{{t.sub}}</span></span></button></sc-for></div>\n<sc-if value=\"{{td.filtered}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"td-f\"><span class=\"small subtle\">فقط «{{td.fName}}» نمایش داده می‌شود</span><button class=\"btn btn-s\" onClick=\"{{td.showAll}}\"><svg class=\"ic\"><use href=\"#i-x\"></use></svg>نمایش همه</button></div></sc-if>\n<sc-if value=\"{{td.attn.show}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"tsec attn\" aria-label=\"نیاز به توجه\">\n<div class=\"tsec-h\"><span class=\"tsec-d\" style=\"background:var(--danger)\"></span><h2 class=\"h2\">نیاز به توجه</h2><span class=\"tsec-n num\">{{td.attn.n}}</span></div>\n<sc-for list=\"{{td.attn.rows}}\" as=\"r\" hint-placeholder-count=\"2\"><button class=\"trep\" onClick=\"{{r.open}}\"><span class=\"av\" style=\"background: {{r.bg}}\">{{r.init}}</span><span class=\"trep-b\"><span class=\"trep-t\">{{r.title}}</span><span class=\"trep-m\">{{r.who}} · {{r.team}}</span><sc-if value=\"{{r.hasQuote}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"trep-q\">{{r.quote}}</span></sc-if><sc-if value=\"{{r.hasFile}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"trep-f\"><svg class=\"ic xs\"><use href=\"#i-clip\"></use></svg><span class=\"num\">{{r.nFile}}</span> فایل پیوست</span></sc-if></span><span class=\"pill {{r.pill}}\">{{r.st}}</span></button></sc-for>\n</section></sc-if>\n<sc-if value=\"{{td.none.show}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"tsec\" aria-label=\"هنوز گزارش نداده‌اند\">\n<div class=\"tsec-h\"><span class=\"tsec-d\" style=\"background:#BFB2A3\"></span><h2 class=\"h2\">هنوز گزارش نداده‌اند</h2><span class=\"tsec-n num\">{{td.none.n}}</span><span class=\"grow\"></span><button class=\"btn btn-s tsec-a\" onClick=\"{{td.none.remindAll}}\"><svg class=\"ic\"><use href=\"#i-bell\"></use></svg>یادآوری به همه</button></div>\n<sc-for list=\"{{td.none.rows}}\" as=\"r\" hint-placeholder-count=\"3\"><button class=\"trow\" onClick=\"{{r.open}}\"><span class=\"av sm\" style=\"background: {{r.bg}}\">{{r.init}}</span><span class=\"trow-b\"><span class=\"trow-t\">{{r.title}}</span><span class=\"trow-s\">{{r.who}} · {{r.team}}</span></span><svg class=\"ic trow-c\"><use href=\"#i-chev-l\"></use></svg></button></sc-for>\n</section></sc-if>\n<sc-if value=\"{{td.ok.show}}\" hint-placeholder-val=\"{{ true }}\"><section class=\"tsec\" aria-label=\"طبق برنامه\">\n<div class=\"tsec-h\"><span class=\"tsec-d\" style=\"background:var(--ok)\"></span><h2 class=\"h2\">طبق برنامه</h2><span class=\"tsec-n num\">{{td.ok.n}}</span><span class=\"grow\"></span><sc-if value=\"{{td.ok.canToggle}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"btn btn-s tsec-a\" onClick=\"{{td.ok.toggle}}\" aria-expanded=\"{{td.ok.open}}\">{{td.ok.tgLabel}}<svg class=\"ic\"><use href=\"#{{td.ok.tgIcon}}\"></use></svg></button></sc-if></div>\n<sc-if value=\"{{td.ok.closed}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"tsec-more\" onClick=\"{{td.ok.toggle}}\"><span class=\"avs\"><sc-for list=\"{{td.ok.rows}}\" as=\"r\" hint-placeholder-count=\"4\"><span class=\"av sm\" style=\"background: {{r.bg}}\" title=\"{{r.who}}\">{{r.init}}</span></sc-for></span><span class=\"small\"><span class=\"num\">{{td.ok.n}}</span> کار پیش می‌رود؛ برای دیدن جزئیات بزنید.</span></button></sc-if>\n<sc-if value=\"{{td.ok.open}}\" hint-placeholder-val=\"{{ false }}\"><sc-for list=\"{{td.ok.rows}}\" as=\"r\" hint-placeholder-count=\"4\"><button class=\"trow\" onClick=\"{{r.open}}\"><span class=\"av sm\" style=\"background: {{r.bg}}\">{{r.init}}</span><span class=\"trow-b\"><span class=\"trow-t\">{{r.title}}</span><span class=\"trow-s\">{{r.who}} · {{r.sum}}</span></span><span class=\"trow-st\"><i class=\"{{r.dot}}\"></i>{{r.st}}</span></button></sc-for></sc-if>\n</section></sc-if>\n<sc-if value=\"{{td.allClear}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"td-clear\"><svg class=\"ic md\"><use href=\"#i-check-c\"></use></svg><span>همه گزارش داده‌اند و هیچ کاری گیر نکرده است.</span></div></sc-if>\n<sc-if value=\"{{td.empty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"td-clear\"><svg class=\"ic md\"><use href=\"#i-check-c\"></use></svg><span>در این دسته چیزی نیست.</span></div></sc-if>\n\n</div></sc-if>\n\n<sc-if value=\"{{pg.reviews}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mpad\">\n<sc-for list=\"{{revs}}\" as=\"r\" hint-placeholder-count=\"3\"><button class=\"box\" style=\"padding:10px;display:flex;gap:12px;align-items:center;text-align:right;cursor:pointer\" onClick=\"{{r.open}}\"><span class=\"mini\" style=\"width:64px;height:64px\"><svg class=\"art {{r.style}}\"><use href=\"#{{r.art}}\"></use><use class=\"u2\" href=\"#{{r.art}}\"></use></svg></span><span class=\"grow\" style=\"line-height:1.6\"><span class=\"small b\" style=\"display:block\">{{r.title}}</span><span class=\"xs subtle row\" style=\"gap:6px\"><span class=\"lchip\" style=\"height:20px;padding:0 6px\"><i class=\"{{r.listLbl}}\"></i>{{r.listName}}</span>{{r.ver}}</span><span class=\"xs subtle row\" style=\"gap:6px;margin-top:4px\"><span class=\"av sm\" style=\"background: {{r.bg}};width:20px;height:20px;font-size:10px\">{{r.init}}</span>{{r.who}}<span class=\"pill {{r.waitPill}}\" style=\"height:18px\">{{r.wait}}</span></span></span><svg class=\"ic\" style=\"color:var(--text3)\"><use href=\"#i-chev-l\"></use></svg></button></sc-for>\n<sc-if value=\"{{revsEmpty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"empty\" style=\"padding:64px 16px\"><svg class=\"ic xl\" style=\"color:var(--ok)\"><use href=\"#i-check-c\"></use></svg><b>همه بررسی شده‌اند</b></div></sc-if>\n</div></sc-if>\n\n<sc-if value=\"{{pg.notifs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"mpad\" style=\"gap:4px\">\n<div class=\"row sb\" style=\"margin-bottom:6px\"><div class=\"seg\"><button class=\"{{nfAllCls}}\" onClick=\"{{nfAll}}\">همه</button><button class=\"{{nfActCls}}\" onClick=\"{{nfAct}}\">نیاز به اقدام</button></div><button class=\"btn btn-s\" onClick=\"{{markAllRead}}\">همه خوانده شد</button></div>\n<sc-for list=\"{{notifList}}\" as=\"n\" hint-placeholder-count=\"5\"><button class=\"mi\" style=\"height:auto;padding:10px 8px;align-items:flex-start;border-bottom:1px solid var(--border);border-radius:0\" onClick=\"{{n.open}}\"><span class=\"{{n.dotCls}}\" style=\"width:8px;height:8px;border-radius:50%;margin-top:8px;flex:none\"></span><span class=\"grow\" style=\"line-height:1.6;white-space:normal\"><span class=\"small\" style=\"display:block\">{{n.text}}</span><span class=\"xs subtle\">{{n.time}}</span></span></button></sc-for>\n<sc-if value=\"{{notifEmpty}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"empty\"><svg class=\"ic xl\" style=\"color:var(--text3)\"><use href=\"#i-bell\"></use></svg><b>اعلانی نیست</b></div></sc-if>\n</div></sc-if>\n</div>\n<sc-if value=\"{{fab.show}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"fab\" onClick=\"{{fab.go}}\" aria-label=\"سفارش تازه\"><svg class=\"ic md\"><use href=\"#i-plus\"></use></svg>سفارش تازه</button></sc-if>\n<nav class=\"bnav\" aria-label=\"منوی اصلی\"><sc-for list=\"{{bnav}}\" as=\"b\" hint-placeholder-count=\"4\"><button class=\"{{b.cls}}\" onClick=\"{{b.go}}\" aria-current=\"{{b.cur}}\"><svg class=\"ic md\"><use href=\"#{{b.icon}}\"></use></svg>{{b.label}}<sc-if value=\"{{b.hasN}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"nbadge num\">{{b.n}}</span></sc-if></button></sc-for></nav>\n</sc-if>\n\n<sc-if value=\"{{lmenu.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"sheet-ov\" onClick=\"{{lmenu.bg}}\"><div class=\"sheet\" role=\"menu\" aria-label=\"منوی لیست\"><div class=\"grab\"></div>\n<div class=\"row\"><b class=\"grow\" style=\"font-size:16px\">{{mb.cur.name}}</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{mb.cur.menu}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<sc-if value=\"{{mb.cur.hasInfo}}\" hint-placeholder-val=\"{{ true }}\"><p class=\"xs subtle\">{{mb.cur.menuInfo}}</p></sc-if>\n<sc-if value=\"{{mb.cur.canEdit}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{mb.cur.rename}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>تغییر نام</button>\n<sc-if value=\"{{mb.cur.canRight}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{lmenu.mvRight}}\"><svg class=\"ic\"><use href=\"#i-arrow-r\"></use></svg>یک لیست جلوتر</button></sc-if>\n<sc-if value=\"{{mb.cur.canLeft}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{lmenu.mvLeft}}\"><svg class=\"ic\"><use href=\"#i-arrow-l\"></use></svg>یک لیست عقب‌تر</button></sc-if></sc-if>\n<sc-if value=\"{{mb.cur.hasTeam}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"mi\" onClick=\"{{mb.cur.goTeam}}\"><svg class=\"ic\"><use href=\"#i-board\"></use></svg>دیدن تابلوی تیم</button></sc-if>\n<sc-if value=\"{{mb.cur.canDel}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"msep\"></div><button class=\"mi dan\" onClick=\"{{mb.cur.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg>حذف لیست</button></sc-if>\n</div></div></sc-if>\n\n<sc-if value=\"{{qm.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"sheet-ov\" onClick=\"{{qmBg}}\"><div class=\"sheet\" role=\"menu\" aria-label=\"کارهای سریع\"><div class=\"grab\"></div>\n<div class=\"row\"><b class=\"grow\" style=\"font-size:16px\">{{qmTitle}}</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{qmClose}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<button class=\"mi\" onClick=\"{{qm.openCard}}\"><svg class=\"ic\"><use href=\"#i-card\"></use></svg>باز کردن کارت</button>\n<sc-if value=\"{{qm.canAssign}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi\" onClick=\"{{qm.assign}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>{{qm.assignLabel}}</button></sc-if>\n<sc-if value=\"{{qm.canClaim}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"mi\" onClick=\"{{qm.claim}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>{{qm.claimLabel}}</button></sc-if>\n<div class=\"mh\">انتقال به</div>\n<sc-for list=\"{{qm.moves}}\" as=\"mv\" hint-placeholder-count=\"4\"><button class=\"mi\" onClick=\"{{mv.go}}\" disabled=\"{{mv.cur}}\"><span class=\"lbl {{mv.lbl}}\" style=\"height:10px;width:20px;padding:0\"></span><span class=\"grow\">{{mv.label}}</span><sc-if value=\"{{mv.cur}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"xs subtle\">فعلی</span></sc-if></button></sc-for>\n<sc-if value=\"{{qm.isMgr}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"msep\"></div>\n<button class=\"mi\" onClick=\"{{qm.urgent}}\"><svg class=\"ic\"><use href=\"#i-zap\"></use></svg>{{qm.urgentLabel}}</button>\n<button class=\"mi dan\" onClick=\"{{qm.cancel}}\"><svg class=\"ic\"><use href=\"#i-archive\"></use></svg>لغو و بایگانی</button></sc-if>\n</div></div></sc-if>\n\n<sc-if value=\"{{cb.anyPop}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"sheet-ov\" onClick=\"{{cb.sheetBg}}\"><div class=\"sheet\" role=\"dialog\" aria-modal=\"true\" aria-label=\"{{cb.popTitle}}\"><div class=\"grab\"></div>\n<div class=\"row\"><b class=\"grow\" style=\"font-size:16px\">{{cb.popTitle}}</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cb.popClose}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<sc-if value=\"{{cb.pMenu}}\" hint-placeholder-val=\"{{ true }}\">\n<button class=\"mi\" onClick=\"{{cb.assign}}\" disabled=\"{{cb.noAssign}}\"><svg class=\"ic\"><use href=\"#i-user-plus\"></use></svg>سپردن و اعضا</button>\n<button class=\"mi\" onClick=\"{{cb.popDates}}\" disabled=\"{{cb.noDates}}\"><svg class=\"ic\"><use href=\"#i-clock\"></use></svg>تاریخ و ساعت تحویل</button>\n<button class=\"mi\" onClick=\"{{cb.addAtt}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست فایل</button>\n<button class=\"mi\" onClick=\"{{cb.popUrgent}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-zap\"></use></svg>{{cb.urgentLabel}}</button>\n<button class=\"mi\" onClick=\"{{cb.popMove}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-move\"></use></svg>انتقال به لیست دیگر</button>\n<button class=\"mi\" onClick=\"{{cb.popTeam}}\" disabled=\"{{cb.noTeam}}\"><svg class=\"ic\"><use href=\"#i-team\"></use></svg>ارسال به واحد دیگر</button>\n<button class=\"mi\" onClick=\"{{cb.edit}}\" disabled=\"{{cb.isArch}}\"><svg class=\"ic\"><use href=\"#i-pen-sm\"></use></svg>ویرایش مشخصات</button>\n<div class=\"msep\"></div>\n<sc-if value=\"{{cb.isArch}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"mi\" onClick=\"{{cb.restore}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>بازگرداندن</button></sc-if>\n<sc-if value=\"{{cb.notArch}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"mi dan\" onClick=\"{{cb.popCancel}}\"><svg class=\"ic\"><use href=\"#i-archive\"></use></svg>لغو و بایگانی</button></sc-if>\n</sc-if>\n<sc-if value=\"{{cb.pDates}}\" hint-placeholder-val=\"{{ false }}\">\n<span class=\"flab\">روز</span><div class=\"opts\"><sc-for list=\"{{cb.dueOpts}}\" as=\"d\" hint-placeholder-count=\"5\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<span class=\"flab\">ساعت</span><div class=\"opts\"><sc-for list=\"{{cb.dueHours}}\" as=\"d\" hint-placeholder-count=\"5\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<button class=\"btn btn-lg btn-w\" onClick=\"{{cb.dueCal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>انتخاب از تقویم</button>\n<button class=\"btn btn-s btn-w\" onClick=\"{{cb.duePause}}\"><svg class=\"ic\"><use href=\"#i-pause-c\"></use></svg>{{cb.pauseLabel}}</button>\n</sc-if>\n<sc-if value=\"{{cb.pUrgent}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small muted\">کارت با برچسب قرمز بالای لیست می‌نشیند و به اعضای کارت خبر می‌رسد.</p>\n<div class=\"opts\"><sc-for list=\"{{cb.ugQuick}}\" as=\"q\" hint-placeholder-count=\"3\"><button class=\"{{q.cls}}\" onClick=\"{{q.pick}}\">{{q.label}}</button></sc-for></div>\n<button class=\"btn btn-d btn-lg btn-w\" onClick=\"{{cb.ugGo}}\">فوری شود</button></sc-if>\n<sc-if value=\"{{cb.pMove}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"flab\">لیست در {{cb.boardName}}</span>\n<sc-for list=\"{{cb.mvLists}}\" as=\"l\" hint-placeholder-count=\"5\"><button class=\"{{l.cls}}\" style=\"min-height:48px\" onClick=\"{{l.pick}}\" disabled=\"{{l.cur}}\"><span class=\"lbl {{l.lbl}}\" style=\"height:10px;width:20px;padding:0\"></span><span class=\"grow small\">{{l.name}}</span><sc-if value=\"{{l.cur}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"xs subtle\">فعلی</span></sc-if></button></sc-for></sc-if>\n<sc-if value=\"{{cb.pTeam}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small muted\">یک کارت مرتبط در تابلوی آن واحد ساخته می‌شود؛ این کارت سر جایش می‌ماند.</p>\n<sc-for list=\"{{cb.xBoards}}\" as=\"t\" hint-placeholder-count=\"1\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\"><span class=\"radio\"></span><span class=\"bsq\" style=\"background: {{t.bg}}\"></span><span class=\"grow small\">{{t.name}}</span></button></sc-for>\n<div class=\"fld\"><label for=\"mx-t\">عنوان کارت تازه</label><input id=\"mx-t\" class=\"inp\" value=\"{{cb.xTitle}}\" onChange=\"{{cb.onXTitle}}\"></div>\n<button class=\"btn btn-p btn-lg btn-w\" onClick=\"{{cb.xGo}}\">ساخت کارت</button></sc-if>\n<sc-if value=\"{{cb.pCancel}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"small muted\">کارت به آرشیو «لغوشده‌ها» می‌رود و هر وقت بخواهید برمی‌گردد.</p>\n<div class=\"opts\"><sc-for list=\"{{cb.cnQuick}}\" as=\"q\" hint-placeholder-count=\"3\"><button class=\"{{q.cls}}\" onClick=\"{{q.pick}}\">{{q.label}}</button></sc-for></div>\n<sc-if value=\"{{cb.cnErr}}\" hint-placeholder-val=\"{{ false }}\"><p class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>دلیل را انتخاب کنید.</p></sc-if>\n<button class=\"btn btn-d btn-lg btn-w\" onClick=\"{{cb.cnGo}}\">لغو و انتقال به آرشیو</button></sc-if>\n</div></div></sc-if>\n\n<sc-if value=\"{{dlg.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"sheet-ov\" style=\"z-index:60\" onClick=\"{{dlg.bg}}\"><div class=\"sheet\" role=\"dialog\" aria-modal=\"true\" aria-label=\"{{dlg.title}}\"><div class=\"grab\"></div>\n<div class=\"row\" style=\"align-items:flex-start\"><div class=\"grow\"><b style=\"font-size:17px;line-height:1.5\">{{dlg.title}}</b><sc-if value=\"{{dlg.hasSub}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"xs muted\" style=\"line-height:1.6\">{{dlg.sub}}</div></sc-if></div><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{dlg.close}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<sc-if value=\"{{dlg.isApprove}}\" hint-placeholder-val=\"{{ false }}\"><div style=\"display:flex;flex-direction:column;gap:6px\"><span class=\"flab\">کیفیت این نسخه</span><sc-for list=\"{{ap.grades}}\" as=\"g\" hint-placeholder-count=\"3\"><button class=\"{{g.cls}}\" style=\"min-height:52px\" onClick=\"{{g.pick}}\"><span class=\"radio\"></span><span class=\"grow\" style=\"line-height:1.5\"><b class=\"small\">{{g.label}}</b><span class=\"xs subtle\" style=\"display:block\">{{g.hint}}</span></span></button></sc-for></div></sc-if>\n<sc-if value=\"{{dlg.isAssign}}\" hint-placeholder-val=\"{{ false }}\">\n<div class=\"fld\"><span class=\"flab\">۱. کدام مرحله؟</span><div class=\"stgs mstgs\"><sc-for list=\"{{as.stages}}\" as=\"g\" hint-placeholder-count=\"3\"><button class=\"{{g.cls}}\" onClick=\"{{g.pick}}\" aria-pressed=\"{{g.on}}\"><b>{{g.name}}</b><span>{{g.sub}}</span></button></sc-for></div>\n<sc-if value=\"{{as.hasSkip}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"xs\" style=\"color:var(--warnT);display:flex;gap:6px;align-items:center;line-height:1.6\"><svg class=\"ic xs\"><use href=\"#i-forward\"></use></svg>{{as.skipTxt}}</span></sc-if></div>\n<div class=\"fld\"><span class=\"flab\">۲. به چه کسی؟ (یک یا چند نفر، یا کل تیم)</span><div style=\"display:flex;flex-direction:column;gap:4px\">\n<button class=\"{{as.poolCls}}\" role=\"checkbox\" aria-checked=\"{{as.pool}}\" onClick=\"{{as.togglePool}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"av\" style=\"background:var(--purpleT)\"><svg class=\"ic xs\" style=\"color:#fff\"><use href=\"#i-team\"></use></svg></span><span class=\"grow\" style=\"line-height:1.4\"><span class=\"small b\" style=\"display:block\">کل تیم {{as.teamName}}</span><span class=\"xs subtle\">{{as.poolSub}}</span></span></button>\n<sc-for list=\"{{as.staff}}\" as=\"p\" hint-placeholder-count=\"2\"><button class=\"{{p.cls}}\" style=\"min-height:52px\" role=\"checkbox\" aria-checked=\"{{p.on}}\" onClick=\"{{p.toggle}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"av\" style=\"background: {{p.bg}}\">{{p.init}}</span><span class=\"grow\" style=\"line-height:1.4\"><span class=\"small\" style=\"display:block\">{{p.name}}</span><span class=\"xs subtle\">{{p.load}}</span></span><sc-if value=\"{{p.hasKt}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"kt s {{p.ktCls}}\">{{p.kt}}</span></sc-if></button></sc-for>\n<sc-if value=\"{{as.noStaff}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"call gray small\">هنوز کسی در این تیم نیست. از «تنظیمات › اعضا» اضافه کنید.</div></sc-if></div></div>\n<div class=\"fld\"><span class=\"flab\">۳. تحویل: {{as.dueTxt}}</span><div class=\"opts\"><sc-for list=\"{{as.dues}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for><button class=\"opt\" onClick=\"{{as.cal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>{{as.calTxt}}</button></div><div class=\"opts\"><sc-for list=\"{{as.hours}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div></div>\n<div class=\"fld\"><span class=\"flab\">۴. توضیح، فایل یا پیام صوتی (اختیاری)</span>\n<textarea class=\"inp\" style=\"min-height:56px\" aria-label=\"توضیح\" placeholder=\"هر چه طراح باید بداند…\" value=\"{{as.note}}\" onChange=\"{{as.onNote}}\"></textarea>\n<sc-if value=\"{{as.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{as.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<button class=\"btn btn-w\" onClick=\"{{as.addFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست فایل یا عکس</button>\n<div class=\"rec\"><button class=\"{{rec.cls}}\" aria-label=\"برای ضبط پیام صوتی نگه دارید\" onPointerDown=\"{{rec.down}}\" onPointerUp=\"{{rec.up}}\" onPointerLeave=\"{{rec.up}}\"><svg class=\"ic md\"><use href=\"#i-mic\"></use></svg></button><div class=\"grow small\">{{rec.label}}</div><sc-if value=\"{{rec.isRec}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"rec-bars\"><i></i><i style=\"animation-delay:.15s\"></i><i style=\"animation-delay:.3s\"></i></span></sc-if><sc-if value=\"{{rec.has}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" aria-label=\"حذف پیام صوتی\" onClick=\"{{rec.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg></button></sc-if></div>\n</div>\n</sc-if>\n<sc-if value=\"{{dlg.isReturn}}\" hint-placeholder-val=\"{{ false }}\">\n<span class=\"flab\">دلیل برگشت</span><div class=\"opts\"><sc-for list=\"{{rt.reasons}}\" as=\"r\" hint-placeholder-count=\"4\"><button class=\"{{r.cls}}\" onClick=\"{{r.pick}}\">{{r.label}}</button></sc-for></div><span class=\"xs subtle\">{{rt.reasonHint}}</span>\n<div class=\"row sb\"><span class=\"flab\">روی نسخه علامت بزنید</span><div class=\"seg\"><sc-for list=\"{{rt.tools}}\" as=\"t\" hint-placeholder-count=\"3\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\">{{t.label}}</button></sc-for></div></div>\n<div class=\"anno-w\" style=\"width:260px;align-self:center\" onPointerDown=\"{{rt.aDown}}\" onPointerMove=\"{{rt.aMove}}\" onPointerUp=\"{{rt.aUp}}\"><svg class=\"art {{rt.style}}\"><use href=\"#{{rt.art}}\"></use><use class=\"u2\" href=\"#{{rt.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{rt.path}}\"></path></svg></div>\n<sc-if value=\"{{rt.hasAnno}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn btn-s\" style=\"align-self:center\" onClick=\"{{rt.undoAnno}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>برداشتن آخرین علامت</button></sc-if>\n<textarea class=\"inp\" style=\"min-height:56px\" placeholder=\"چه چیزی باید اصلاح شود؟\" aria-label=\"توضیح\" value=\"{{rt.text}}\" onChange=\"{{rt.onText}}\"></textarea>\n<sc-if value=\"{{rt.hasFiles}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips\"><sc-for list=\"{{rt.files}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if>\n<button class=\"btn btn-w\" onClick=\"{{rt.addFile}}\"><svg class=\"ic\"><use href=\"#i-clip\"></use></svg>پیوست فایل یا عکس</button>\n<div class=\"rec\"><button class=\"{{rec.cls}}\" aria-label=\"برای ضبط پیام صوتی نگه دارید\" onPointerDown=\"{{rec.down}}\" onPointerUp=\"{{rec.up}}\" onPointerLeave=\"{{rec.up}}\"><svg class=\"ic md\"><use href=\"#i-mic\"></use></svg></button><div class=\"grow small\">{{rec.label}}</div><sc-if value=\"{{rec.has}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"ib\" aria-label=\"حذف پیام صوتی\" onClick=\"{{rec.del}}\"><svg class=\"ic\"><use href=\"#i-trash\"></use></svg></button></sc-if></div>\n<span class=\"flab\">تحویل اصلاحیه</span><div class=\"opts\"><sc-for list=\"{{rt.dues}}\" as=\"d\" hint-placeholder-count=\"4\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for><button class=\"opt\" onClick=\"{{rt.cal}}\"><svg class=\"ic\"><use href=\"#i-cal\"></use></svg>{{rt.calTxt}}</button></div>\n</sc-if>\n<sc-if value=\"{{dlg.isSend}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"flab\">از چه راهی فرستادید؟</span><div class=\"opts\"><sc-for list=\"{{sd.chs}}\" as=\"c\" hint-placeholder-count=\"5\"><button class=\"{{c.cls}}\" style=\"min-height:44px\" onClick=\"{{c.pick}}\"><svg class=\"ic\"><use href=\"#{{c.icon}}\"></use></svg>{{c.label}}</button></sc-for></div></sc-if>\n<sc-if value=\"{{dlg.isCust}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"flab\">مشتری کِی تأیید کرد؟</span><div class=\"opts\"><sc-for list=\"{{co.dates}}\" as=\"d\" hint-placeholder-count=\"3\"><button class=\"{{d.cls}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div><textarea class=\"inp\" style=\"min-height:52px\" aria-label=\"یادداشت\" placeholder=\"یادداشت (اختیاری)\" value=\"{{co.note}}\" onChange=\"{{co.onNote}}\"></textarea></sc-if>\n<sc-if value=\"{{dlg.isCreate}}\" hint-placeholder-val=\"{{ false }}\">\n<sc-if value=\"{{cr.showKinds}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"seg\" style=\"align-self:flex-start\"><sc-for list=\"{{cr.kinds}}\" as=\"k\" hint-placeholder-count=\"2\"><button class=\"{{k.cls}}\" onClick=\"{{k.pick}}\">{{k.label}}</button></sc-for></div></sc-if>\n<div class=\"fld {{cr.titleErr}}\"><label for=\"mcr-t\">عنوان</label><input id=\"mcr-t\" class=\"inp\" value=\"{{cr.title}}\" onChange=\"{{cr.onTitle}}\" placeholder=\"{{cr.titlePh}}\"></div>\n<div class=\"fld\"><span class=\"flab\">عکس‌های نمونه</span><sc-if value=\"{{cr.hasRefs}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"fchips big\"><sc-for list=\"{{cr.refs}}\" as=\"f\" hint-placeholder-count=\"1\"><span class=\"fchip\"><button class=\"fchip-b\" onClick=\"{{f.open}}\" title=\"{{f.name}}\"><sc-if value=\"{{f.isImg}}\" hint-placeholder-val=\"{{ true }}\"><span class=\"fthumb\"><svg class=\"art art-photo\"><use href=\"#{{f.art}}\"></use></svg></span></sc-if><sc-if value=\"{{f.notImg}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"fico\"><svg class=\"ic\"><use href=\"#{{f.icon}}\"></use></svg></span></sc-if><span class=\"fname\">{{f.name}}</span></button><sc-if value=\"{{f.canDel}}\" hint-placeholder-val=\"{{ true }}\"><button class=\"ib fx\" aria-label=\"حذف {{f.name}}\" onClick=\"{{f.del}}\"><svg class=\"ic xs\"><use href=\"#i-x\"></use></svg></button></sc-if></span></sc-for></div></sc-if><div class=\"row\" style=\"gap:8px\"><button class=\"btn grow\" onClick=\"{{cr.addRefCust}}\"><svg class=\"ic\"><use href=\"#i-camera\"></use></svg>عکس مشتری</button><button class=\"btn grow\" onClick=\"{{cr.addRefUs}}\"><svg class=\"ic\"><use href=\"#i-image\"></use></svg>از گالری خودمان</button></div></div>\n<sc-if value=\"{{cr.isOrder}}\" hint-placeholder-val=\"{{ true }}\">\n<div class=\"fld\"><span class=\"flab\">نوع</span><div class=\"opts\"><sc-for list=\"{{cr.types}}\" as=\"t\" hint-placeholder-count=\"6\"><button class=\"{{t.cls}}\" onClick=\"{{t.pick}}\"><svg class=\"ic\"><use href=\"#{{t.art}}\"></use></svg>{{t.label}}</button></sc-for></div></div>\n<div class=\"row\" style=\"gap:12px;align-items:flex-start\"><div class=\"fld\"><span class=\"flab\">عیار</span><div class=\"seg\"><sc-for list=\"{{cr.karats}}\" as=\"k\" hint-placeholder-count=\"3\"><button class=\"{{k.cls}}\" onClick=\"{{k.pick}}\">{{k.label}}</button></sc-for></div></div><div class=\"fld grow\"><label for=\"mcr-w\">وزن (گرم)</label><input id=\"mcr-w\" class=\"inp num\" inputmode=\"decimal\" value=\"{{cr.weight}}\" onChange=\"{{cr.onWeight}}\"></div></div>\n<div class=\"fld {{cr.nameErr}}\"><label for=\"mcr-n\">نام مشتری</label><input id=\"mcr-n\" class=\"inp\" value=\"{{cr.name}}\" onChange=\"{{cr.onName}}\"></div>\n<div class=\"fld {{cr.phoneErr}}\"><label for=\"mcr-p\">موبایل مشتری</label><input id=\"mcr-p\" class=\"inp num\" dir=\"ltr\" inputmode=\"numeric\" placeholder=\"09…\" value=\"{{cr.phone}}\" onChange=\"{{cr.onPhone}}\"></div>\n<div class=\"fld\"><span class=\"flab\">راه ارتباط مشتری</span><div class=\"opts\"><sc-for list=\"{{cr.chs}}\" as=\"c\" hint-placeholder-count=\"5\"><button class=\"{{c.cls}}\" onClick=\"{{c.pick}}\"><svg class=\"ic\"><use href=\"#{{c.icon}}\"></use></svg>{{c.label}}</button></sc-for></div></div>\n</sc-if>\n<div class=\"fld\"><label for=\"mcr-d\">توضیحات (اختیاری)</label><textarea id=\"mcr-d\" class=\"inp\" style=\"min-height:56px\" value=\"{{cr.desc}}\" onChange=\"{{cr.onDesc}}\"></textarea></div>\n</sc-if>\n<sc-if value=\"{{dlg.isMembers}}\" hint-placeholder-val=\"{{ false }}\">\n<div style=\"display:flex;flex-direction:column;gap:4px\"><sc-for list=\"{{mbs.people}}\" as=\"p\" hint-placeholder-count=\"5\"><button class=\"{{p.cls}}\" style=\"min-height:48px\" role=\"checkbox\" aria-checked=\"{{p.on}}\" onClick=\"{{p.toggle}}\"><span class=\"box16\"><svg class=\"ic xs\" style=\"stroke-width:3\"><use href=\"#i-check\"></use></svg></span><span class=\"av sm\" style=\"background: {{p.bg}}\">{{p.init}}</span><span class=\"grow small\">{{p.name}}</span><span class=\"xs subtle\">{{p.secs}}</span></button></sc-for></div>\n</sc-if>\n<sc-if value=\"{{dlg.isObj}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"call gray small\" style=\"gap:4px\"><b>{{ob.title}}</b><span class=\"muted\">دلیل: {{ob.reason}} · {{ob.date}}</span></div><textarea class=\"inp\" aria-label=\"دلیل اعتراض\" placeholder=\"چرا فکر می‌کنید این ارجاع درست نیست؟\" value=\"{{ob.text}}\" onChange=\"{{ob.onText}}\"></textarea></sc-if>\n<sc-if value=\"{{dlg.isCompare}}\" hint-placeholder-val=\"{{ false }}\"><div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px\"><sc-for list=\"{{cmp.items}}\" as=\"v\" hint-placeholder-count=\"2\"><div style=\"display:flex;flex-direction:column;gap:6px\"><div class=\"big-img\"><svg class=\"art {{v.style}}\"><use href=\"#{{v.art}}\"></use><use class=\"u2\" href=\"#{{v.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{v.path}}\"></path></svg></div><b class=\"small\">{{v.label}}</b><span class=\"pill {{v.pill}}\" style=\"align-self:flex-start\">{{v.status}}</span></div></sc-for></div></sc-if>\n<sc-if value=\"{{dlg.isLight}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"big-img\"><svg class=\"art {{lb.style}}\"><use href=\"#{{lb.art}}\"></use><use class=\"u2\" href=\"#{{lb.art}}\"></use></svg><svg class=\"anno\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\"><path d=\"{{lb.path}}\"></path></svg></div><sc-if value=\"{{lb.hasNote}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"cmt\">{{lb.note}}</div></sc-if></sc-if>\n<sc-if value=\"{{dlg.hasErr}}\" hint-placeholder-val=\"{{ false }}\"><span class=\"err-t\"><svg class=\"ic xs\"><use href=\"#i-alert\"></use></svg>{{dlg.err}}</span></sc-if>\n<sc-if value=\"{{dlg.hasFoot}}\" hint-placeholder-val=\"{{ true }}\"><div class=\"sheet-f\"><button class=\"btn btn-lg grow {{dlg.okCls}}\" onClick=\"{{dlg.ok}}\">{{dlg.okLabel}}</button><button class=\"btn btn-lg btn-s\" onClick=\"{{dlg.close}}\">انصراف</button></div></sc-if>\n</div></div></sc-if>\n\n<sc-if value=\"{{cal.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"sheet-ov\" style=\"z-index:70\" onClick=\"{{cal.bg}}\"><div class=\"sheet\" role=\"dialog\" aria-modal=\"true\" aria-label=\"{{cal.title}}\"><div class=\"grab\"></div>\n<div class=\"row\"><b class=\"grow\" style=\"font-size:16px\">{{cal.title}}</b><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{cal.close}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"row sb\"><button class=\"ib\" aria-label=\"ماه قبل\" onClick=\"{{cal.prev}}\" disabled=\"{{cal.noPrev}}\"><svg class=\"ic\"><use href=\"#i-chev-r\"></use></svg></button><b>{{cal.month}}</b><button class=\"ib\" aria-label=\"ماه بعد\" onClick=\"{{cal.next}}\" disabled=\"{{cal.noNext}}\"><svg class=\"ic\"><use href=\"#i-chev-l\"></use></svg></button></div>\n<div class=\"cal mcal\"><sc-for list=\"{{cal.wds}}\" as=\"w\" hint-placeholder-count=\"7\"><span class=\"cal-h\">{{w.t}}</span></sc-for><sc-for list=\"{{cal.days}}\" as=\"d\" hint-placeholder-count=\"30\"><button class=\"{{d.cls}}\" disabled=\"{{d.dis}}\" aria-label=\"{{d.aria}}\" onClick=\"{{d.pick}}\">{{d.label}}</button></sc-for></div>\n<span class=\"xs subtle\">{{cal.hint}}</span>\n</div></div></sc-if>\n</sc-if>\n\n<sc-if value=\"{{acct.open}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"sheet-ov\" style=\"z-index:65\" onClick=\"{{acct.bg}}\"><div class=\"sheet\" role=\"dialog\" aria-modal=\"true\" aria-label=\"حساب کاربری\"><div class=\"grab\"></div>\n<div class=\"row\" style=\"gap:12px\"><span class=\"av lg\" style=\"background: {{user.bg}}\">{{user.init}}</span><div class=\"grow\" style=\"line-height:1.5\"><b>{{user.name}}</b><div class=\"xs subtle\">{{acct.role}}</div></div><button class=\"ib\" aria-label=\"بستن\" onClick=\"{{acct.close}}\"><svg class=\"ic md\"><use href=\"#i-x\"></use></svg></button></div>\n<div class=\"msep\"></div>\n<button class=\"mi\" onClick=\"{{acct.dark}}\"><svg class=\"ic\"><use href=\"#{{acct.darkIcon}}\"></use></svg>{{acct.darkLabel}}</button>\n<button class=\"mi\" onClick=\"{{acct.install}}\"><svg class=\"ic\"><use href=\"#i-download\"></use></svg>نصب برنامه روی گوشی</button>\n<a class=\"mi\" href=\"guide.html\" style=\"text-decoration:none\"><svg class=\"ic\"><use href=\"#i-desc\"></use></svg>راهنمای استفاده</a>\n<a class=\"mi\" href=\"install.html\" style=\"text-decoration:none\"><svg class=\"ic\"><use href=\"#i-mobile\"></use></svg>راهنمای نصب</a>\n<a class=\"mi\" href=\"./?ui=desktop\" style=\"text-decoration:none\"><svg class=\"ic\"><use href=\"#i-monitor\"></use></svg>نسخه‌ی کامل (رایانه)</a>\n<button class=\"mi\" onClick=\"{{resetData}}\"><svg class=\"ic\"><use href=\"#i-undo\"></use></svg>بازنشانی داده‌های نمایشی</button>\n<div class=\"msep\"></div>\n<button class=\"mi dan\" onClick=\"{{acct.logout}}\"><svg class=\"ic\"><use href=\"#i-logout\"></use></svg>خروج از حساب</button>\n</div></div></sc-if>\n<sc-if value=\"{{toast.on}}\" hint-placeholder-val=\"{{ false }}\"><div class=\"toast\" role=\"status\" aria-live=\"polite\"><svg class=\"ic\"><use href=\"#{{toast.icon}}\"></use></svg><span class=\"grow small\">{{toast.text}}</span><sc-if value=\"{{toast.hasUndo}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{toast.undo}}\">برگرداندن</button></sc-if><sc-if value=\"{{toast.hasAct}}\" hint-placeholder-val=\"{{ false }}\"><button class=\"btn\" onClick=\"{{toast.act}}\">{{toast.actLabel}}</button></sc-if></div></sc-if>\n\n</div>\n</div>\n";

/* ===== boot: pick UI, restore data, sync the address bar ===== */
(function () {
  'use strict';
  const KEY = 'rasta-demo-data', VER = 5;
  const TRANSIENT = ['toast', 'dlg', 'm', 'cal', 'qm', 'drag', 'dragCtx', 'over', 'flash', 'hdr', 'filterOpen', 'quick', 'quickText', 'quickRefs', 'lEdit', 'lMenu',
    'addL', 'repNote', 'cbPop', 'cbx', 'play', 'login', 'pageState', 'search', 'demo', 'stage', 'cb', 'acct', 'device', 'side', 'pwaNew'];
  const qs = new URLSearchParams(location.search);
  window.__rastaDemo = qs.get('demo') === '1';
  const forced = qs.get('ui');
  const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const pickUI = () => (forced === 'mobile' || forced === 'desktop') ? forced : (window.matchMedia('(max-width: 699px)').matches ? 'mobile' : 'desktop');

  let saveTimer = null;
  function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); return o && o.v === VER ? o.s : null; } catch (e) { return null; } }
  function save(st) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { const o = {}; for (const k in st) if (TRANSIENT.indexOf(k) < 0) o[k] = st[k]; localStorage.setItem(KEY, JSON.stringify({v: VER, at: Date.now(), s: o})); } catch (e) {}
    }, 300);
  }
  window.__rastaReset = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.hash = '#/login'; location.reload(); };

  /* ----- routes: #/login, #/home, #/board/orders, #/team/sk, #/person/maryam, … + /card/145 ----- */
  function routeOf(s) {
    if (!s.logged) return '#/login';
    let r = '#/' + (s.page || 'home');
    if (s.page === 'board') r += '/' + s.boardId;
    else if (s.page === 'team') r += '/' + s.teamId;
    else if (s.page === 'person' && s.pid) r += '/' + s.pid;
    if (s.cb != null) r += '/card/' + s.cb;
    return r;
  }
  const PAGES = {desktop: {mgr: ['home', 'boards', 'board', 'team', 'reviews', 'today', 'archive', 'members', 'person', 'reports', 'settings'], stf: ['team', 'score']},
    mobile: {mgr: ['home', 'boards', 'board', 'team', 'reviews', 'today', 'notifs'], stf: ['team', 'score', 'notifs']}};
  const allowed = (c, page) => (PAGES[ui] || PAGES.desktop)[c.state.role === 'mgr' ? 'mgr' : 'stf'].indexOf(page) >= 0;
  function normalize(c) {
    const s = c.state;
    if (!s.logged) return;
    if (!allowed(c, s.page)) { const h = c.homeFor(s.role, s.me); c.go(h.page, h); }
    if (s.page === 'team' && s.role !== 'mgr' && !c.myTeams().some(x => x.id === s.teamId)) { const h = c.homeFor('stf', s.me); c.go('team', h); }
  }
  function applyRoute(c, hash) {
    const s = c.state;
    if (!s.logged) return;
    const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!parts.length || parts[0] === 'login') return;
    const page = parts[0];
    if (!allowed(c, page)) { normalize(c); return; }
    let i = 1, extra = {};
    if (page === 'board' && parts[1] && parts[1] !== 'card') { extra.boardId = parts[1]; i = 2; }
    if (page === 'team' && parts[1] && parts[1] !== 'card') { extra.teamId = parts[1]; i = 2; }
    if (page === 'person' && parts[1] && parts[1] !== 'card') { extra.pid = parts[1]; i = 2; }
    if (extra.boardId && !c.board(extra.boardId)) delete extra.boardId;
    if (extra.teamId && !c.sec(extra.teamId)) delete extra.teamId;
    const card = parts[i] === 'card' ? Number(parts[i + 1]) : null;
    const samePage = s.page === page && Object.keys(extra).every(k => s[k] === extra[k]);
    if (!samePage) c.go(page, extra);
    if (card != null && c.get(card)) { if (c.state.cb !== card) c.openCard(card); }
    else if (c.state.cb != null) c.closeCard();
    if (c.state.dlg) c.closeDlg();
    normalize(c);
  }

  let host = null, ui = null, applying = false, lastRoute = null;
  const el = document.getElementById('app');
  function mount() {
    ui = pickUI();
    document.body.classList.toggle('ui-m', ui === 'mobile');
    document.body.classList.toggle('ui-d', ui !== 'mobile');
    el.className = ui === 'mobile' ? 'app-m' : 'app-d';
    const Comp = ui === 'mobile' ? window.RastaMobileWeb : window.RastaDesktopWeb;
    host = new window.RastaHost(el, Comp, {device: ui === 'desktop' && touch ? 'tablet' : 'desktop'}, {
      template: ui === 'mobile' ? window.RASTA_T_MOBILE : window.RASTA_T_DESKTOP,
      onInit: c => {
        const saved = load();
        if (saved) Object.assign(c.state, saved); else c.state.logged = false;
        if (ui === 'mobile') Object.assign(c.state, {stage: 'app'});
        applying = true; applyRoute(c, location.hash); normalize(c); applying = false;
      },
      onRender: c => {
        save(c.state);
        const r = routeOf(c.state);
        if (r !== location.hash) {
          const replace = applying || !lastRoute || r === '#/login' || lastRoute === '#/login';
          try { history[replace ? 'replaceState' : 'pushState'](null, '', r); } catch (e) { location.hash = r; }
        }
        if (r !== lastRoute) requestAnimationFrame(() => { try { el.querySelectorAll('.chiprow .on, .ltabs .ltab.on').forEach(x => x.scrollIntoView({block: 'nearest', inline: 'center'})); } catch (e) {} });
        lastRoute = r;
        document.title = c.state.logged ? 'رستا — مدیریت کارهای گالری' : 'ورود به رستا';
      }
    });
  }
  window.addEventListener('popstate', () => {
    if (!host) return;
    applying = true; applyRoute(host.comp, location.hash); applying = false;
    host.schedule();
  });
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (pickUI() === ui) return;
      try { const o = {}; const st = host.comp.state; for (const k in st) if (TRANSIENT.indexOf(k) < 0) o[k] = st[k]; localStorage.setItem(KEY, JSON.stringify({v: VER, at: Date.now(), s: o})); } catch (e) {}
      host.destroy(); mount();
    }, 250);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !host || e.__rastaHandled) return;
    const c = host.comp, s = c.state;
    if (s.cal) c.setState({cal: null});
    else if (s.dlg) c.closeDlg();
    else if (s.cbPop) c.setState({cbPop: null});
    else if (s.acct) c.setState({acct: false});
    else if (s.qm || s.lMenu || s.filterOpen) c.closePops();
    else if (s.cb != null) c.closeCard();
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__rastaInstallPrompt = e; });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  mount();
})();
