#!/usr/bin/env node
// scripts/check-detail-redeem.js
// 玩具详情页（packageToy/detail）「点了必有反馈」离线回归测试。
//
// 为什么需要它：曾出现「点『用积分兑换』没有任何反应」的真机问题。根因是 onRedeemTap
// 在 shippingPreview 为 null（预览接口失败 / 还在加载 / 网络异常）时**静默 return** ——
// 没有 toast、没有弹窗，用户以为按钮坏了。
//
// 实现手法照抄 scripts/check-toy-card.js：Node 直接加载 detail.js，把 Page() 定义捕获下来，
// 手工构造最小 ctx（data / setData / 方法体 bind）驱动**真实方法体**，断言的是源码里真正会跑的那段。
// 与真机链路脚本 verify-detail-open.js 不同，本脚本完全离线，不需要开发者工具。
//
// 核心断言思想：对每一个分支，断言用户一定看到了某个可见反馈
// （wx.showToast 或 wx.showModal 至少被调用一次）。原来的 bug 会让这条断言 FAIL。
'use strict';

const path = require('path');
const Module = require('module');

// ---------- wx stub：所有「有没有反馈」都从这一层统一观测 ----------
let wxCalls = { showToast: [], showModal: [], navigateTo: [], navigateBack: [], redirectTo: [] };
let modalAutoConfirm = null; // true=自动回调 {confirm:true} / false=自动 {confirm:false} / null=不回调

global.wx = {
  showToast: (o) => { wxCalls.showToast.push(o); },
  showModal: (o) => {
    wxCalls.showModal.push(o);
    if (modalAutoConfirm === true && typeof o.success === 'function') o.success({ confirm: true });
    else if (modalAutoConfirm === false && typeof o.success === 'function') o.success({ confirm: false });
  },
  navigateTo: (o) => { wxCalls.navigateTo.push(o); },
  navigateBack: (o) => { wxCalls.navigateBack.push(o); },
  redirectTo: (o) => { wxCalls.redirectTo.push(o); },
};

// ---------- api stub：每个云函数调用的返回都可编排 ----------
let handlers = {};
let apiCalls = { toy: [], points: [], swap: [], toast: [] };

const stubApi = {
  toy: (action, data) => { apiCalls.toy.push({ action, data }); return Promise.resolve(handlers.toy ? handlers.toy(action, data) : { code: 0, data: {} }); },
  points: (action, data) => { apiCalls.points.push({ action, data }); return Promise.resolve(handlers.points ? handlers.points(action, data) : { code: 0, data: {} }); },
  swap: (action, data) => { apiCalls.swap.push({ action, data }); return Promise.resolve(handlers.swap ? handlers.swap(action, data) : { code: 0, data: {} }); },
  requireProfile: () => Promise.resolve(handlers.requireProfile ? handlers.requireProfile() : true),
  // 关键：api.toast 转发到 wx.showToast，让「有没有反馈」在 wx 层统一可观测，而不是被 stub 掉看不见。
  toast: (message, type) => {
    apiCalls.toast.push({ message, type });
    global.wx.showToast({
      title: message,
      icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'none',
      duration: 2000,
    });
  },
};

// 在加载 detail.js **之前**，把 utils/api 的 require.cache 换成 stub。
// 真实 api.js 会调 getApp() / wx.cloud，Node 里跑不了；miniprogram/utils/format.js 是纯函数用真的。
const API_PATH = require.resolve(path.join(__dirname, '..', 'miniprogram', 'utils', 'api.js'));
(function injectStub(absPath, exportsObj) {
  const m = new Module(absPath, null);
  m.filename = absPath;
  m.loaded = true;
  m.exports = exportsObj;
  require.cache[absPath] = m;
})(API_PATH, stubApi);

// ---------- 捕获 Page 定义 ----------
let DEF = null;
global.Page = function (def) { DEF = def; };
const DETAIL_PATH = path.join(__dirname, '..', 'miniprogram', 'packageToy', 'detail', 'detail.js');
require(DETAIL_PATH);

// ---------- 断言与 harness ----------
let PASS = 0, FAIL = 0;
function check(desc, cond, extra) {
  if (cond) { PASS++; console.log('  PASS:', desc); }
  else { FAIL++; console.log('  FAIL:', desc, extra !== undefined ? '=> ' + JSON.stringify(extra) : ''); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resetEnv() {
  wxCalls = { showToast: [], showModal: [], navigateTo: [], navigateBack: [], redirectTo: [] };
  modalAutoConfirm = null;
  handlers = {};
  apiCalls = { toy: [], points: [], swap: [], toast: [] };
}
// 「有没有可见反馈」= showToast 与 showModal 调用次数之和
function feedback() { return wxCalls.showToast.length + wxCalls.showModal.length; }
function lastToast() { const a = wxCalls.showToast; return a.length ? a[a.length - 1].title : null; }

function makeCtx(overrides) {
  const ctx = {
    data: Object.assign({}, DEF.data),
    toyId: 'toy-x',
    setData(patch) { Object.assign(this.data, patch); },
  };
  Object.keys(DEF).forEach((k) => { if (typeof DEF[k] === 'function') ctx[k] = DEF[k].bind(ctx); });
  if (overrides) Object.assign(ctx.data, overrides);
  return ctx;
}

const gate = {}; // 总闸门用：记录各分支的反馈次数

(async () => {
  console.log('===== 0. 定义完整性 / stub 注入自检 =====');
  check('detail 定义已捕获且含 onRedeemTap', !!DEF && typeof DEF.onRedeemTap === 'function', !!DEF);
  check('detail 声明了 data.shippingPreview 初始为 null', !!(DEF && DEF.data && DEF.data.shippingPreview === null), DEF && DEF.data);
  {
    // 自检：确认 detail.js 真的取到了我们的 stub（而不是真实 api.js），否则后面所有断言都失去意义。
    resetEnv();
    handlers.points = () => ({ code: 0, data: { pointsRequired: 1, sufficientBalance: true } });
    const probe = makeCtx();
    await probe.loadShippingPreview();
    check('api stub 注入生效（detail.js 调到了我们的 points stub）',
      apiCalls.points.length === 1 && apiCalls.points[0].action === 'previewShipping', apiCalls.points);
  }

  console.log('\n===== 1. isMine:true 点兑换 → 必须有反馈、且不得发起兑换调用 =====');
  {
    resetEnv();
    const ctx = makeCtx({ isMine: true });
    await ctx.onRedeemTap();
    check('showToast 被调用（用户看得到反馈）', wxCalls.showToast.length >= 1, wxCalls.showToast);
    check('toast 文案含「自己的玩具」', /自己的玩具/.test(lastToast() || ''), lastToast());
    check('未调用 showModal', wxCalls.showModal.length === 0, wxCalls.showModal.length);
    check('未发起 api.swap 调用', apiCalls.swap.length === 0, apiCalls.swap);
    gate.c1 = feedback();
  }

  console.log('\n===== 2. isMine:true 点一换一 → 必须有反馈、且不得导航 =====');
  {
    resetEnv();
    const ctx = makeCtx({ isMine: true });
    await ctx.onSwapTap();
    check('showToast 被调用', wxCalls.showToast.length >= 1, wxCalls.showToast);
    // 注意：一换一的真实文案是「这是你发布的玩具，不能与自己交换」，字面上没有「自己的玩具」，
    // 但与本条意图一致（告知用户这是自己的玩具）。这里按源码实际文案锁定「发布的玩具」。
    check('toast 文案含「发布的玩具」（即"这是你发布的玩具…"）', /发布的玩具/.test(lastToast() || ''), lastToast());
    check('未调用 wx.navigateTo', wxCalls.navigateTo.length === 0, wxCalls.navigateTo.length);
    gate.c2 = feedback();
  }

  console.log('\n===== 3. requireProfile 拦截 → 不再重复弹窗、不发起兑换 =====');
  {
    resetEnv();
    handlers.requireProfile = () => false;
    const ctx = makeCtx({ isMine: false });
    await ctx.onRedeemTap();
    check('requireProfile 拦截时不自己弹 showModal（弹窗归 requireProfile 负责，不算静默）',
      wxCalls.showModal.length === 0, wxCalls.showModal.length);
    check('未发起 api.swap 调用', apiCalls.swap.length === 0, apiCalls.swap);
  }

  console.log('\n===== 4. shippingPreview=null + previewError → 必须如实告警并重试（原 bug 回归断言）=====');
  {
    resetEnv();
    handlers.requireProfile = () => true;
    handlers.points = () => ({ code: 0, data: { pointsRequired: 80, sufficientBalance: true } });
    const ctx = makeCtx({ isMine: false, shippingPreview: null, previewError: '不能兑换自己发布的玩具' });
    await ctx.onRedeemTap();
    await sleep(20); // 等未 await 的 loadShippingPreview 重试跑完
    check('showToast 被调用（原 bug：这里静默 return，无任何反馈）', wxCalls.showToast.length >= 1, wxCalls.showToast);
    check('toast 文案等于 previewError', lastToast() === '不能兑换自己发布的玩具', lastToast());
    check('触发了预览重试（再次调用 points.previewShipping）',
      apiCalls.points.filter((c) => c.action === 'previewShipping').length >= 1, apiCalls.points);
    gate.c4 = feedback();
  }

  console.log('\n===== 5. shippingPreview=null 且 previewError 为空 → 必须有兜底文案 =====');
  {
    resetEnv();
    handlers.requireProfile = () => true;
    handlers.points = () => ({ code: 0, data: { pointsRequired: 80, sufficientBalance: true } });
    const ctx = makeCtx({ isMine: false, shippingPreview: null, previewError: '' });
    await ctx.onRedeemTap();
    await sleep(20);
    check('仍被调用 showToast', wxCalls.showToast.length >= 1, wxCalls.showToast);
    check('toast 文案含「稍后重试」（不得为空文案）', /稍后重试/.test(lastToast() || ''), lastToast());
    gate.c5 = feedback();
  }

  console.log('\n===== 6. 积分不足 → 文案含「积分不足」与实际数字 =====');
  {
    resetEnv();
    handlers.requireProfile = () => true;
    const ctx = makeCtx({
      isMine: false,
      shippingPreview: { sufficientBalance: false, pointsRequired: 80, myBalance: 20, shippingNote: '' },
    });
    await ctx.onRedeemTap();
    check('toast 文案含「积分不足」', /积分不足/.test(lastToast() || ''), lastToast());
    check('toast 文案含所需积分数 80', /80/.test(lastToast() || ''), lastToast());
    check('toast 文案含当前余额 20', /20/.test(lastToast() || ''), lastToast());
    gate.c6 = feedback();
  }

  console.log('\n===== 7. 余额充足 → 弹确认框 → confirm 后真实兑换并跳订单页 =====');
  {
    resetEnv();
    handlers.requireProfile = () => true;
    handlers.swap = () => ({ code: 0, data: { id: 'order-1' }, message: '兑换成功' });
    const ctx = makeCtx({
      isMine: false,
      shippingPreview: { sufficientBalance: true, pointsRequired: 80, myBalance: 200, shippingNote: '同城可自提' },
    });
    modalAutoConfirm = true;
    await ctx.onRedeemTap();
    await sleep(20); // 等 doRedeem 的 await api.swap 解析
    check('showModal 被调用', wxCalls.showModal.length === 1, wxCalls.showModal.length);
    check('确认框 title 含「确认」', /确认/.test((wxCalls.showModal[0] || {}).title || ''), wxCalls.showModal[0] && wxCalls.showModal[0].title);
    check('api.swap 收到 action=redeemWithPoints', apiCalls.swap.some((c) => c.action === 'redeemWithPoints'), apiCalls.swap);
    const redeemCall = apiCalls.swap.find((c) => c.action === 'redeemWithPoints');
    check('兑换入参 toyId 正确', !!redeemCall && redeemCall.data.toyId === 'toy-x', redeemCall && redeemCall.data);
    check('兑换成功后有成功 toast', wxCalls.showToast.length >= 1, wxCalls.showToast);
    await sleep(900); // doRedeem 成功分支 800ms 后 redirectTo
    check('兑换成功后 wx.redirectTo 到订单页', wxCalls.redirectTo.length === 1, wxCalls.redirectTo);
    check('订单页 url 指向 order-detail 且带订单 id',
      wxCalls.redirectTo.length === 1 && /order-detail/.test(wxCalls.redirectTo[0].url) && /order-1/.test(wxCalls.redirectTo[0].url),
      wxCalls.redirectTo[0] && wxCalls.redirectTo[0].url);
  }

  console.log('\n===== 8. doRedeem 收到 code!==0 → toast 服务端 message、不跳转 =====');
  {
    resetEnv();
    handlers.swap = () => ({ code: 400, data: null, message: '服务端拒绝了这次兑换' });
    const ctx = makeCtx({ isMine: false });
    await ctx.doRedeem();
    check('showToast 文案 = 服务端 message', lastToast() === '服务端拒绝了这次兑换', lastToast());
    check('未跳转订单页（wx.redirectTo 未被调用）', wxCalls.redirectTo.length === 0, wxCalls.redirectTo.length);
    gate.c8 = feedback();
  }

  console.log('\n===== 9. 总闸门：每个分支 showToast + showModal 调用次数之和 ≥ 1 =====');
  {
    const items = [
      ['1  isMine 点兑换', gate.c1],
      ['2  isMine 点一换一', gate.c2],
      ['4  预览为 null（有 previewError）', gate.c4],
      ['5  预览为 null（无 previewError）', gate.c5],
      ['6  积分不足', gate.c6],
      ['8  兑换失败', gate.c8],
    ];
    items.forEach(([name, v]) => console.log(`   - ${name}  反馈次数 = ${v}`));
    const bad = items.filter(([, v]) => !(v >= 1)).map(([name]) => name);
    check('所有分支的反馈次数均 ≥ 1（防静默 return 的总闸门）', bad.length === 0, bad);
  }

  console.log('\n===== 10. loadShippingPreview 失败分支 =====');
  {
    resetEnv();
    handlers.points = () => ({ code: 400, data: null, message: '不能兑换自己发布的玩具' });
    const ctx = makeCtx({ shippingPreview: { sufficientBalance: true }, previewError: '旧值' });
    await ctx.loadShippingPreview();
    check('失败时 previewError 写入服务端 message', ctx.data.previewError === '不能兑换自己发布的玩具', ctx.data.previewError);
    check('失败时 shippingPreview 置 null', ctx.data.shippingPreview === null, ctx.data.shippingPreview);
  }

  console.log('\n===== 11. loadShippingPreview 成功分支 =====');
  {
    resetEnv();
    const data = { pointsRequired: 80, myBalance: 200, sufficientBalance: true, shippingNote: '同城可自提' };
    handlers.points = () => ({ code: 0, data });
    const ctx = makeCtx({ previewError: '旧错误' });
    await ctx.loadShippingPreview();
    check('成功时 shippingPreview 写入响应 data',
      JSON.stringify(ctx.data.shippingPreview) === JSON.stringify(data), ctx.data.shippingPreview);
    check('成功时 previewError 清空', ctx.data.previewError === '', ctx.data.previewError);
  }

  console.log('\n===== 12. loadDetail 透传服务端 isMine =====');
  {
    resetEnv();
    handlers.toy = () => ({
      code: 0,
      data: {
        id: 'toy-x', title: '测试玩具', category: 'building_blocks', conditionLevel: '9new',
        createdAt: '2026-10-10', city: '深圳市', isMine: true,
        owner: { creditLevel: 'trusted', creditScore: 900, avatarUrl: null },
        reviewSummary: { count: 0 },
      },
    });
    handlers.points = () => ({ code: 0, data: { pointsRequired: 80, sufficientBalance: true } });
    const ctx = makeCtx();
    await ctx.loadDetail();
    check('loadDetail 后 data.isMine === true', ctx.data.isMine === true, ctx.data.isMine);
  }

  console.log('\n========================================');
  console.log(`结果: PASS=${PASS} FAIL=${FAIL}`);
  console.log('========================================');
  process.exit(FAIL ? 1 : 0);
})().catch((e) => {
  console.error('脚本异常:', (e && e.stack) || e);
  process.exit(2);
});
