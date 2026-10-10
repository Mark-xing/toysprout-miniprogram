// scripts/verify-detail-open.js
// 真机链路回归：发现页「点击卡片 → 打开详情页」是否打通。
//
// 为什么单独有这个脚本：2026-10-10 用户报「点击查看玩具的详情都展示玩具不存在」，
// 根因是组件 triggerEvent('tap') 与原生 tap 撞名，页面 bind:tap 收到的是原生事件的
// {x,y} 触点坐标而非 {id}。修复后需要一条链路级回归，防止哪天又被改回去。
// —— 顺带说明：修复前这条链路是「静默错」的，离线单测 100% 全绿。
//
// 运行前置：
//   1) 微信开发者工具已打开本项目、已登录；
//   2) /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
//        --project <项目绝对路径> --auto-port 9420
//   3) 数据库里已有演示数据（见 小程序项目档案.md「演示数据」一节）
// 然后： node scripts/verify-detail-open.js
//
// 环境限制（2026-10-10 实测，勿反复试探）：
//   - automator 只能走**逻辑层**协议。view 层协议在本 IDE 版本全部挂起，
//     逐个实测均 HANG 6s 无响应：Page.getElement / Page.getElements /
//     Page.getWindowProperties / Element.dispatchEvent。
//     因此 automator 的元素级 API（page.$ / element.tap）**在本机不可用**，
//     无法模拟物理点击 —— T2 段只能记为 SKIP，不能算 FAIL。
//   - 逻辑层也拿不到组件实例：page.selectComponent('toy-card') → null；
//     page.selectAllComponents('toy-card' | '.tcard' | 'view') → 全部长度 0。
//     （连 'view' 都是 0，说明是运行时能力缺失，不是选择器写法问题。）
//   - page.data() / page.callMethod() 同样挂死 → 只能走 mp.evaluate 读 getCurrentPages()。
//   - mp.evaluate 返回值序列化会丢嵌套数组 → 一律返回 JSON 字符串在 Node 侧 parse。
//   - mp.screenshot() 返回 base64 字符串（不是 Buffer），可直接落盘。
//   - mp.disconnect() 返回 undefined，不能 .catch()。
//
// 因此本脚本把「点击」拆成两条腿：
//   T2  物理点击      —— 环境支持则真点（本机 SKIP）
//   T2' 逻辑层注入 id —— 用第一个卡片的真实 id 驱动页面手势回调，验证页面侧拼 url 正确（必跑）
// 外加 T3：拿该 id 直连详情页，确认详情真的加载出玩具（这才是用户实际报障点）。
const automator = require('/Users/xiangxingguo/.workbuddy/binaries/node/workspace/node_modules/miniprogram-automator');
const fs = require('fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => {
  console.log('[未捕获异常，已忽略]', String((e && e.message) || e).slice(0, 200));
});

let PASS = 0, FAIL = 0, SKIP = 0;
const NOTES = [];
function check(desc, cond, extra) {
  if (cond) { PASS++; console.log('  PASS:', desc); }
  else { FAIL++; console.log('  FAIL:', desc, extra !== undefined ? '=> ' + JSON.stringify(extra).slice(0, 400) : ''); }
}
function skip(desc, why) { SKIP++; console.log('  SKIP:', desc, '— ' + why); }

const withTimeout = (p, ms, tag) => {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error('超时 ' + ms + 'ms: ' + tag)), ms); }),
  ]).finally(() => clearTimeout(t));
};

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  console.log('已连接开发者工具自动化端口\n');

  const ev = async (fn, ...args) => {
    let t;
    const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('evaluate 超时')), 40000); });
    try { return await Promise.race([mp.evaluate(fn, ...args), to]); } finally { clearTimeout(t); }
  };
  const probe = async (fn, ...args) => {
    const raw = await ev(fn, ...args);
    if (typeof raw !== 'string') return { __err: 'probe 未返回字符串: ' + JSON.stringify(raw).slice(0, 200) };
    try { return JSON.parse(raw); } catch (e) { return { __err: String(e.message || e), __raw: raw.slice(0, 300) }; }
  };

  // ---------- 0. 切到发现页 ----------
  console.log('===== 0. 进入发现页 =====');
  await ev(function () {
    return new Promise((resolve) => {
      wx.switchTab({ url: '/pages/discover/discover', complete: () => resolve('ok') });
    });
  });
  await sleep(3000);

  // ---------- T1. 结构层 ----------
  console.log('\n===== T1. 发现页渲染结构 =====');
  const t1 = await probe(function () {
    // 只在首次调用时装一次劫持：记录所有 navigateTo 的目标 url
    if (!wx.__navUrls) {
      wx.__navUrls = [];
      const orig = wx.navigateTo;
      wx.navigateTo = function (opt) {
        try { wx.__navUrls.push(opt && opt.url); } catch (e) { /* 忽略 */ }
        return orig.call(wx, opt);
      };
    }
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    const left = p.data.leftCol || [];
    const right = p.data.rightCol || [];
    return JSON.stringify({
      route: p.route,
      left: left.length,
      right: right.length,
      total: p.data.total,
      loading: p.data.loading,
      firstId: (left[0] && left[0].id) || (right[0] && right[0].id) || null,
      firstWanted: left[0] ? !!left[0].wanted : null,
    });
  });
  if (t1.__err) { console.log('  探针异常:', t1.__err); }
  else {
    console.log('  当前页面:', t1.route, '| 卡片 left/right =', t1.left + '/' + t1.right, '| total =', t1.total);
    check('当前停留在发现页', t1.route === 'pages/discover/discover', t1.route);
    check('双列都有卡片', t1.left > 0 && t1.right > 0, { left: t1.left, right: t1.right });
    check('首件玩具有 id 可供点击', !!t1.firstId, t1.firstId);
    check('首件玩具带 wanted 标记（契约字段齐全）', typeof t1.firstWanted === 'boolean', t1.firstWanted);
  }

  // 发现页渲染存证：改事件名后卡片本身不该受影响
  try {
    const shot = await withTimeout(mp.screenshot(), 20000, 'screenshot');
    const buf = Buffer.from(String(shot).replace(/^data:image\/\w+;base64,/, ''), 'base64');
    fs.writeFileSync('/tmp/discover-before-tap.png', buf);
    console.log('  发现页截图已保存: /tmp/discover-before-tap.png (' + buf.length + ' bytes)');
  } catch (e) {
    console.log('  发现页截图失败:', String((e && e.message) || e).slice(0, 120));
  }

  // ---------- T2. 物理点击（环境受限时 SKIP）----------
  console.log('\n===== T2. 物理点击卡片 → 抓跳转 url =====');
  let tapMode = '';
  try {
    const page = await withTimeout(mp.currentPage(), 8000, 'currentPage');
    const card = await withTimeout(page.$('.tcard'), 8000, 'page.$(".tcard")');
    if (!card) {
      tapMode = 'null';
      NOTES.push('元素级 tap: page.$(".tcard") 返回 null');
    } else {
      await withTimeout(card.tap(), 8000, 'card.tap()');
      tapMode = 'ok';
      NOTES.push('元素级 tap: 真实点击成功');
      await sleep(1200);
    }
  } catch (e) {
    tapMode = 'hang';
    NOTES.push('元素级 tap: view 层协议不可用（' + String((e && e.message) || e).slice(0, 80) + '）');
  }
  console.log('  点击方式:', tapMode);

  const navs = await probe(function () { return JSON.stringify({ urls: wx.__navUrls || [] }); });
  const urls = (navs && navs.urls) || [];

  if (tapMode === 'ok') {
    console.log('  劫持到的跳转:', JSON.stringify(urls));
    check('点击卡片产生了跳转', urls.length >= 1, urls);
    check('跳转目标是详情页', String(urls[0]).indexOf('/packageToy/detail/detail') === 0, urls[0]);
    check('跳转 url 带上了真实 id（不是 undefined）',
      /id=[0-9a-f]{16,}/.test(String(urls[0])) && String(urls[0]).indexOf('id=undefined') < 0, urls[0]);
  } else {
    skip('点击卡片产生了跳转', '本机 view 层协议不可用，无法模拟物理点击；改由 T2\' 覆盖');
  }

  // ---------- T2'. 逻辑层兜底：用真实 id 驱动页面手势回调 ----------
  console.log('\n===== T2\'. 用真实 id 驱动页面 onToyTap =====');
  if (!t1.firstId) {
    check('拿到可用于验证的玩具 id', false, 'T1 未取到 firstId');
  } else {
    const r = await probe(function (id) {
      const pages = getCurrentPages();
      const p = pages[pages.length - 1];
      // 模拟组件 triggerEvent('open', { id }) 后，页面 bind:open 收到的自定义事件
      p.onToyTap({ type: 'open', currentTarget: { dataset: {} }, detail: { id } });
      return JSON.stringify({ urls: wx.__navUrls || [] });
    }, t1.firstId);
    const u = ((r && r.urls) || [])[0] || '';
    console.log('  跳转:', u);
    check('页面 onToyTap 用真实 id 拼出合法跳转 url',
      /id=[0-9a-f]{16,}/.test(u) && u.indexOf('id=undefined') < 0, u);
    await sleep(1500);
  }

  // ---------- T3. 下游层：详情页真的加载出玩具 ----------
  console.log('\n===== T3. 详情页加载（用户实际报障点）=====');
  const realId = t1.firstId;
  if (!realId) {
    check('拿到可用于详情页验证的玩具 id', false, 'T1 未取到 firstId');
  } else {
    await ev(function () { wx.__navUrls = []; return 'ok'; });
    await ev(function (id) {
      return new Promise((resolve) => {
        wx.navigateTo({ url: '/packageToy/detail/detail?id=' + id, complete: () => resolve('ok') });
      });
    }, realId);
    // 轮询等详情加载完，别用固定 sleep：IDE 可能在文件改动后热重载页面，
    // 固定等待容易恰好在请求飞行中采样，拿到 loading=true 的中间态。
    const waitLoaded = async (maxMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        const s = await probe(function () {
          const pages = getCurrentPages();
          const p = pages[pages.length - 1];
          return JSON.stringify({ route: p.route, loading: p.data.loading, hasToy: !!(p.data.toy && p.data.toy.id) });
        });
        if (s && s.route === 'packageToy/detail/detail' && s.loading === false && s.hasToy) return true;
        await sleep(500);
      }
      return false;
    };
    const loaded = await waitLoaded(20000);
    if (!loaded) console.log('  [警告] 等待详情加载超时（20s），以下断言可能采到中间态');
    await sleep(400);

    const t3 = await probe(function () {
      const pages = getCurrentPages();
      const p = pages[pages.length - 1];
      const t = p.data.toy || {};
      return JSON.stringify({
        route: p.route,
        toyId: t.id || null,
        title: t.title || null,
        loading: p.data.loading,
        categoryLabel: t.categoryLabel || null,
        dateLabel: t.dateLabel || null,
        metaLine: p.data.metaLine || null,
        creditLine: p.data.creditLine || null,
        conditionLabel: p.data.conditionLabel || null,
        ownerName: (t.owner && t.owner.name) || null,
      });
    });
    if (t3.__err) { console.log('  探针异常:', t3.__err); }
    else {
      console.log('  详情页:', t3.route, '| toyId:', t3.toyId, '| 标题:', t3.title);
      console.log('  元信息行:', JSON.stringify(t3.metaLine));
      console.log('  成色:', t3.conditionLabel, '| 信用行:', t3.creditLine, '| 日期:', t3.dateLabel, '| 主人:', t3.ownerName);
      check('已进入详情页', t3.route === 'packageToy/detail/detail', t3.route);
      check('详情加载完成（loading=false）', t3.loading === false, t3.loading);
      check('详情拿到了玩具数据（用户报的「玩具不存在」未复现）', t3.toyId === realId, { got: t3.toyId, want: realId });
      check('标题已渲染', !!t3.title, t3.title);
      check('品类中文已渲染', !!t3.categoryLabel, t3.categoryLabel);
      check('日期已格式化（不是 Wed Oct 08 这种）',
        !/^[A-Z][a-z]{2} /.test(String(t3.dateLabel)) && /^\d{4}-\d{2}-\d{2}/.test(String(t3.dateLabel)), t3.dateLabel);
      // WXML 会把 null 渲染成字面量「null」，元信息行必须已在 JS 侧滤空
      check('元信息行不含字面量 null', !!t3.metaLine && t3.metaLine.indexOf('null') < 0, t3.metaLine);
      check('元信息行不含悬空分隔符（· 开头/结尾、连续 ·）',
        !/^·|·$|·\s*·/.test(String(t3.metaLine)), t3.metaLine);
      check('信用行不含字面量 null', String(t3.creditLine || '').indexOf('null') < 0, t3.creditLine);
    }

    // 截图存证：本环境 mp.screenshot() 返回 base64 字符串
    try {
      const shot = await withTimeout(mp.screenshot(), 20000, 'screenshot');
      const buf = Buffer.from(String(shot).replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const out = '/tmp/detail-open-shot.png';
      fs.writeFileSync(out, buf);
      console.log('  截图已保存:', out, '(' + buf.length + ' bytes)');
    } catch (e) {
      console.log('  截图失败:', String((e && e.message) || e).slice(0, 120));
    }
  }

  // ---------- T4. 自有玩具：兑换/交换按钮必有反馈（2026-10-10 用户报障点）----------
  // 报障原文：「点击用积分兑换，点击没反应」。
  // 根因：onRedeemTap 在 shippingPreview 为 null（预览接口失败/加载中）时静默 return，
  // 而自有玩具必然预览失败（服务端 400「不能兑换自己发布的玩具」）→ 点了零反馈。
  // 修复后：自有玩具不显示这两个注定失败的按钮，且任何失败分支都必有 toast。
  // 这里不写死玩具 id，改为按服务端下发的 isMine 在列表里现找。
  console.log('\n===== T4. 自有玩具的兑换/交换必有反馈 =====');
  await ev(function () {
    return new Promise((resolve) => {
      wx.switchTab({ url: '/pages/discover/discover', complete: () => resolve('ok') });
    });
  });
  await sleep(2500);

  const kinds = await probe(function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    if (p.route !== 'pages/discover/discover') return JSON.stringify({ __err: '当前不在发现页: ' + p.route });
    const all = (p.data.leftCol || []).concat(p.data.rightCol || []);
    return JSON.stringify({
      total: all.length,
      typed: all.filter((t) => typeof t.isMine === 'boolean').length,
      mine: all.filter((t) => t.isMine === true).map((t) => ({ id: t.id, title: t.title })),
      others: all.filter((t) => t.isMine !== true).length,
    });
  });
  if (kinds.__err) {
    console.log('  探针异常:', kinds.__err);
    check('发现页列表可读取', false, kinds.__err);
  } else {
    console.log('  列表 ' + kinds.total + ' 件 | isMine 类型正确 ' + kinds.typed + ' 件 | 自有 ' +
      kinds.mine.length + ' 件 | 他人 ' + kinds.others + ' 件');
    check('toy.list 下发了 isMine 字段（服务端契约）', kinds.typed === kinds.total && kinds.total > 0, kinds);
    if (!kinds.mine.length) {
      skip('自有玩具点击兑换必有反馈', '当前列表里没有自己发布的玩具（数据相关，非缺陷）');
    } else {
      const mineId = kinds.mine[0].id;
      console.log('  用自有玩具做验证:', kinds.mine[0].title, '(' + mineId + ')');
      await ev(function (id) {
        return new Promise((r) => {
          wx.navigateTo({ url: '/packageToy/detail/detail?id=' + id, complete: () => r('ok') });
        });
      }, mineId);
      // 轮询等加载完成（别用固定 sleep：IDE 会在文件改动后热重载）
      const t0 = Date.now();
      let st = null;
      while (Date.now() - t0 < 20000) {
        st = await probe(function () {
          const p = getCurrentPages()[getCurrentPages().length - 1];
          return JSON.stringify({
            route: p.route, loading: p.data.loading,
            hasToy: !!(p.data.toy && p.data.toy.id),
            isMine: p.data.isMine, redeeming: p.data.redeeming,
          });
        });
        if (st && st.route === 'packageToy/detail/detail' && st.loading === false && st.hasToy) break;
        await sleep(500);
      }
      console.log('  自有玩具详情页 isMine =', st && st.isMine);
      check('自有玩具详情页 isMine === true', st && st.isMine === true, st);

      // 核心断言：调 onRedeemTap 必须产生可见反馈（劫持 wx.showToast 记录后还原）
      const fb = await probe(function () {
        const p = getCurrentPages()[getCurrentPages().length - 1];
        const toasts = [];
        const modals = [];
        const origToast = wx.showToast;
        const origModal = wx.showModal;
        wx.showToast = function (o) { toasts.push(o && o.title); };
        wx.showModal = function (o) { modals.push(o && o.title); };
        try {
          p.onRedeemTap();
        } catch (e) {
          toasts.push('__throw:' + String((e && e.message) || e));
        }
        wx.showToast = origToast;
        wx.showModal = origModal;
        return JSON.stringify({ toasts, modals, restored: wx.showToast === origToast });
      });
      console.log('  onRedeemTap 反馈:', JSON.stringify(fb));
      check('点击兑换产生了可见反馈（toast 或 modal 至少一个）',
        !!fb && (fb.toasts.length + fb.modals.length) >= 1, fb);
      check('反馈文案点明了「发布的玩具」这一原因',
        !!fb && fb.toasts.some((t) => /发布的玩具/.test(String(t))), fb && fb.toasts);
      check('劫持已还原（未污染页面后续行为）', !!fb && fb.restored === true, fb);
      check('自有玩具不该弹确认兑换弹窗', !!fb && fb.modals.length === 0, fb && fb.modals);

      // 截图存证：底部应是说明条而不是两个按钮
      try {
        const shot = await withTimeout(mp.screenshot(), 20000, 'screenshot');
        const buf = Buffer.from(String(shot).replace(/^data:image\/\w+;base64,/, ''), 'base64');
        fs.writeFileSync('/tmp/own-toy-detail-verify.png', buf);
        console.log('  自有玩具详情页截图:', '/tmp/own-toy-detail-verify.png', '(' + buf.length + ' bytes)');
      } catch (e) {
        console.log('  截图失败:', String((e && e.message) || e).slice(0, 120));
      }
    }
  }

  console.log('\n========================================');
  console.log(`结果: PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}`);
  if (NOTES.length) console.log('备注: ' + NOTES.join(' | '));
  console.log('========================================');

  try { await mp.disconnect(); } catch (e) { /* 返回 undefined */ }
  process.exit(FAIL ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', (e && e.stack) || e);
  process.exit(2);
});
