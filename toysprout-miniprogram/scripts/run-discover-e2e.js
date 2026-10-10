// scripts/run-discover-e2e.js
// 发现页「真机链路」验证（62 条断言）。与 run-integration-test.js 的区别：
//   - run-integration-test.js：纯 Node + mock SDK，离线跑云函数业务逻辑，可进 CI；
//   - 本脚本：连着微信开发者工具的自动化端口，打**真实云函数 + 真实云数据库**，
//     并把结果写回真实运行中的页面实例（getCurrentPages()），验证前后端契约。
//
// 运行前置：
//   1) 微信开发者工具已打开本项目、已登录、服务端口已开；
//   2) /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
//        --project <项目绝对路径> --auto-port 9420
//      （成功会打印 "IDE server has started, listening on http://127.0.0.1:<port>"）
//   3) 数据库里已有演示数据（见 小程序项目档案.md「演示数据」一节）
// 然后： node scripts/run-discover-e2e.js
//
// 【为什么本套件的「数量类」断言必须从实时数据推导，而不是写死常量】
//   套件打的是真实云数据库，数据会随用户使用不断变化（发布 / 下架 / 兑换 / 人工造数……），
//   而「期望数量」一旦写死成常量，只要数据发生漂移（哪怕业务代码完全正确），断言就会整片
//   误报。本项目已经因此误报过 2 次——把数据漂移当成代码回归去排查，白白消耗可信度，
//   久而久之红点就没人看了。⇒ 因此约定：
//     · 所有「条数 / 页数 / 分组计数」类断言，一律从早期拉取的参考快照
//       （toy.list limit=100，见「0. 页面与身份」区）实时推导预期值；
//     · 参考快照本身也用一条闸门断言保真，避免推导源头就错；
//     · 判别力不靠常量，而靠「实时真相 vs 页面表现」的一致性 + 字段类型合法性。
//
// 已知环境限制（踩坑记录，勿反复试探）：
//   - page.data() / page.$() / page.$$() / page.callMethod() 在本 IDE 版本全部挂死，
//     只能走 mp.evaluate；组件实例也拿不到（selectAllComponents 连 'view' 都返回空），
//     组件手势逻辑改由 scripts/check-toy-card.js 在 Node 侧驱动源码验证；
//   - mp.evaluate 返回值序列化会丢嵌套数组 → 一律返回 JSON 字符串在 Node 侧 parse；
//   - require 路径要写成相对 miniprogram 根的形式（require('utils/masonry')），
//     写 '../../utils/x' 会报 module is not defined；
//   - mp.screenshot() 返回的是 base64 字符串（不是 Buffer），可直接落盘；
//   - mp.disconnect() 返回 undefined，不能 .catch()。
// /tmp/mp-verify-discover.js
// 真机链路验证：小红书式发现页（双列瀑布流 + 想要 + 筛选）。
//
// 背景约束（automator@0.12.1 + IDE 2.01.2510290）：
//   page.data() / page.$() / page.$$() / page.callMethod() 全部挂死 → 只能走 mp.evaluate；
//   evaluate 返回值序列化会丢嵌套数组 → 一律返回 JSON 字符串在 Node 侧 parse；
//   mp.disconnect() 返回 undefined → 不能 .catch()。
// 所有探针都写在"逻辑层真函数"里（不用 new Function/eval），靠 getCurrentPages() 拿页面实例。
const automator = require('/Users/xiangxingguo/.workbuddy/binaries/node/workspace/node_modules/miniprogram-automator');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => {
  console.log('[未捕获异常，已忽略]', String((e && e.message) || e).slice(0, 300));
});

let PASS = 0, FAIL = 0;
function check(desc, cond, extra) {
  if (cond) { PASS++; console.log('  PASS:', desc); }
  else { FAIL++; console.log('  FAIL:', desc, extra !== undefined ? '=> ' + JSON.stringify(extra).slice(0, 400) : ''); }
}

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  console.log('已连接开发者工具自动化端口\n');

  const ev = async (fn, ...args) => {
    let t;
    const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('evaluate 超时')), 40000); });
    try { return await Promise.race([mp.evaluate(fn, ...args), to]); } finally { clearTimeout(t); }
  };
  // 探针统一返回 JSON 字符串，这里解析；探针内部抛错会被包成 __err 抛出来
  const probe = async (fn, ...args) => {
    const raw = await ev(fn, ...args);
    if (typeof raw !== 'string') return { __err: 'probe 未返回字符串，实际: ' + JSON.stringify(raw).slice(0, 200), __raw: raw };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__err) throw new Error(parsed.__err);
      return parsed;
    } catch (e) {
      if (String(e.message).indexOf('probe 未返回') === 0) throw e;
      return { __err: String(e.message || e), __raw: raw.slice(0, 300) };
    }
  };

  const cf = async (name, action, data) => {
    const raw = await ev(function (n, a, d) {
      return new Promise((resolve) => {
        wx.cloud.callFunction({
          name: n,
          data: Object.assign({ action: a }, d || {}),
          success: (res) => resolve(JSON.stringify({ ok: true, body: res.result })),
          fail: (err) => resolve(JSON.stringify({ ok: false, err: String((err && err.errMsg) || err) })),
        });
      });
    }, name, action, data);
    const parsed = JSON.parse(raw);
    return parsed.ok ? parsed.body : { code: -1, data: null, message: parsed.err };
  };

  // ============================================================
  // 归位：本套件全程假设「当前页 = 发现页」，但上一次运行（或人工操作）可能把
  // 页面留在详情页/其他页，此时 p.loadFirstPage 之类页面方法根本不存在。
  // 所以先显式切回发现页再开始断言，避免把"环境没归位"误判成业务缺陷。
  console.log('===== 前置：归位到发现页 =====');
  await ev(function () {
    return new Promise((resolve) => {
      wx.switchTab({ url: '/pages/discover/discover', complete: () => resolve('ok') });
    });
  });
  await sleep(2500);
  {
    const where = await probe(function () {
      const pages = getCurrentPages();
      const p = pages[pages.length - 1];
      return JSON.stringify({ path: p && p.route });
    });
    console.log('  归位后当前页:', where.path);
  }

  console.log('\n===== 0. 页面与身份 =====');
  const cur = await probe(function () {
    const app = getApp();
    const pages = getCurrentPages();
    const p = pages[pages.length - 1];
    return JSON.stringify({
      path: p && p.route,
      openid: (app.globalData.userInfo && app.globalData.userInfo.id) || null,
      user: app.globalData.userInfo || null,
    });
  });
  console.log('  当前页:', cur.path, '| openid:', cur.openid);
  check('停在发现页', cur.path === 'pages/discover/discover', cur.path);
  check('静默登录已拿到 openid', !!cur.openid, cur);
  check('开发者账号昵称非空（评论/发布闸门已过）', !!(cur.user && cur.user.name), cur.user && cur.user.name);

  // 预热：首次 callFunction 有冷启动，先打一发并确认云函数本身是通的
  const warm = await cf('toy', 'list', { page: 1, limit: 1 });
  console.log('  预热 toy.list:', warm.code, warm.message || '');
  check('toy.list 云函数可用（wants 集合已建、无 500）', warm.code === 0, warm);

  // ---- 参考快照：后续所有「数量类」断言的预期值都从这份实时数据推导，绝不再写死 ----
  // 用 toy.list limit=100 取全量（MVP 数据量远小于 100）。快照是否可信直接决定后面每一条
  // 推导断言的正确性，所以先单独闸门校验一次（total>0 且 items 恰好是全量）。
  const snapRes = await cf('toy', 'list', { page: 1, limit: 100 });
  const SNAP = (snapRes && snapRes.code === 0 && snapRes.data && Array.isArray(snapRes.data.items)) ? snapRes.data : null;
  const SNAP_ITEMS = SNAP ? SNAP.items : [];
  const SNAP_TOTAL = SNAP ? SNAP.total : 0;
  console.log('  参考快照: total=' + SNAP_TOTAL + ' items=' + SNAP_ITEMS.length);
  check('参考快照可用（toy.list limit=100：total>0 且 items 为全量）',
    !!SNAP && SNAP_TOTAL > 0 && SNAP_ITEMS.length === Math.min(100, SNAP_TOTAL),
    { total: SNAP_TOTAL, items: SNAP_ITEMS.length });

  // 复位到「无筛选第 1 页」。冷启动可能让某一次 loadFirstPage 静默失败并留下陈旧数据，
  // 所以这里对"装载结果"做闸门校验，不达标就重试（避免把冷启动误判成业务缺陷）。
  async function reloadAll() {
    for (let i = 0; i < 3; i++) {
      const st = await probe(async function () {
        const p = getCurrentPages()[getCurrentPages().length - 1];
        p.setData({ keyword: '', categoryFilter: '', conditionFilter: '', creditFilter: false, activeFilterCount: 0 });
        await p.loadFirstPage();
        return JSON.stringify({ total: p.data.total, items: p.data.items.length, hasMore: p.data.hasMore, page: p.data.page });
      });
      if (st.items > 0 && st.hasMore === false && st.page === 1) return st;
      console.log('  [重试] 首次装载未就绪:', JSON.stringify(st));
      await sleep(900);
    }
    return null;
  }
  const loaded = await reloadAll();
  check('首页装载成功（含冷启动重试后）', !!loaded, loaded);

  // ============================================================
  console.log('\n===== 1. 自定义导航几何（不扣胶囊就会压住搜索框）=====');
  const n = await probe(function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const menu = wx.getMenuButtonBoundingClientRect();
    return JSON.stringify({
      statusBarHeight: p.data.statusBarHeight,
      navBarHeight: p.data.navBarHeight,
      navRight: p.data.navRight,
      windowWidth: win.windowWidth,
      // 搜索框右内边距 = navRight → 搜索框右边界 = 窗口宽 − navRight
      searchRight: Math.round(win.windowWidth - p.data.navRight),
      menuLeft: Math.round(menu.left),
      menuHeight: Math.round(menu.height),
    });
  });
  console.log('  几何:', JSON.stringify(n));
  check('statusBarHeight 取到真实值', n.statusBarHeight > 0, n.statusBarHeight);
  check('navBarHeight ≥ 44（容得下胶囊）', n.navBarHeight >= 44, n.navBarHeight);
  check('搜索框右边界 ≤ 胶囊左边界（未被压住）', n.searchRight <= n.menuLeft, n);
  check('navRight 在合理区间 [80,140]', n.navRight >= 80 && n.navRight <= 140, n.navRight);

  // ============================================================
  console.log('\n===== 2. 首屏数据与双列分列 =====');
  const feed = await probe(function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const items = p.data.items;
    return JSON.stringify({
      loading: p.data.loading,
      total: p.data.total,
      hasMore: p.data.hasMore,
      page: p.data.page,
      items: items.length,
      left: p.data.leftCol.length,
      right: p.data.rightCol.length,
      noOwner: items.filter((t) => !(t.owner && t.owner.name)).length,
      noImage: items.filter((t) => !(t.images && t.images.length)).length,
      noPoints: items.filter((t) => !t.points).length,
      noAvatar: items.filter((t) => !(t.owner && t.owner.avatarUrl)).length,
      cities: Array.from(new Set(items.map((t) => t.city))),
      conditions: Array.from(new Set(items.map((t) => t.conditionLevel))),
      categories: Array.from(new Set(items.map((t) => t.category))),
      wantCounts: items.map((t) => t.wantCount),
      wantedFlags: items.filter((t) => t.wanted).length,
      titles: items.map((t) => t.title).slice(0, 3),
    });
  });
  console.log('  概览:', JSON.stringify({ total: feed.total, items: feed.items, left: feed.left, right: feed.right, hasMore: feed.hasMore }));
  console.log('  前 3 条:', JSON.stringify(feed.titles));
  check('total = ' + SNAP_TOTAL + '（与实时快照一致，可见数据全部计入）', feed.total === SNAP_TOTAL, feed.total);
  check('total > 0（发现页确实有可见数据）', feed.total > 0, feed.total);
  check('首屏把已加载的全部卡片都渲染出来（items === total）', feed.items === feed.total, feed);
  check('左右两列卡片数之和 = 全部卡片', feed.left + feed.right === feed.items, feed);
  check('两列数量差 ≤ 1（均衡）', Math.abs(feed.left - feed.right) <= 1, { left: feed.left, right: feed.right });
  check('无卡片缺少作者昵称', feed.noOwner === 0, feed.noOwner);
  check('无卡片缺少图片', feed.noImage === 0, feed.noImage);
  check('无卡片缺少积分', feed.noPoints === 0, feed.noPoints);
  check('全部作者都有头像（作者行不空）', feed.noAvatar === 0, feed.noAvatar);
  check('一页装完 → hasMore=false', feed.hasMore === false, feed.hasMore);
  check('品类覆盖 ≥ 4 种', feed.categories.length >= 4, feed.categories);
  // 成色档位：预期 = 实时快照里出现过的档位（不再写死 4 种）；同时校验每个档位都是
  // format.js CONDITION_META 里的已知枚举（new/9new/8new/used），出现脏档位仍会 FAIL。
  const KNOWN_CONDITIONS = ['new', '9new', '8new', 'used'];
  const expectConds = Array.from(new Set(SNAP_ITEMS.map((t) => t.conditionLevel)));
  check('成色覆盖 = 实时快照出现过的档位（' + expectConds.length + ' 种）', feed.conditions.length === expectConds.length, feed.conditions);
  const badConds = feed.conditions.filter((c) => KNOWN_CONDITIONS.indexOf(c) < 0);
  check('每个成色档位都是已知枚举（new/9new/8new/used）', badConds.length === 0, badConds);
  // 城市字段：合法值是「非空字符串」或「null」（用户没填城市）；唯独不能是字符串 'null'
  // —— 那是某处把 null 拼成字符串渲染的真实 bug。非字符串 / 空串同样视为异常。
  const badCities = feed.cities.filter((c) => {
    if (c === null || c === undefined) return false;
    if (typeof c !== 'string') return true;
    return c === 'null' || c.trim() === '';
  });
  check('城市字段合法（非空字符串或 null，且绝不为字符串 "null"）', badCities.length === 0, badCities);
  // 去重后的「非空城市」数 ≥ 3（null 不计入）。
  const realCities = feed.cities.filter((c) => typeof c === 'string' && c.trim() !== '' && c !== 'null');
  check('去重后非空城市数 ≥ 3', realCities.length >= 3, realCities);
  check('wantCount 至少 4 个不同值', new Set(feed.wantCounts).size >= 4, feed.wantCounts);
  console.log('  城市:', JSON.stringify(feed.cities), '| 成色:', JSON.stringify(feed.conditions));

  const ratios = await probe(function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const m = require('utils/masonry');
    const pads = p.data.items.map((t) => Math.round(m.cardRatio(t.id) * 100));
    const again = m.distributeColumns(p.data.items, 345).left.map((t) => t.id);
    const cur = p.data.leftCol.map((t) => t.id);
    // 两列总高（rpx），衡量瀑布流底部参差程度
    const h = (col) => col.reduce((s, t) => s + 345 * m.cardRatio(t.id) + m.CARD_TEXT_H, 0);
    return JSON.stringify({
      pads,
      distinct: Array.from(new Set(pads)),
      sameSplit: JSON.stringify(again) === JSON.stringify(cur),
      hLeft: Math.round(h(p.data.leftCol)),
      hRight: Math.round(h(p.data.rightCol)),
    });
  });
  check('封面比例至少 3 档（瀑布流确实错落）', ratios.distinct.length >= 3, ratios.distinct);
  check('比例不全为 100（不是等高列表）', !(ratios.distinct.length === 1 && ratios.distinct[0] === 100), ratios.distinct);
  check('实测分列 == 纯函数重算（无状态漂移）', ratios.sameSplit === true, ratios);
  console.log('  两列总高: left=' + ratios.hLeft + 'rpx right=' + ratios.hRight + 'rpx 差=' + Math.abs(ratios.hLeft - ratios.hRight) + 'rpx');

  // ============================================================
  console.log('\n===== 3. 分页拼接（走 applyItems 真实代码路径）=====');
  const paged = await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const r1 = await p.fetchPage(1);
    const r2 = await p.fetchPage(2);
    return JSON.stringify({
      n1: r1.items.length, n2: r2.items.length,
      hasMore1: r1.hasMore, hasMore2: r2.hasMore,
      total1: r1.total, total2: r2.total,
      limit: r1.limit, // 页面真实每页大小（fetchPage → 云函数回参），而不是另造的常量
    });
  });
  // 页大小直接取自页面真实返回值，保证与 discover.js 的 PAGE_SIZE 永远同步
  const PAGE_SIZE = paged.limit;
  check('页大小取自页面真实返回（PAGE_SIZE=' + PAGE_SIZE + '）', PAGE_SIZE > 0, paged);
  check('第 1 页返回 min(PAGE_SIZE, total) = ' + Math.min(PAGE_SIZE, SNAP_TOTAL) + ' 条',
    paged.n1 === Math.min(PAGE_SIZE, SNAP_TOTAL), paged);
  check('第 2 页返回 max(0, total - PAGE_SIZE) = ' + Math.max(0, SNAP_TOTAL - PAGE_SIZE) + ' 条（数据不足两页时为 0）',
    paged.n2 === Math.max(0, SNAP_TOTAL - PAGE_SIZE), paged);
  check('第 1 页 hasMore=false', paged.hasMore1 === false, paged);

  const appended = await probe(function (baseTotal) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const first = p.data.items;
    // 造 3 条"下一页"数据，走真实的 append 分支（replace=false）
    const extra = first.slice(0, 3).map((t) => Object.assign({}, t, { id: t.id + '__extra' }));
    const metaTotal = first.length + extra.length; // 追加后的服务端 total = 原条数 + 本次新增
    p.applyItems(extra, { total: metaTotal, hasMore: true }, 2, false);
    const after = p.data.items;
    const onLeft = p.data.leftCol.filter((t) => String(t.id).indexOf('__extra') >= 0).length;
    const onRight = p.data.rightCol.filter((t) => String(t.id).indexOf('__extra') >= 0).length;
    const keptPrefix = p.data.leftCol.slice(0, 2).map((t) => t.id);
    const newTotal = p.data.total;
    // 还原现场（total 用调用方传入的实时总数，不再写死）
    p.setData({ items: first, total: baseTotal, hasMore: false, page: 1 });
    p.setData(p.buildColumns(first));
    return JSON.stringify({ before: first.length, added: extra.length, after: after.length, newTotal, onLeft, onRight, keptPrefix });
  }, SNAP_TOTAL);
  check('append 后 items = before + 本次新增（' + appended.before + ' + ' + appended.added + '）',
    appended.after === appended.before + appended.added, appended);
  check('本次新增卡片全部落在列尾部（不重排已有卡片）', appended.onLeft + appended.onRight === appended.added, appended);
  check('append 后 total 跟随服务端（= before + 本次新增）', appended.newTotal === appended.before + appended.added, appended);

  // ============================================================
  console.log('\n===== 4. 筛选：品类 / 成色 / 信用 / 关键词 / 空态 =====');
  const byCat = await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    p.setData({ categoryFilter: 'building_blocks' });
    await p.loadFirstPage();
    return JSON.stringify({ total: p.data.total, cats: Array.from(new Set(p.data.items.map((t) => t.category))) });
  });
  const expectBlocks = SNAP_ITEMS.filter((t) => t.category === 'building_blocks').length;
  check('品类=积木拼搭 → ' + expectBlocks + ' 件（实时快照中同品类条数）', byCat.total === expectBlocks, byCat);
  check('结果品类纯净', byCat.cats.length === 1 && byCat.cats[0] === 'building_blocks', byCat.cats);

  const byCond = await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    p.setData({ categoryFilter: '', conditionFilter: '9new' });
    await p.loadFirstPage();
    return JSON.stringify({ total: p.data.total, conds: p.data.items.map((t) => t.conditionLevel) });
  });
  const expect9new = SNAP_ITEMS.filter((t) => t.conditionLevel === '9new').length;
  check('成色=9成新 → ' + expect9new + ' 件（实时快照中同成色条数）', byCond.total === expect9new, byCond);
  check('返回结果成色全部 = 9new', byCond.conds.length > 0 && byCond.conds.every((c) => c === '9new'), byCond.conds);

  const byCredit = await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    p.setData({ conditionFilter: '', creditFilter: true });
    await p.loadFirstPage();
    return JSON.stringify({ total: p.data.total, scores: p.data.items.map((t) => t.owner.creditScore) });
  });
  const expectCredit = SNAP_ITEMS.filter((t) => t.owner && t.owner.creditScore >= 800).length;
  check('信用筛选 → ' + expectCredit + ' 件（实时快照中作者信用 ≥800 的条数）', byCredit.total === expectCredit, byCredit);
  check('信用筛选结果全部 ≥800', byCredit.scores.every((s) => s >= 800), byCredit.scores);

  const byKw = await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    p.setData({ creditFilter: false, keyword: '乐高' });
    await p.loadFirstPage();
    return JSON.stringify({ total: p.data.total, titles: p.data.items.map((t) => t.title) });
  });
  const expectKw = SNAP_ITEMS.filter((t) => String(t.title || '').indexOf('乐高') >= 0).length;
  check('关键词=乐高 → ' + expectKw + ' 件（实时快照中含「乐高」的条数）', byKw.total === expectKw, byKw);
  check('返回的每条标题都包含「乐高」', byKw.titles.every((t) => String(t).indexOf('乐高') >= 0), byKw.titles);

  const byEmpty = await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    p.setData({ keyword: '不存在的玩具zzz' });
    await p.loadFirstPage();
    return JSON.stringify({ total: p.data.total, items: p.data.items.length, left: p.data.leftCol.length, right: p.data.rightCol.length, hasMore: p.data.hasMore, loading: p.data.loading });
  });
  check('无结果时 total=0', byEmpty.total === 0, byEmpty);
  check('无结果时两列都清空（不留旧卡片）', byEmpty.items === 0 && byEmpty.left === 0 && byEmpty.right === 0, byEmpty);
  check('无结果时 hasMore=false', byEmpty.hasMore === false, byEmpty);

  await probe(async function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    p.setData({ keyword: '', categoryFilter: '', conditionFilter: '', creditFilter: false, activeFilterCount: 0 });
    await p.loadFirstPage();
    return JSON.stringify({ total: p.data.total });
  });

  // ============================================================
  console.log('\n===== 5. 想要：真实双击手势链路（组件 → 页面 → 云函数）=====');
  const target = await probe(function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const t = p.data.items.filter((x) => x.wantCount === 47)[0] || p.data.items[0];
    return JSON.stringify({ id: t.id, title: t.title, wantCount: t.wantCount, wanted: !!t.wanted });
  });
  console.log('  目标卡片:', JSON.stringify(target));
  // 初始是否已想要取决于上一轮验证的残留，不作为断言；下一段会显式复位到干净基线

  // ⚠️ 组件实例在本 IDE 版本下拿不到：page.selectComponent/selectAllComponents 对任何选择器
  // 都返回空（实测连 'view' 都取不到）。组件级手势逻辑改用 Node 侧直接驱动组件源码验证
  // （见 scripts/check-toy-card.js）。这里只验证「页面状态机 → 云函数 → 落库」这段真实链路。

  // 起点复位：若该卡片已被想要，先取消，保证 baseCount 是干净基线
  const clean = await probe(async function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    let t = p.data.items.filter((x) => x.id === id)[0];
    if (t && t.wanted) {
      await p.onWant({ detail: { id: id, wanted: false } });
      await new Promise((r) => setTimeout(r, 700));
      t = p.data.items.filter((x) => x.id === id)[0];
    }
    return JSON.stringify({ wantCount: t.wantCount, wanted: !!t.wanted, colCount: p.data.leftCol.length + p.data.rightCol.length });
  }, target.id);
  console.log('  起点状态:', JSON.stringify(clean));
  check('起点已复位为「未想要」', clean.wanted === false, clean);
  const baseCount = clean.wantCount;

  // 模拟 toy-card 通过 bind:want 抛上来的事件
  await probe(async function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    await p.onWant({ detail: { id: id, wanted: true } });
    return JSON.stringify({ ok: true });
  }, target.id);
  await sleep(900);

  const afterWant = await probe(function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const t = p.data.items.filter((x) => x.id === id)[0];
    return JSON.stringify({ wantCount: t.wantCount, wanted: !!t.wanted, left: p.data.leftCol.length, right: p.data.rightCol.length });
  }, target.id);
  console.log('  想要后本地:', JSON.stringify(afterWant));
  check('想要后 wanted=true', afterWant.wanted === true, afterWant);
  check('想要后 wantCount = ' + (baseCount + 1) + '（乐观更新与服务端一致）', afterWant.wantCount === baseCount + 1, afterWant);
  check('想要后卡片未换列（总列数 = 操作前 ' + clean.colCount + '）', afterWant.left + afterWant.right === clean.colCount, afterWant);

  const srvWant = await cf('toy', 'detail', { id: target.id });
  check('服务端 wantCount 落库为 ' + (baseCount + 1), srvWant.code === 0 && srvWant.data.wantCount === baseCount + 1, srvWant.data && srvWant.data.wantCount);
  check('服务端 wanted=true（wants 集合已写入）', srvWant.code === 0 && srvWant.data.wanted === true, srvWant.data && srvWant.data.wanted);

  console.log('\n===== 6. 再点一次取消（幂等回落）=====');
  await probe(async function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    await p.onWant({ detail: { id: id, wanted: false } });
    return JSON.stringify({ ok: true });
  }, target.id);
  await sleep(900);
  const afterUnwant = await probe(function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const t = p.data.items.filter((x) => x.id === id)[0];
    return JSON.stringify({ wantCount: t.wantCount, wanted: !!t.wanted });
  }, target.id);
  const srvUnwant = await cf('toy', 'detail', { id: target.id });
  console.log('  取消后 本地:', JSON.stringify(afterUnwant), '服务端:', JSON.stringify({ wantCount: srvUnwant.data && srvUnwant.data.wantCount, wanted: srvUnwant.data && srvUnwant.data.wanted }));
  check('取消后 wanted=false', afterUnwant.wanted === false, afterUnwant);
  check('取消后本地 wantCount 回落 ' + baseCount, afterUnwant.wantCount === baseCount, afterUnwant);
  check('服务端 wantCount 回落 ' + baseCount, srvUnwant.data.wantCount === baseCount, srvUnwant.data.wantCount);
  check('服务端 wanted=false（wants 记录已删）', srvUnwant.data.wanted === false, srvUnwant.data.wanted);

  console.log('\n===== 7. 云函数失败时必须回滚乐观更新 =====');
  const rollback = await probe(async function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const beforeColCount = p.data.leftCol.length + p.data.rightCol.length; // 故障注入前的卡片总数
    const before = p.data.items.filter((x) => x.id === id)[0];
    const snap = { wanted: !!before.wanted, wantCount: before.wantCount };
    // 劫持一次 callFunction 让它失败，模拟断网 / 云函数报错
    const orig = wx.cloud.callFunction;
    wx.cloud.callFunction = function (opt) {
      setTimeout(function () { opt.fail && opt.fail({ errMsg: 'mock network fail' }); }, 30);
    };
    try {
      await p.onWant({ detail: { id: id, wanted: !snap.wanted } });
    } finally {
      wx.cloud.callFunction = orig;
    }
    const after = p.data.items.filter((x) => x.id === id)[0];
    return JSON.stringify({
      snap: snap,
      after: { wanted: !!after.wanted, wantCount: after.wantCount },
      colCount: p.data.leftCol.length + p.data.rightCol.length,
      beforeColCount: beforeColCount,
    });
  }, target.id);
  console.log('  回滚结果:', JSON.stringify(rollback));
  check('云函数失败后 wanted 回滚到原值', rollback.after.wanted === rollback.snap.wanted, rollback);
  check('云函数失败后 wantCount 回滚到原值', rollback.after.wantCount === rollback.snap.wantCount, rollback);
  check('回滚后卡片仍在列表中（未丢卡）', rollback.colCount === rollback.beforeColCount, rollback);

  console.log('\n===== 8. 分列稳定性：改动一张卡片不引起重排 =====');
  const stable = await probe(function (id) {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const before = { l: p.data.leftCol.map((t) => t.id), r: p.data.rightCol.map((t) => t.id) };
    const origCount = p.data.items.filter((t) => t.id === id)[0].wantCount;
    const prev = p.patchItem(id, { wantCount: 999 });
    const after = { l: p.data.leftCol.map((t) => t.id), r: p.data.rightCol.map((t) => t.id) };
    p.patchItem(id, { wantCount: origCount });
    return JSON.stringify({
      sameLeft: JSON.stringify(before.l) === JSON.stringify(after.l),
      sameRight: JSON.stringify(before.r) === JSON.stringify(after.r),
      prevReturned: !!prev && prev.wantCount === origCount,
      prevShape: prev,
    });
  }, target.id);
  check('patchItem 后左列顺序完全不变', stable.sameLeft === true, stable);
  check('patchItem 后右列顺序完全不变', stable.sameRight === true, stable);
  check('patchItem 返回旧值（供失败回滚）', stable.prevReturned === true, stable);

  console.log('\n===== 9. 图片 URL 可访问性 =====');
  const urls = await probe(function () {
    const p = getCurrentPages()[getCurrentPages().length - 1];
    const all = [];
    p.data.items.forEach((t) => (t.images || []).forEach((u) => all.push(u)));
    return JSON.stringify({
      total: all.length,
      https: all.filter((u) => /^https:\/\//.test(u)).length,
      uniqHosts: Array.from(new Set(all.map((u) => String(u).split('/')[2]))),
      allThree: p.data.items.every((t) => (t.images || []).length >= 3),
    });
  });
  console.log('  图片:', JSON.stringify(urls));
  check('全部图片都是 https 外链', urls.https === urls.total, urls);
  check('每件玩具 ≥ 3 张图（详情页轮播有内容）', urls.allThree === true, urls);
  // 允许的图片域名集合：演示数据走 picsum.photos；用户上传走云存储（*.tcb.qcloud.la）。
  // 不写死具体子域（用通配），但任何集合外的新域名都判 FAIL —— 防止悄悄引入未加白名单的来源。
  const allowedImgHost = (h) => h === 'picsum.photos' || /(^|\.)tcb\.qcloud\.la$/.test(String(h));
  const badImgHosts = urls.uniqHosts.filter((h) => !allowedImgHost(h));
  check('图片域名都在允许集合内（*.tcb.qcloud.la / picsum.photos）', badImgHosts.length === 0, badImgHosts);

  console.log('\n===== 10. 我的页兜底（发现页依赖的公共链路）=====');
  const tabOk = await ev(function () {
    return new Promise((resolve) => {
      wx.switchTab({ url: '/pages/mine/mine', complete: () => resolve('ok') });
    });
  });
  await sleep(1500);
  const minePath = await ev(function () { const ps = getCurrentPages(); return ps[ps.length - 1].route; });
  check('可切到「我的」页（tabBar 未坏）', minePath === 'pages/mine/mine', { tabOk, minePath });
  await ev(function () { return new Promise((r) => wx.switchTab({ url: '/pages/discover/discover', complete: () => r('ok') })); });
  await sleep(1200);
  const backPath = await ev(function () { const ps = getCurrentPages(); return ps[ps.length - 1].route; });
  check('可切回发现页', backPath === 'pages/discover/discover', backPath);

  console.log('\n========================================');
  console.log(`结果: PASS=${PASS} FAIL=${FAIL}`);
  console.log('========================================');

  try { await mp.disconnect(); } catch (e) { /* 该版本 disconnect 返回 undefined */ }
  process.exit(FAIL ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', (e && e.stack) || e);
  process.exit(2);
});
