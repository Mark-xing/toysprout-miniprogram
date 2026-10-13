// pages/messages/messages.js
// 站内消息中心：展示交换流程各状态变更产生的消息（发起/同意/拒绝/发货/收货/互评/系统），
// 支持未读标记、点击跳转对应订单、全部已读、下拉刷新与触底加载。
//
// 数据来自 notify 云函数（list / markRead / markAllRead），
// 消息由 swap 云函数在各状态流转处经 _shared/notify.js 写入 notifications 集合。
'use strict';

const api = require('../../utils/api');
const { formatDate } = require('../../utils/format');

const PAGE_SIZE = 20;

Page({
  data: {
    items: [],
    unreadCount: 0,
    total: 0,
    page: 0,
    hasMore: true,
    loading: true, // 首屏加载中
    loadingMore: false,
    loadError: false, // 首屏加载失败：展示「重试」而不是白屏
  },

  onLoad() {
    this.loadFirstPage();
  },

  onShow() {
    // 从订单详情返回时消息可能已变化（如刚点击某条已读），静默刷新一次保持未读数新鲜。
    // 首次进入由 onLoad 负责，用 _loaded 挡掉重复请求。
    if (this._loaded) this.loadFirstPage();
    this._loaded = true;
  },

  onPullDownRefresh() {
    this.loadFirstPage().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  async fetchPage(page) {
    const res = await api.notify('list', { page, limit: PAGE_SIZE });
    if (res.code !== 0) return null;
    return res.data;
  },

  async loadFirstPage() {
    this.setData({ loading: true, loadError: false, hasMore: true, page: 0 });
    const res = await this.fetchPage(1);
    if (!res) {
      // 加载失败必须明确反馈（toast + 页面内可重试），不能白屏
      this.setData({ loading: false, loadError: true });
      api.toast('加载失败，请重试', 'error');
      return;
    }
    this.applyItems(res.items || [], res, 1, true);
    this.setData({ loading: false, loadError: false });
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    const next = this.data.page + 1;
    const res = await this.fetchPage(next);
    this.setData({ loadingMore: false });
    if (!res) {
      api.toast('加载更多失败，请重试', 'error');
      return;
    }
    this.applyItems(res.items || [], res, next, false);
  },

  applyItems(incoming, meta, page, replace) {
    // 时间在 JS 侧格式化：云数据库的 createdAt 是 Date/ISO，直接丢给 WXML 会渲染成英文星期串。
    const mapped = incoming.map((n) => Object.assign({}, n, {
      timeLabel: formatDate(n.createdAt, true),
    }));
    const items = replace ? mapped : this.data.items.concat(mapped);
    this.setData({
      items,
      total: meta.total || 0,
      hasMore: !!meta.hasMore,
      page,
      unreadCount: typeof meta.unreadCount === 'number' ? meta.unreadCount : this.data.unreadCount,
    });
  },

  onRetry() {
    this.loadFirstPage();
  },

  onGoDiscover() {
    // 发现页是 tabBar 页，只能用 switchTab
    wx.switchTab({ url: '/pages/discover/discover' });
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find((n) => n.id === id);
    if (!item) return;
    // 先标记已读（乐观更新 + 后台请求，失败会 toast），再按 targetType 跳转。
    // 未读的才请求；已读的不重复打接口。
    if (!item.read) this.markRead(item);
    this.navigateToTarget(item);
  },

  // 乐观更新：本地立即置为已读并减少未读数（手感即时），随后请求服务端；
  // 成功以服务端返回的未读数为准，失败则回滚并 toast（避免「看着已读、其实未读」）。
  async markRead(item) {
    const optimistic = this.data.items.map((n) => (n.id === item.id ? Object.assign({}, n, { read: true }) : n));
    this.setData({ items: optimistic, unreadCount: Math.max(0, this.data.unreadCount - 1) });

    const res = await api.notify('markRead', { id: item.id });
    if (res.code !== 0) {
      api.toast(res.message || '标记已读失败', 'error');
      const rollback = this.data.items.map((n) => (n.id === item.id ? Object.assign({}, n, { read: false }) : n));
      this.setData({ items: rollback, unreadCount: this.data.unreadCount + 1 });
      return;
    }
    if (res.data && typeof res.data.unreadCount === 'number') {
      this.setData({ unreadCount: res.data.unreadCount });
    }
  },

  // 跳转映射：swap -> 订单详情；points -> 积分钱包；system / 无 targetId -> 不跳转（仅已读）。
  navigateToTarget(item) {
    if (item.targetType === 'swap' && item.targetId) {
      wx.navigateTo({ url: '/packageSwap/order-detail/order-detail?id=' + item.targetId });
    } else if (item.targetType === 'points') {
      wx.navigateTo({ url: '/packageUser/points-wallet/points-wallet' });
    }
  },

  onMarkAllRead() {
    if (this.data.unreadCount === 0) return; // 按钮已禁用，双保险
    wx.showModal({
      title: '全部标为已读',
      content: '把当前所有未读消息都标记为已读？',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '处理中…', mask: true });
        const res = await api.notify('markAllRead', {});
        wx.hideLoading();
        if (res.code !== 0) {
          api.toast(res.message || '操作失败，请重试', 'error');
          return;
        }
        const items = this.data.items.map((n) => Object.assign({}, n, { read: true }));
        this.setData({ items, unreadCount: 0 });
        api.toast('已全部标为已读', 'success');
      },
    });
  },
});
