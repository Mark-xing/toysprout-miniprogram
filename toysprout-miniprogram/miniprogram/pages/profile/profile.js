// pages/profile/profile.js
// 资料完善页。
//
// 【为什么不再叫"登录"页】方案 A 定稿后，登录已完全由 openid 静默完成（app.onLaunch 里
//   的 silentLogin），不存在"登录"这一交互步骤。本页只做一件事：补全/修改对外展示身份
//   ——头像 + 昵称。页面路径也从 pages/login 改为 pages/profile，避免后续维护者
//   再从"登录页"这个错误心智模型出发去改代码。
//
// 【为什么用 chooseAvatar + input type="nickname"】
//   wx.getUserInfo（2021-04-13 回收）与 wx.getUserProfile（2022-10-25 回收）都已不再返回
//   真实头像昵称。当前微信官方唯一推荐的途径就是这两个能力，且对「个人主体」同样开放
//   （这也是本项目选方案 A 时唯一还能用的账号信息能力）。
'use strict';

const api = require('../../utils/api');

const NAME_MAX_LEN = 20;

Page({
  data: {
    avatarPreview: '', // 传给 <image> 的值：云端 fileID 或刚选中的本地临时路径
    avatarChanged: false, // 仅在用户真的换过头像时才上传，避免每次保存都重复传一份云存储
    name: '',
    submitting: false,
    isFirstTime: true, // 昵称为空 = 首次完善，文案与"编辑资料"不同
  },

  onLoad() {
    const app = getApp();
    const cached = app.globalData.userInfo;
    if (cached) {
      this.fillFrom(cached);
      return;
    }
    // 缓存未就绪（冷启动时序）：兜底等一次静默登录
    app.silentLogin().then((user) => {
      if (user) this.fillFrom(user);
    });
  },

  fillFrom(user) {
    this.setData({
      avatarPreview: user.avatarUrl || '',
      name: user.name || '',
      avatarChanged: false,
      isFirstTime: !user.profileCompleted,
    });
  },

  // 微信回调给的是本地临时路径（wxfile:// 或 http://tmp/...），只用于即时预览。
  // 保存时才上传云存储换成 cloud:// fileID 落库——避免用户中途放弃时在云存储留下孤儿文件。
  onChooseAvatar(e) {
    const tempPath = e.detail && e.detail.avatarUrl;
    if (!tempPath) return;
    this.setData({ avatarPreview: tempPath, avatarChanged: true });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onCancel() {
    wx.navigateBack();
  },

  async onSave() {
    if (this.data.submitting) return;

    const name = this.data.name.trim();
    if (!name) return api.toast('请填写昵称', 'error');
    if (name.length > NAME_MAX_LEN) return api.toast(`昵称最多 ${NAME_MAX_LEN} 个字符`, 'error');

    this.setData({ submitting: true });
    try {
      const payload = { name };

      if (this.data.avatarChanged && this.data.avatarPreview) {
        const fileID = await this.uploadAvatar(this.data.avatarPreview);
        if (!fileID) {
          api.toast('头像上传失败，请重试', 'error');
          return;
        }
        payload.avatarUrl = fileID;
      } else if (this.data.avatarChanged) {
        // 用户把头像清空了（当前 UI 未提供清空入口，保留以防后续加"移除头像"）
        payload.avatarUrl = '';
      }

      const res = await api.auth('updateProfile', payload);
      if (res.code !== 0) {
        api.toast(res.message, 'error');
        return;
      }

      getApp().setUserInfo(res.data.user);
      api.toast('资料已保存', 'success');
      setTimeout(() => {
        const pages = getCurrentPages();
        // 从「我的」等页面 navigateTo 进来 → 返回上一页；直接从启动进入 → 回到「我的」
        if (pages.length > 1) wx.navigateBack();
        else wx.switchTab({ url: '/pages/mine/mine' });
      }, 600);
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 复用项目既有上传链路（与 publish 页同款）：
  // upload.getUploadPath 规范化路径 → wx.cloud.uploadFile 直传云存储。
  // scope=avatars 让路径落到 avatars/{openid}/ 而不是玩具的 toys/{openid}/，便于按用途分流清理。
  async uploadAvatar(tempFilePath) {
    try {
      wx.showLoading({ title: '上传中…', mask: true });
      const rawExt = (String(tempFilePath).split('.').pop() || 'jpg').toLowerCase();
      const ext = ['jpg', 'jpeg', 'png', 'webp'].indexOf(rawExt) >= 0 ? rawExt : 'jpg';
      const pathRes = await api.upload('getUploadPath', { ext, scope: 'avatars' });
      if (pathRes.code !== 0) {
        console.error('[profile] 获取上传路径失败:', pathRes.message);
        return '';
      }
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: pathRes.data.cloudPath,
        filePath: tempFilePath,
      });
      return (uploadRes && uploadRes.fileID) || '';
    } catch (e) {
      console.error('[profile] 头像上传失败:', e);
      return '';
    } finally {
      wx.hideLoading();
    }
  },
});
