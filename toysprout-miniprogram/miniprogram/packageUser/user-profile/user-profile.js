// packageUser/user-profile/user-profile.js
// 他人主页：展示某位用户的公开资料 + 在架玩具 + 收到的评价。
//
// 路由参数 id = users._id（**不是** openid —— openid 属敏感标识，不下发前端）。
// 数据来自云函数 user.getPublicProfile（复用 _shared/publicUser.js 构造用户体，并剥离 phone）。
// 玩具列表复用 components/toy-card，与发现页/「我想要的」同一套卡片与手势契约。
'use strict';

const api = require('../../utils/api');
const { CREDIT_META, formatDate, joinMeta } = require('../../utils/format');
const { distributeColumns } = require('../../utils/masonry');

// 单列宽度（rpx）：(750 − 页面内边距 24×2 − 列间距 20) / 2，与 discover / wants 同义。
// 仅用于分列时比较两列高度，不参与真实布局。
const COL_WIDTH_RPX = 341;

// 星级数组供 wxml 渲染 SVG 图标（非 Unicode 符号），与 mine 页同一写法。
function buildStars(rating) {
  return [1, 2, 3, 4, 5].map((i) => ({ filled: i <= rating }));
}

Page({
  data: {
    loading: true,
    loadError: false, // 首屏加载失败，用于展示「重试」而不是白屏
    user: {}, // 公开资料（含 isSelf / blocked 两个服务端计算的标记）
    creditCls: '',
    creditLabel: '',
    metaLine: '', // 「城市 · 实名 · 会员」整行，JS 侧滤空拼接（WXML 会把 null 渲染成字面量「null」）
    toys: [], // 唯一真相源，左右两列由它派生
    leftCol: [],
    rightCol: [],
    reviews: [],
    reviewTotal: 0,
    avgRatingText: '',
    reportVisible: false,
    blocking: false,
  },

  onLoad(query) {
    this.userId = query.id;
    this.loadProfile();
  },

  onPullDownRefresh() {
    this.loadProfile().then(() => wx.stopPullDownRefresh());
  },

  async loadProfile() {
    this.setData({ loading: true, loadError: false });
    const res = await api.user('getPublicProfile', { userId: this.userId });
    this.setData({ loading: false });
    if (res.code !== 0) {
      // 加载失败必须明确反馈（toast + 页面内可重试），不能白屏
      this.setData({ loadError: true });
      api.toast(res.message || '加载失败，请重试', 'error');
      return;
    }
    const d = res.data || {};
    const u = d.user || {};
    const cm = CREDIT_META[u.creditLevel] || CREDIT_META.sprout;
    const toys = d.toys || [];
    const reviews = (d.reviews || []).map((r) => Object.assign({}, r, {
      stars: buildStars(r.rating),
      dateLabel: formatDate(r.createdAt),
      reviewerName: (r.reviewer && r.reviewer.name) || '家长',
    }));
    this.setData(Object.assign({
      user: u,
      creditCls: cm.cls,
      creditLabel: cm.label,
      metaLine: joinMeta([u.city, u.isVerified ? '已实名' : '未实名', u.isMember ? '会员' : null]),
      toys,
      reviews,
      reviewTotal: d.reviewTotal || 0,
      avgRatingText: d.avgRating != null
        ? `收到评价 ${d.avgRating} 星 / 共 ${d.reviewTotal} 条`
        : '还没有收到评价',
    }, this.buildColumns(toys)));
  },

  buildColumns(items) {
    const { left, right } = distributeColumns(items, COL_WIDTH_RPX);
    return { leftCol: left, rightCol: right };
  },

  onRetry() {
    this.loadProfile();
  },

  // 组件对外事件名是 open / want（非原生名，详见 toy-card.js 顶部注释），页面侧用 bind:open / bind:want
  onToyOpen(e) {
    const id = e.detail && e.detail.id;
    if (!id) return api.toast('无法打开该玩具', 'error');
    wx.navigateTo({ url: '/packageToy/detail/detail?id=' + id });
  },

  async onWantTap(e) {
    const id = e.detail && e.detail.id;
    if (!id) return;
    const toy = this.data.toys.find((t) => t.id === id);
    if (!toy) return;
    // 自己发布的玩具点想要必然被服务端 400 拒绝（toggleWant 的 `_openid === openid`），
    // 不给注定失败的操作入口。
    if (toy.isMine) return api.toast('这是你自己发布的玩具', 'error');
    const res = await api.toy('toggleWant', { toyId: id });
    if (res.code !== 0) {
      api.toast(res.message || '操作失败，请重试', 'error');
      return;
    }
    const toys = this.data.toys.map((t) => (t.id === id
      ? Object.assign({}, t, { wanted: res.data.wanted, wantCount: res.data.wantCount })
      : t));
    this.setData(Object.assign({ toys }, this.buildColumns(toys)));
  },

  onBlockTap() {
    const blocked = !!this.data.user.blocked;
    wx.showModal({
      title: blocked ? '取消拉黑' : '拉黑该用户',
      content: blocked
        ? '取消后，TA 发布的玩具会重新出现在你的发现页'
        : '拉黑后，TA 发布的玩具将不再出现在你的发现页',
      confirmText: blocked ? '取消拉黑' : '拉黑',
      confirmColor: '#C94324', // 令牌 --color-accent-strong
      success: (r) => { if (r.confirm) this.doBlockToggle(blocked); },
    });
  },

  async doBlockToggle(blocked) {
    if (this.data.blocking) return;
    this.setData({ blocking: true });
    const res = await api.user(blocked ? 'unblock' : 'block', { userId: this.userId });
    this.setData({ blocking: false });
    if (res.code !== 0) {
      api.toast(res.message || '操作失败，请重试', 'error');
      return;
    }
    api.toast(res.message || (blocked ? '已取消拉黑' : '已拉黑'), 'success');
    this.setData({ 'user.blocked': !blocked });
  },

  onReportTap() {
    this.setData({ reportVisible: true });
  },
  onReportClose() {
    this.setData({ reportVisible: false });
  },
  async onReportSubmit(e) {
    const detail = e.detail || {};
    const res = await api.user('createReport', {
      targetType: 'user',
      targetId: this.userId,
      reason: detail.reason,
      description: detail.description || '',
    });
    if (res.code === 0) {
      this.setData({ reportVisible: false });
      api.toast(res.message || '举报已提交', 'success');
    } else {
      // 失败保留弹层，让用户能改原因后重试（不静默）
      api.toast(res.message || '举报失败，请重试', 'error');
    }
  },

  onShareAppMessage() {
    return {
      title: (this.data.user.name || '童芽家长') + ' 的童芽主页',
      path: '/packageUser/user-profile/user-profile?id=' + this.userId,
    };
  },
});
