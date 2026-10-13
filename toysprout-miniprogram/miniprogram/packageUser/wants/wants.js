// packageUser/wants/wants.js
// 「我想要的」：回看自己标记过「想要」的玩具。
// 数据来自 toy.listWants（wants 关系表 → toys），卡片复用 components/toy-card；
// 双列瀑布流沿用发现页同一套分列逻辑（utils/masonry.js），保持卡片手感一致。
'use strict';

const api = require('../../utils/api');
const { distributeColumns } = require('../../utils/masonry');

const PAGE_SIZE = 20;
// 单列宽度（rpx）：(750 − 页面内边距 24×2 − 列间距 20) / 2。
// 与 discover 的 COL_WIDTH_RPX 同义，仅用于分列时比较两列高度，不参与真实布局。
const COL_WIDTH_RPX = 341;

Page({
  data: {
    items: [], // 唯一真相源，左右两列都由它派生（与发现页同一套思路）
    leftCol: [],
    rightCol: [],
    total: 0,
    page: 0,
    hasMore: true,
    loading: true, // 首屏加载中
    loadingMore: false,
    loadError: false, // 首屏加载失败，用于展示"重试"而不是白屏
  },

  onLoad() {
    this.loadFirstPage();
  },

  onShow() {
    // 从详情页返回时玩具可能已被下架/兑换，静默刷新一次保持列表可信。
    // 首次进入由 onLoad 负责，这里用 _loaded 挡掉重复请求。
    if (this._loaded) this.loadFirstPage();
    this._loaded = true;
  },

  onPullDownRefresh() {
    this.loadFirstPage().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    this.loadMore();
  },

  fetchPage(page) {
    return api.toy('listWants', { page, limit: PAGE_SIZE }).then((res) => {
      if (res.code !== 0) return null;
      return res.data;
    });
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
    this.applyItems(res.items, res, 1, true);
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
    this.applyItems(res.items, res, next, false);
  },

  applyItems(incoming, meta, page, replace) {
    const flat = replace ? incoming : this.data.items.concat(incoming);
    this.setData(Object.assign(
      { items: flat, total: meta.total || 0, hasMore: !!meta.hasMore, page },
      this.buildColumns(flat)
    ));
  },

  buildColumns(items) {
    const { left, right } = distributeColumns(items, COL_WIDTH_RPX);
    return { leftCol: left, rightCol: right };
  },

  onRetry() {
    this.loadFirstPage();
  },

  onGoDiscover() {
    // 发现页是 tabBar 页，只能用 switchTab
    wx.switchTab({ url: '/pages/discover/discover' });
  },

  // 组件对外事件名是 `open`（不是 tap —— tap 会串原生事件，详见 toy-card.js 顶部注释）
  onToyOpen(e) {
    wx.navigateTo({ url: '/packageToy/detail/detail?id=' + e.detail.id });
  },

  // 卡片上的心形（或双击封面）在本页只有一个语义：取消想要。
  // 本页所有卡片 wanted 必为 true，因此收到 want 事件即视为「要移除」，先确认再调接口。
  onWantTap(e) {
    const id = e.detail && e.detail.id;
    if (id) this.confirmCancel(id);
  },

  // 长按卡片同样触发取消确认（外层 view 的 bindlongpress，事件从卡片内部冒泡上来）
  onCardLongPress(e) {
    const id = e.currentTarget.dataset.id;
    if (id) this.confirmCancel(id);
  },

  confirmCancel(id) {
    wx.showModal({
      title: '取消想要',
      content: '把这件玩具从「我想要的」里移除吗？',
      confirmText: '取消想要',
      confirmColor: '#C94324', // 令牌 --color-accent-strong
      cancelText: '再想想',
      success: (res) => { if (res.confirm) this.cancelWant(id); },
    });
  },

  async cancelWant(id) {
    const res = await api.toy('toggleWant', { toyId: id });
    if (res.code !== 0) {
      api.toast(res.message || '操作失败，请重试', 'error');
      return;
    }
    // 取消成功：直接从列表移除，无需整页重拉（toggleWant 返回 wanted=false 即已删除关系记录）
    const items = this.data.items.filter((t) => t.id !== id);
    this.setData(Object.assign(
      { items, total: Math.max(0, this.data.total - 1) },
      this.buildColumns(items)
    ));
    api.toast('已取消想要', 'success');
  },
});
