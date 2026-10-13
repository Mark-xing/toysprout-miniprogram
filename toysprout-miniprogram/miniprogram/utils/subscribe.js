// utils/subscribe.js
// 微信订阅消息的**前端**授权封装。
//
// 作用：在用户「主动触发」的关键操作前，请求用户订阅后续会收到的模板消息。
// 拿到的授权由微信云端记账，服务端在状态流转时用 cloud.openapi.subscribeMessage.send 下发。
//
// ⚠️⚠️ 两条必须遵守的约束（否则会踩坑）：
//   1) **必须在用户点击的同步调用栈里发起**。wx.requestSubscribeMessage 是「用户手势」强相关接口，
//      一旦放进 await 之后的异步回调里调用，微信会直接报错（errno 10004 / "can only be invoked by user TAP gesture"）。
//      因此调用方要写在事件处理函数的**第一行**，在任何 await 之前。
//   2) 用户拒绝订阅**不能阻断主流程**，也不要反复骚扰（拒绝后本次不再询问）。
//      所以本封装**永不 reject、永不抛**，拒绝时也不弹 toast（这是用户主动选择，不是业务失败分支）。
//
// ⚠️ 模板 ID 目前未知：需运营方在微信公众平台 MP 后台 →「订阅消息」里申请后，
//    填在下面 TMPL_IDS 的对应 key 上（值当前是空字符串 ''）。
//    服务端还有一份同名 key 的常量：cloudfunctions/_shared/subscribe-templates.js，
//    **两处都要填**（小程序端与云函数端无法互相 require，只能各存一份、保持 key 一致）。
//    空值时 requestSubscribe 会**直接跳过**（不发请求、不报错、不阻断）。
//
// ⚠️ 以微信官方文档为准：订阅消息分「一次性订阅」与「长期订阅」，可申请类目、下发次数、
//    以及个人主体能否使用，均以微信官方文档与 MP 后台实际可申请项为准。此处不臆造模板类目。
'use strict';

// key 必须与 cloudfunctions/_shared/subscribe-templates.js 完全一致
const TMPL_IDS = {
  SWAP_REQUEST: '',
  SWAP_ACCEPTED: '',
  SWAP_REJECTED: '',
  SWAP_SHIPPED: '',
  SWAP_RECEIVED: '',
  SWAP_REVIEWED: '',
};

// 把 key 数组解析成非空的模板 ID 数组（滤掉尚未申请的空值）。
function resolveTmplIds(keys) {
  return (keys || []).map((k) => TMPL_IDS[k]).filter((id) => !!id);
}

// 请求订阅授权。入参为 subscribe-templates 里的 key 数组。
// 返回值 Promise<{ requested:boolean, accepted:string[], rejected:string[] }>，**永不 reject**。
//
// 注意：调用方必须在用户点击的同步栈里调用本函数（见文件头约束 1）。
function requestSubscribe(keys) {
  const tmplIds = resolveTmplIds(keys);

  // 模板 ID 尚未申请（全为空）→ 无需请求，直接返回。这是当前默认状态。
  if (!tmplIds.length) {
    return Promise.resolve({ requested: false, accepted: [], rejected: [] });
  }
  // 旧基础库不支持该接口 → 直接放行，不能因为能力缺失把用户挡在门外。
  if (typeof wx.requestSubscribeMessage !== 'function') {
    console.warn('[subscribe] 当前基础库不支持 wx.requestSubscribeMessage，跳过订阅授权');
    return Promise.resolve({ requested: false, accepted: [], rejected: [] });
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success(res) {
        // res 形如 { errMsg, [tmplId]: 'accept' | 'reject' | 'ban' }
        const accepted = tmplIds.filter((id) => res[id] === 'accept');
        const rejected = tmplIds.filter((id) => res[id] === 'reject' || res[id] === 'ban');
        // 用户拒绝属主动选择，**不 toast、不阻断**，仅记录，便于排查。
        console.log('[subscribe] 订阅结果', { accepted: accepted.length, rejected: rejected.length });
        resolve({ requested: true, accepted, rejected });
      },
      fail(err) {
        // 接口调用失败（如弹窗被拦截）。同样不阻断主流程，仅记录。
        console.warn('[subscribe] requestSubscribeMessage 调用失败（已忽略）:', err && err.errMsg);
        resolve({ requested: true, accepted: [], rejected: [] });
      },
    });
  });
}

module.exports = { TMPL_IDS, requestSubscribe };
