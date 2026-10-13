// utils/api.js
// 云函数统一调用封装：wx.cloud.callFunction 包一层 Promise，统一 loading/toast/错误处理，
// 与 MVP Web 版 app.js 的 apiFetch 职责对齐（但无需 token，openid 由云开发自动带上下文）。
'use strict';

// ============================================================================
// 隐私授权拦截（微信 2023 年起强制要求，提审硬门槛）
// ----------------------------------------------------------------------------
// 本项目确实在收集个人信息（chooseAvatar 采集头像、type="nickname" 采集昵称、
// 收货地址、实名认证、玩具图片等），因此在任何云函数调用发起前都必须先确保用户
// 已同意《隐私政策》。拦截点统一放在这里（utils/api.js），所有页面走的 api.xxx()
// 最终都会经过 callFunction，因此不存在绕过入口。
//
// 单飞 Promise：并发请求同时进来时只拉起一次授权弹窗。写法对齐 app.js 的
// globalData.loginPromise——进行中的流程被后续调用复用，结束后再清空以便重试。
let privacyPromise = null;

// 确保隐私协议已获授权。resolve(true)=可继续，resolve(false)=用户拒绝（已给出可见反馈）。
//
// 三重防护，缺一不可：
//   1) 能力缺失：旧基础库（< 2.32.3）没有 wx.requirePrivacyAuthorize，此时平台自身也
//      不做隐私拦截，必须直接放行，绝不能抛错把用户挡在门外；
//   2) 并发去重：同一时刻只保留一个授权流程（privacyPromise）；
//   3) 无递归：本流程只调 getPrivacySetting + requirePrivacyAuthorize，二者的回调都
//      不会、也不允许再回到 ensurePrivacy，从结构上杜绝"授权里再查授权"的死循环。
function ensurePrivacy() {
  if (typeof wx.requirePrivacyAuthorize !== 'function' || typeof wx.getPrivacySetting !== 'function') {
    return Promise.resolve(true);
  }
  if (privacyPromise) return privacyPromise;

  privacyPromise = new Promise((resolve) => {
    wx.getPrivacySetting({
      success(res) {
        if (!res.needAuthorization) {
          // 已同意，或本小程序尚未配置隐私协议 → 无需授权，直接放行。
          resolve(true);
          return;
        }
        // 需要授权：主动拉起微信官方隐私授权弹窗（同一次流程内不会重复触发）。
        wx.requirePrivacyAuthorize({
          success() {
            resolve(true);
          },
          fail() {
            // 用户拒绝或关闭了弹窗。按项目硬约定：失败分支必须有可见反馈，禁止静默 return。
            // 这里用 toast 而不是 modal，避免在批量请求场景下叠出多个弹窗。
            toast('需同意隐私政策后才能继续', 'error');
            resolve(false);
          },
        });
      },
      fail() {
        // getPrivacySetting 自身失败（极罕见）。此时无法判断授权状态，选择放行并记录，
        // 由云函数侧的边界校验兜底，避免因平台接口抖动把整个小程序变成不可用。
        console.warn('[privacy] getPrivacySetting 调用失败，跳过隐私拦截');
        resolve(true);
      },
    });
  }).then((allowed) => {
    // 关键：整个授权流程（含 requirePrivacyAuthorize 的异步回调）结束后才清空，
    // 若在 getPrivacySetting 的 complete 里就清空，弹窗还开着时的并发请求会再次弹窗。
    privacyPromise = null;
    return allowed;
  });

  return privacyPromise;
}

function callFunction(name, action, data) {
  // 先过隐私授权这道闸，再发云函数。用户拒绝时不发起请求，直接返回统一失败结构，
  // 让调用方既有的失败分支（toast/modal）继续生效，不静默。
  return ensurePrivacy().then((allowed) => {
    if (!allowed) {
      return { code: 403, data: null, message: '需同意隐私政策后才能继续' };
    }
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name,
        data: Object.assign({ action }, data || {}),
        success(res) {
          const body = res.result || {};
          if (body.code === 401) {
            // ⚠️ 这里绝不能 wx.reLaunch 到某个"登录页"。两个原因：
            //   1) 方案 A 之后登录由 openid 在 app.onLaunch 静默完成，根本不存在登录页；
            //   2) 微信审核规范明确要求「基础功能不依赖登录」，一旦在此强制跳转，
            //      用户连浏览、搜索都可能被弹走，属于确定违规项。
            // 401 只记日志，后续怎么处理交给调用方（通常是把用户引导到「资料」页）。
            console.warn(`[api] ${name}.${action} 返回 401:`, body.message);
          }
          resolve(body);
        },
        fail(err) {
          console.error(`[api] ${name}.${action} 调用失败:`, err);
          resolve({ code: 599, data: null, message: '网络异常，请检查网络后重试' });
        },
      });
    });
  });
}

// 带 loading 遮罩的调用（用于表单提交等需要阻塞交互的场景）
function callWithLoading(name, action, data, loadingText) {
  wx.showLoading({ title: loadingText || '处理中…', mask: true });
  return callFunction(name, action, data).finally(() => wx.hideLoading());
}

// 统一 toast（成功/失败）
function toast(message, type) {
  wx.showToast({
    title: message,
    icon: type === 'error' ? 'error' : type === 'success' ? 'success' : 'none',
    duration: 2000,
  });
}

// 「需要对外可见身份」的操作（发布玩具、发起交换）前置校验。
// 昵称为空时把用户引导到「资料」页，返回 false 表示已拦截，调用方应直接 return。
//
// 注意：这只是体验层的提前拦截。服务端 toy.create / swap.create 有同样的兜底校验——
// 绕开页面直接调云函数一样会被拒，所以前端拦截失效也不会产生脏数据。
async function requireProfile() {
  const app = getApp();
  let user = app.globalData.userInfo;
  if (!user) user = await app.silentLogin();
  if (user && user.profileCompleted) return true;

  wx.showModal({
    title: '先设置一下昵称',
    content: '交换对方需要知道怎么称呼你，设置昵称后即可继续',
    confirmText: '去设置',
    cancelText: '稍后再说',
    success(res) {
      if (res.confirm) wx.navigateTo({ url: '/pages/profile/profile' });
    },
  });
  return false;
}

module.exports = {
  auth: (action, data) => callFunction('auth', action, data),
  user: (action, data) => callFunction('user', action, data),
  toy: (action, data) => callFunction('toy', action, data),
  swap: (action, data) => callFunction('swap', action, data),
  review: (action, data) => callFunction('review', action, data),
  membership: (action, data) => callFunction('membership', action, data),
  upload: (action, data) => callFunction('upload', action, data),
  points: (action, data) => callFunction('points', action, data),
  notify: (action, data) => callFunction('notify', action, data),
  callWithLoading,
  toast,
  requireProfile,
};
