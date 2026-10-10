#!/usr/bin/env node
// scripts/check-toy-card.js
// 瀑布流卡片组件（components/toy-card）的行为测试。
//
// 为什么需要它：本机 IDE 版本下 page.selectComponent/selectAllComponents 对任何选择器
// 都返回空（连 'view' 都取不到），automator 拿不到组件实例，双击/爆裂/降级这些
// 组件内部行为没法在真机链路上验证。这里用 Node 直接加载组件源码，把 Component()
// 的定义捕获下来，手工构造一个最小 ctx（data/setData/triggerEvent）驱动真实方法体。
// 断言的是 src 里真正会跑的那段代码，而不是复制一份逻辑。
'use strict';

const path = require('path');

// ---------- 最小运行环境 ----------
let DEF = null;
global.Component = function (def) { DEF = def; };
global.wx = {
  // 组件里用 wx.nextTick 复位 burst，Node 侧用 setTimeout 0 等价模拟
  nextTick: (fn) => setTimeout(fn, 0),
};

const COMPONENT_PATH = path.join(__dirname, '..', 'miniprogram', 'components', 'toy-card', 'toy-card.js');
require(COMPONENT_PATH);

let PASS = 0, FAIL = 0;
function check(desc, cond, extra) {
  if (cond) { PASS++; console.log('  PASS:', desc); }
  else { FAIL++; console.log('  FAIL:', desc, extra !== undefined ? '=> ' + JSON.stringify(extra) : ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 组件实例harness ----------
function makeInstance() {
  const events = [];
  const ctx = {
    data: Object.assign({}, DEF.data),
    props: {},
    _events: events,
    triggerEvent(name, detail) { events.push({ name, detail: detail || null, at: Date.now() }); },
    setData(patch) { Object.assign(this.data, patch); },
  };
  Object.keys(DEF.methods).forEach((k) => { ctx[k] = DEF.methods[k].bind(ctx); });
  ctx.__detach = () => DEF.lifetimes.detached.call(ctx);
  ctx.__observe = (toy) => {
    ctx.data.toy = toy;
    DEF.observers.toy.call(ctx, toy);
  };
  return ctx;
}
// 进详情事件名是 `open`，**不是** `tap`。
// 若断言写成 'tap' 就永远抓不到 bug：组件 triggerEvent('tap') 在真机上会与原生 tap 撞名，
// 页面 bind:tap 收到的是原生事件的 {x,y}（触点坐标）而非 {id} → 拼出 ?id=undefined。
// 详见 toy-card.js 顶部踩坑注释。
const opens = (ctx) => ctx._events.filter((e) => e.name === 'open');
const wants = (ctx) => ctx._events.filter((e) => e.name === 'want');

const TOY_A = {
  id: 'toy-aaaa1111', title: '乐高得宝大颗粒创意箱', category: 'building_blocks',
  conditionLevel: '9new', ageRange: '2-5', city: '深圳市', points: 80, isFreeShipping: true,
  images: ['https://picsum.photos/seed/a/600/750'], wantCount: 47, wanted: false,
  owner: { name: '林林妈妈', avatarUrl: 'https://picsum.photos/seed/ava/160/160', isVerified: true, creditScore: 960, creditLevel: 'elite' },
};
const TOY_B = {
  id: 'toy-bbbb2222', title: '儿童尤克里里 21 寸', category: 'early_education',
  conditionLevel: 'used', ageRange: '4-10', city: '成都市', points: 40, isFreeShipping: false,
  images: [], wantCount: 0, wanted: false,
  owner: { name: '豆豆家', avatarUrl: null, isVerified: false, creditScore: 520, creditLevel: 'sprout' },
};
const TOY_NOIMG = Object.assign({}, TOY_A, { id: 'toy-cccc3', images: [] });

(async () => {
  console.log('===== 组件定义完整性 =====');
  check('组件定义已捕获', !!DEF && !!DEF.methods, !!DEF);
  check('声明了 toy 属性', !!(DEF.properties && DEF.properties.toy));
  check('声明了 toy observer', !!(DEF.observers && typeof DEF.observers.toy === 'function'));

  console.log('\n===== A. observer 派生字段 =====');
  {
    const { cardRatio, CATEGORY_NAMES } = { cardRatio: require('../miniprogram/utils/masonry').cardRatio, CATEGORY_NAMES: require('../miniprogram/utils/format').CATEGORY_NAMES };
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    check('成色标签 = 9成新', ctx.data.conditionLabel === '9成新', ctx.data.conditionLabel);
    check('成色样式类 = condition--9new', ctx.data.conditionCls === 'condition--9new', ctx.data.conditionCls);
    check('信用标签 = 优选（960 分）', ctx.data.creditLabel === '优选', ctx.data.creditLabel);
    check('信用样式类 = credit--elite', ctx.data.creditCls === 'credit--elite', ctx.data.creditCls);
    check('品类中文 = 积木拼搭', ctx.data.categoryLabel === CATEGORY_NAMES.building_blocks, ctx.data.categoryLabel);
    check('封面高度 = 比例 × 100（与 masonry 同源）', ctx.data.mediaPad === Math.round(cardRatio(TOY_A.id) * 100), { got: ctx.data.mediaPad, want: Math.round(cardRatio(TOY_A.id) * 100) });
    check('有图 → hasImage=true', ctx.data.hasImage === true, ctx.data.hasImage);
    check('首次挂载 → imgLoaded=false（等图片真的加载完再渐显）', ctx.data.imgLoaded === false, ctx.data.imgLoaded);
    check('作者有头像 → hasAvatar=true', ctx.data.hasAvatar === true, ctx.data.hasAvatar);

    const ctx2 = makeInstance();
    ctx2.__observe(TOY_B);
    check('无图 → hasImage=false（走占位块）', ctx2.data.hasImage === false, ctx2.data.hasImage);
    check('无头像 → hasAvatar=false（走默认头像）', ctx2.data.hasAvatar === false, ctx2.data.hasAvatar);
    check('成色 used → 有使用痕迹', ctx2.data.conditionLabel === '有使用痕迹', ctx2.data.conditionLabel);
    check('信用 520 → 新芽', ctx2.data.creditLabel === '新芽', ctx2.data.creditLabel);
    check('未知品类回落到「童芽玩具」', makeInstanceWith(TOY_NOIMG, { category: 'unknown_xyz' }).data.categoryLabel === '童芽玩具', null);
  }
  function makeInstanceWith(toy, patch) {
    const c = makeInstance();
    c.__observe(Object.assign({}, toy, patch));
    return c;
  }

  console.log('\n===== B. 同一件玩具属性更新不得重置加载态（点想要不闪图）=====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    // 模拟图片加载完成 + 头像加载失败
    ctx.onImgLoad();
    ctx.onAvatarError();
    check('准备态：imgLoaded=true, hasAvatar=false', ctx.data.imgLoaded === true && ctx.data.hasAvatar === false, ctx.data);
    // 点"想要"后页面回写，observer 收到的是新对象但同一个 id
    ctx.__observe(Object.assign({}, TOY_A, { wanted: true, wantCount: 48 }));
    check('同玩具属性更新后 imgLoaded 仍为 true（图片不会闪）', ctx.data.imgLoaded === true, ctx.data.imgLoaded);
    check('同玩具属性更新后 hasAvatar 仍为 false（破图不会复活）', ctx.data.hasAvatar === false, ctx.data.hasAvatar);
    check('wantCount 已跟随新数据', ctx.data.toy.wantCount === 48, ctx.data.toy.wantCount);
  }

  console.log('\n===== C. 换成另一件玩具时重置加载态 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onImgLoad();
    ctx.__observe(TOY_B);
    check('切到 B 后 imgLoaded 复位为 false', ctx.data.imgLoaded === false, ctx.data.imgLoaded);
    check('切到 B 后 hasAvatar 按 B 重算为 false', ctx.data.hasAvatar === false, ctx.data.hasAvatar);
    ctx.__observe(TOY_A);
    check('切回 A 后 hasAvatar 重算为 true', ctx.data.hasAvatar === true, ctx.data.hasAvatar);
  }

  console.log('\n===== D. 单击封面 → 260ms 后进详情 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onMediaTap();
    check('点击瞬间还没有 open 事件（等双击窗口）', opens(ctx).length === 0, opens(ctx).length);
    await sleep(400);
    check('窗口结束后触发 1 次 open', opens(ctx).length === 1, opens(ctx).length);
    check('open 事件带回玩具 id', opens(ctx)[0] && opens(ctx)[0].detail.id === TOY_A.id, opens(ctx)[0]);
    check('单击不产生 want 事件', wants(ctx).length === 0, wants(ctx).length);
  }

  console.log('\n===== E. 双击封面 → 想要，且不能顺带进详情 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onMediaTap();
    await sleep(120);
    ctx.onMediaTap();
    check('第二次点击立刻抛出 want 事件', wants(ctx).length === 1, wants(ctx).length);
    check('want 事件 wanted=true（原本未想要）', wants(ctx)[0].detail.wanted === true, wants(ctx)[0]);
    check('want 事件带回玩具 id', wants(ctx)[0].detail.id === TOY_A.id, wants(ctx)[0]);
    await sleep(400);
    check('双击后不再补发 open（导航定时器已取消，不会误进详情）', opens(ctx).length === 0, opens(ctx).length);
    check('双击播放了爆裂动效（burst=true）', ctx.data.burst === true, ctx.data.burst);
  }

  console.log('\n===== F. 两次间隔超过窗口 → 算两次单击 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onMediaTap();
    await sleep(340); // > 260ms
    ctx.onMediaTap();
    await sleep(400);
    check('慢速两次点击产生 2 次 open', opens(ctx).length === 2, opens(ctx).length);
    check('慢速两次点击不产生 want', wants(ctx).length === 0, wants(ctx).length);
  }

  console.log('\n===== G. 右下角心形 / 已想要时不再爆裂 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onWantTap();
    check('未想要时点一下 → want(wanted=true)', wants(ctx)[0].detail.wanted === true, wants(ctx)[0]);
    // playBurst 先 setData({burst:false}) 再经 wx.nextTick 置 true（同值 setData 不会重启 CSS 动画）
    check('点下瞬间 burst 先被复位（保证动画能重放）', ctx.data.burst === false, ctx.data.burst);
    await sleep(30);
    check('未想要时点一下 → 播放爆裂（burst=true）', ctx.data.burst === true, ctx.data.burst);

    const ctx2 = makeInstance();
    ctx2.__observe(Object.assign({}, TOY_A, { wanted: true, wantCount: 47 }));
    ctx2.onWantTap();
    check('已想要时点一下 → want(wanted=false)（取消）', wants(ctx2)[0].detail.wanted === false, wants(ctx2)[0]);
    check('取消时不播爆裂（避免误以为又点了一次想要）', ctx2.data.burst === false, ctx2.data.burst);

    const ctx3 = makeInstance();
    ctx3.__observe({});
    ctx3.onWantTap();
    check('toy 为空对象时点心形不抛错且不发事件', wants(ctx3).length === 0, wants(ctx3).length);
  }

  console.log('\n===== H. 图片加载失败降级 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onImgError();
    check('失败后 hasImage=false（回落到暖色占位块，不留破图）', ctx.data.hasImage === false, ctx.data);
    check('失败后 imgLoaded=false', ctx.data.imgLoaded === false, ctx.data);
    ctx.__observe(Object.assign({}, TOY_A, { wanted: true, wantCount: 48 }));
    check('失败状态在后续属性更新中不被复活', ctx.data.hasImage === false, ctx.data.hasImage);
    ctx.__observe(TOY_B);
    ctx.__observe(TOY_A);
    check('换走再换回来时按新数据重算 hasImage=true', ctx.data.hasImage === true, ctx.data.hasImage);
  }

  console.log('\n===== I. 正文点击 / 挥手进详情 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onBodyTap();
    check('正文点击立即产生 open（不做双击判定，不延迟）', opens(ctx).length === 1, opens(ctx).length);
  }

  console.log('\n===== J. 组件销毁后挂起的定时器不再回调 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onMediaTap();       // 挂起 260ms 导航定时器
    ctx.__detach();         // 立刻销毁（例如翻页/换筛选把卡片移除了）
    await sleep(420);
    check('销毁后不再触发 open（不会给已卸载的页面发导航）', opens(ctx).length === 0, opens(ctx).length);
  }

  console.log('\n===== K. 爆裂动效可重复播放 =====');
  {
    const ctx = makeInstance();
    ctx.__observe(TOY_A);
    ctx.onWantTap();
    await sleep(30);
    check('第一次爆裂已置 true', ctx.data.burst === true, ctx.data.burst);
    await sleep(750);
    check('700ms 后自动复位为 false', ctx.data.burst === false, ctx.data.burst);
    ctx.__observe(Object.assign({}, TOY_A, { wanted: false }));
    ctx.onWantTap();
    await sleep(30);
    check('再次双击能重新播放（同值 setData 不会重启 CSS 动画，故先复位再置 true）', ctx.data.burst === true, ctx.data.burst);
  }

  console.log('\n===== L. WXML 模板取值自检（专防「断言全绿但渲染是错的」）=====');
  {
    // 背景：组件 data 里的 categoryLabel 单测一直是绿的，但模板写的是 toy.categoryLabel，
    // 而云函数 publicToy() 根本不返回该字段 → 无图占位块上永远只有「童芽玩具」。
    // 同一类问题还有 addGlobalClass（数值都对，样式没生效）。数值断言抓不到，这里补静态校验。
    const fs = require('fs');
    const wxmlPath = path.join(__dirname, '..', 'miniprogram', 'components', 'toy-card', 'toy-card.wxml');
    const wxml = fs.readFileSync(wxmlPath, 'utf8');
    // 先剥掉 HTML 注释再校验：注释里引用旧写法属于「记录踩坑」，不该被判成 bug
    const markup = wxml.replace(/<!--[\s\S]*?-->/g, ' ');

    // 云函数 publicToy() / owner 实际会下发的字段，模板里引用表外字段 = 永远取不到值
    // isMine 是服务端按查看者 openid 算的「是否自己发布」，2026-10-10 随「点击兑换没反应」一并加入。
    const TOY_FIELDS = new Set(['id', 'ownerId', 'title', 'description', 'category', 'ageRange', 'conditionLevel',
      'hasSmallParts', 'images', 'city', 'status', 'points', 'isFreeShipping', 'wantCount', 'createdAt',
      'wanted', 'owner', 'isMine']);
    const OWNER_FIELDS = new Set(['id', 'name', 'avatarUrl', 'isVerified', 'creditScore', 'creditLevel']);

    const exprs = [];
    const re = /\{\{([^}]*)\}\}/g;
    let m;
    while ((m = re.exec(markup))) exprs.push(m[1]);
    check('模板里能解析到插值表达式', exprs.length > 0, exprs.length);

    const badToy = new Set();
    exprs.forEach((e) => {
      const r = /(?:^|[^\w.])toy\.([A-Za-z_$][\w$]*)/g;
      let mm;
      while ((mm = r.exec(e))) if (!TOY_FIELDS.has(mm[1])) badToy.add(mm[1]);
    });
    check('模板未引用 publicToy() 不返回的 toy.* 字段', badToy.size === 0, [...badToy]);

    const badOwner = new Set();
    exprs.forEach((e) => {
      const r = /toy\.owner\.([A-Za-z_$][\w$]*)/g;
      let mm;
      while ((mm = r.exec(e))) if (!OWNER_FIELDS.has(mm[1])) badOwner.add(mm[1]);
    });
    check('模板未引用 owner 上不存在的字段', badOwner.size === 0, [...badOwner]);

    // 裸标识符必须能在组件 data 里找到，否则渲染成空字符串
    const DATA_KEYS = new Set(Object.keys(DEF.data));
    const ALIAS = new Set(['item', 'index', 'toy', 'true', 'false', 'null', 'undefined']);
    const badBare = new Set();
    exprs.forEach((e) => {
      const cleaned = e.replace(/'[^']*'|"[^"]*"/g, ' ').replace(/\.\s*[A-Za-z_$][\w$]*/g, ' ');
      (cleaned.match(/[A-Za-z_$][\w$]*/g) || []).forEach((tk) => {
        if (ALIAS.has(tk) || DATA_KEYS.has(tk)) return;
        badBare.add(tk);
      });
    });
    check('模板里的裸标识符都能在组件 data 中找到', badBare.size === 0, [...badBare]);

    check('模板未再出现历史 bug 写法 toy.categoryLabel', !/toy\.categoryLabel/.test(markup), null);
    check('组件已开 addGlobalClass（否则 app.wxss 的 .badge 对组件内无效）',
      !!(DEF.options && DEF.options.addGlobalClass === true), DEF.options);
  }

  console.log('\n========================================');
  console.log(`结果: PASS=${PASS} FAIL=${FAIL}`);
  console.log('========================================');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', (e && e.stack) || e);
  process.exit(2);
});
