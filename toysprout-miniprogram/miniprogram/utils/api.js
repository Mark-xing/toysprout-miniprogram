// utils/api.js
// 云函数统一调用封装：wx.cloud.callFunction 包一层 Promise，统一 loading/toast/错误处理，
// 与 MVP Web 版 app.js 的 apiFetch 职责对齐（但无需 token，openid 由云开发自动带上下文）。
'use strict';

function callFunction(name, action, data) {
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
  callWithLoading,
  toast,
  requireProfile,
};
