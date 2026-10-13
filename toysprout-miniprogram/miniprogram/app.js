// app.js
const api = require('./utils/api');

App({
  globalData: {
    userInfo: null,
    envId: 'cloud1-d9gtvt3k34dcfec16', // 云开发环境 ID（云开发控制台首页可查看）
    loginPromise: null, // 静默登录的进行中 Promise，供页面并发 await 复用，避免重复请求
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true,
    });
    this.checkPrivacyAndSession();
    // 静默登录：不弹任何界面，老用户 0 交互直接进入
    this.silentLogin();
  },

  // 静默登录（方案 A：登录只依赖 openid）。
  // openid 由云函数侧的 cloud.getWXContext() 自动注入，小程序端无需任何凭据，
  // 因此首次进入即自动建档，用户无感知；后续有了头像昵称再走"完善资料"页补全。
  //
  // 失败必须静默降级：浏览/搜索等基础功能本就不依赖登录（审核要求"基础功能不依赖登录"），
  // 绝不能因为登录失败就把用户挡在门外。失败时清空缓存的 Promise，下次调用可重试。
  silentLogin(force) {
    if (this.globalData.loginPromise && !force) return this.globalData.loginPromise;

    const promise = api
      .auth('login', {})
      .then((res) => {
        if (res.code === 0) {
          this.globalData.userInfo = res.data.user;
          return this.globalData.userInfo;
        }
        console.warn('[app] 静默登录失败:', res.message);
        this.globalData.loginPromise = null; // 允许下次重试
        return null;
      })
      .catch((e) => {
        console.error('[app] 静默登录异常:', e);
        this.globalData.loginPromise = null;
        return null;
      });

    this.globalData.loginPromise = promise;
    return promise;
  },

  // 页面在「完善资料」保存成功后回写缓存，避免再打一次 getProfile
  setUserInfo(user) {
    this.globalData.userInfo = user || null;
    return this.globalData.userInfo;
  },

  // 小程序隐私协议合规（微信 2023 年起强制要求）+ 恢复登录态
  checkPrivacyAndSession() {
    if (wx.getPrivacySetting) {
      wx.getPrivacySetting({
        success(res) {
          if (res.needAuthorization) {
            // 隐私协议尚未同意。这里只做记录，不在启动阶段弹窗：
            // 真正的授权拦截点在 utils/api.js 的 ensurePrivacy()——每次 callFunction 发云函数前，
            // 都会先用 wx.requirePrivacyAuthorize 拉起隐私弹窗（单飞 Promise 去重、旧基础库放行）。
            console.log('[privacy] 需要用户同意隐私协议（授权拦截见 utils/api.js ensurePrivacy）');
          }
        },
      });
    }
  },
});
