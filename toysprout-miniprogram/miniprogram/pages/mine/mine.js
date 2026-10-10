// pages/mine/mine.js
const api = require('../../utils/api');
const { CREDIT_META, formatDate } = require('../../utils/format');

const TOY_STATUS_LABEL = { available: '可交换', swapping: '交换中', exchanged: '已交换', removed: '已下架' };
// 生成星级数组供 wxml wx:for 渲染 SVG 图标（非 Unicode 符号），避免功能图标使用 emoji/特殊字符
function buildStars(rating) {
  return [1, 2, 3, 4, 5].map((i) => ({ filled: i <= rating }));
}

Page({
  data: {
    user: {},
    creditCls: '',
    creditLabel: '',
    creditPercent: 0,
    myToys: [],
    reviews: [],
    reviewTotal: 0,
    pointsBalance: 0,
  },

  onShow() {
    this.loadProfile();
    this.loadMyToys();
    this.loadReviews();
    this.loadPointsBalance();
  },

  async loadProfile() {
    // 静默登录已在 app.onLaunch 完成，正常情况不会 401。
    // 万一遇到（云环境异常、冷启动时序），也不能把用户"按"到某个登录页——
    // 先重试一次静默登录，仍失败就只提示、不跳转。
    let res = await api.user('getProfile', {});
    if (res.code === 401) {
      await getApp().silentLogin(true);
      res = await api.user('getProfile', {});
    }
    if (res.code !== 0) {
      api.toast(res.message || '资料加载失败', 'error');
      return;
    }
    const user = res.data.user;
    const cm = CREDIT_META[user.creditLevel] || CREDIT_META.sprout;
    const percent = Math.min(100, Math.max(0, ((user.creditScore - 500) / 500) * 100));
    this.setData({ user, creditCls: cm.cls, creditLabel: cm.label, creditPercent: percent });
  },

  async loadMyToys() {
    const res = await api.toy('mine', {});
    if (res.code === 0) {
      const myToys = res.data.items.map((t) => Object.assign({}, t, { statusLabel: TOY_STATUS_LABEL[t.status] || t.status }));
      this.setData({ myToys });
    }
  },

  async loadReviews() {
    const res = await api.review('listReceived', {});
    if (res.code === 0) {
      const reviews = res.data.items.map((r) => Object.assign({}, r, {
        stars: buildStars(r.rating),
        dateLabel: formatDate(r.createdAt),
      }));
      this.setData({ reviews, reviewTotal: res.data.total });
    }
  },

  async loadPointsBalance() {
    const res = await api.points('getBalance', {});
    if (res.code === 0) this.setData({ pointsBalance: res.data.balance || 0 });
  },

  onGoVerify() { wx.navigateTo({ url: '/packageUser/verify/verify' }); },
  onGoOrders() { wx.navigateTo({ url: '/packageSwap/orders/orders' }); },
  onGoAddresses() { wx.navigateTo({ url: '/packageUser/addresses/addresses' }); },
  onGoMembership() { wx.navigateTo({ url: '/packageUser/membership/membership' }); },
  onGoPointsWallet() { wx.navigateTo({ url: '/packageUser/points-wallet/points-wallet' }); },

  // 方案 A 之后没有"登录/退出登录"概念：身份由 openid 静默持有，
  // 用户能改的只是对外展示资料，所以入口从「退出」改为「编辑资料」。
  onEditProfile() { wx.navigateTo({ url: '/pages/profile/profile' }); },
});
