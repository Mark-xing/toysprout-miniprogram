// pages/discover/discover.js
// 发现页：小红书式双列瀑布流信息流。
//
// 布局要点：
//   1. 使用 navigationStyle: custom，状态栏高度 / 导航行高 / 右侧胶囊避让全部自己算；
//   2. 顶部固定（搜索 + 品类 Tab），瀑布流放在 scroll-view 里独立滚动，
//      这样下拉刷新、触底加载都由 scroll-view 承担，天然不会把顶栏一起滚走；
//   3. 分列交给 utils/masonry.js，卡片高度由 id 派生的确定性比例决定，翻页/点赞都不会让卡片挪位。
'use strict';

const api = require('../../utils/api');
const { CATEGORY_NAMES } = require('../../utils/format');
const { distributeColumns } = require('../../utils/masonry');

const PAGE_SIZE = 20;
// 单列宽度（rpx）：(750 − 页边距 20×2 − 列间距 20) / 2。
// 因为页边距与列间距都用 rpx 表达，这个值是设备无关的，不需要按屏宽换算。
const COL_WIDTH_RPX = 345;

const TABS = [{ value: '', label: '全部' }].concat(
  Object.keys(CATEGORY_NAMES).map((k) => ({ value: k, label: CATEGORY_NAMES[k] }))
);
const CONDITION_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'new', label: '全新' },
  { value: '9new', label: '9成新' },
  { value: '8new', label: '8成新' },
  { value: 'used', label: '有使用痕迹' },
];
// 骨架屏的封面比例档位，与真实卡片的错落档位同源，避免"骨架是一个样、真内容另一个样"
const SKELETON_PADS = [126, 82, 118, 100, 92, 126];

Page({
  data: {
    // 自定义导航的几何量（px）
    statusBarHeight: 20,
    navBarHeight: 44,
    navRight: 96,

    tabs: TABS,
    conditionOptions: CONDITION_OPTIONS,
    tabIntoView: '',

    keyword: '',
    categoryFilter: '',
    conditionFilter: '',
    creditFilter: false,
    activeFilterCount: 0,

    items: [], // 已加载的全部玩具，是唯一的真相源；左右两列都由它派生
    leftCol: [],
    rightCol: [],
    total: 0,
    page: 0,
    hasMore: true,

    loading: true,
    loadingMore: false,
    refreshing: false,
    filterVisible: false,

    skelLeft: SKELETON_PADS.map((p, i) => ({ p, i })).filter((x) => x.i % 2 === 0),
    skelRight: SKELETON_PADS.map((p, i) => ({ p, i })).filter((x) => x.i % 2 === 1),
  },

  onLoad() {
    this.measureNav();
    this.loadFirstPage();
  },

  onShow() {
    // 从详情页返回时，玩具可能已被下架/已被兑换，静默刷新一次保持列表可信。
    // 首次进入时 onLoad 已经拉过，这里用 _loaded 挡掉重复请求。
    if (this._loaded) this.loadFirstPage();
    this._loaded = true;
  },

  // 自定义导航必须自己算三个量：状态栏高度、导航行高、右侧给微信胶囊留的空位。
  // 尤其是 navRight——不扣掉胶囊宽度，搜索框就会被胶囊压住，这是自定义导航最常见的翻车点。
  measureNav() {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = win.statusBarHeight || 20;
    // 兜底：88rpx 转 px（375 宽屏约 44px），保证没有胶囊 API 时也不会挤成一团
    let navBarHeight = Math.round((88 * win.windowWidth) / 750);
    let navRight = 96;
    try {
      const menu = wx.getMenuButtonBoundingClientRect();
      if (menu && menu.height && menu.left) {
        // 标准算法：胶囊上下留白相等 → 行高 = (胶囊顶 − 状态栏高) × 2 + 胶囊高
        navBarHeight = Math.max((menu.top - statusBarHeight) * 2 + menu.height, navBarHeight);
        navRight = win.windowWidth - menu.left + 8;
      }
    } catch (e) {
      console.warn('[discover] 胶囊几何获取失败，使用默认值:', e && e.message);
    }
    this.setData({ statusBarHeight, navBarHeight, navRight });
  },

  // ---------- 顶部交互 ----------
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },
  onSearchConfirm() {
    this.loadFirstPage();
  },
  onClearKeyword() {
    this.setData({ keyword: '' });
    this.loadFirstPage();
  },

  onCategoryTap(e) {
    const { value, index } = e.currentTarget.dataset;
    if (value === this.data.categoryFilter) return;
    // 选中项自动滚到可视区，长列表滑到右边后点选不会"跳回去"
    this.setData({ categoryFilter: value, tabIntoView: 'dtab-' + index });
    this.loadFirstPage();
  },

  // 抽屉里的成色/信用只改本地，等用户点"查看结果"再请求一次，
  // 避免在抽屉里连点几下就打几次云函数。
  onConditionTap(e) {
    this.setData({ conditionFilter: e.currentTarget.dataset.value });
    this.syncFilterCount();
  },
  onCreditToggle() {
    this.setData({ creditFilter: !this.data.creditFilter });
    this.syncFilterCount();
  },
  syncFilterCount() {
    let n = 0;
    if (this.data.conditionFilter) n++;
    if (this.data.creditFilter) n++;
    this.setData({ activeFilterCount: n });
  },
  onOpenFilter() {
    this.setData({ filterVisible: true });
  },
  onCloseFilter() {
    this.setData({ filterVisible: false });
    this.loadFirstPage();
  },
  onResetFilter() {
    this.setData({ conditionFilter: '', creditFilter: false, activeFilterCount: 0 });
  },
  noop() {},

  onEmptyAction() {
    if (this.data.activeFilterCount || this.data.keyword || this.data.categoryFilter) {
      this.setData({
        keyword: '', categoryFilter: '', conditionFilter: '', creditFilter: false, activeFilterCount: 0,
      });
      this.loadFirstPage();
      return;
    }
    this.onGoPublish();
  },
  onGoPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
  },

  // ---------- 数据 ----------
  fetchPage(page) {
    const { keyword, categoryFilter, conditionFilter, creditFilter } = this.data;
    return api.toy('list', {
      keyword: keyword || undefined,
      category: categoryFilter || undefined,
      condition: conditionFilter || undefined,
      creditVerified: creditFilter || undefined,
      page,
      limit: PAGE_SIZE,
    }).then((res) => {
      if (res.code !== 0) {
        api.toast(res.message, 'error');
        return null;
      }
      return res.data;
    });
  },

  async loadFirstPage() {
    this.setData({ loading: true, hasMore: true, page: 0 });
    const res = await this.fetchPage(1);
    this.setData({ loading: false });
    if (!res) return;
    this.applyItems(res.items, res, 1, true);
  },

  async onLoadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    const next = this.data.page + 1;
    const res = await this.fetchPage(next);
    this.setData({ loadingMore: false });
    if (!res) return;
    this.applyItems(res.items, res, next, false);
  },

  async onRefresh() {
    this.setData({ refreshing: true, hasMore: true });
    const res = await this.fetchPage(1);
    this.setData({ refreshing: false });
    if (!res) return;
    this.applyItems(res.items, res, 1, true);
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

  // 改单张卡片并重算分列。确定性比例保证重算后列归属不变，所以不会看到卡片跳动。
  patchItem(id, patch) {
    const items = this.data.items.slice();
    const i = items.findIndex((t) => t.id === id);
    if (i < 0) return null;
    const prev = { wanted: items[i].wanted, wantCount: items[i].wantCount };
    items[i] = Object.assign({}, items[i], patch);
    this.setData(Object.assign({ items }, this.buildColumns(items)));
    return prev;
  },

  onToyTap(e) {
    wx.navigateTo({ url: '/packageToy/detail/detail?id=' + e.detail.id });
  },

  // 想要：先乐观翻转再等服务端。
  // 信息流滑动时一次云函数往返足够长，等结果回来才变心形会让人觉得"点了没反应"；
  // 服务端返回后以它的计数为准校正，失败则整体回滚。
  async onWant(e) {
    const { id, wanted } = e.detail;
    const idx = this.data.items.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const before = { wanted: this.data.items[idx].wanted, wantCount: this.data.items[idx].wantCount };

    this.patchItem(id, {
      wanted,
      wantCount: Math.max(0, (before.wantCount || 0) + (wanted ? 1 : -1)),
    });

    const res = await api.toy('toggleWant', { toyId: id });
    if (res.code !== 0) {
      this.patchItem(id, before);
      api.toast(res.message, 'error');
      return;
    }
    this.patchItem(id, { wanted: res.data.wanted, wantCount: res.data.wantCount });
  },

  onShareAppMessage() {
    return { title: '童芽 ToySprout · 闲置玩具一换一', path: '/pages/discover/discover' };
  },
});
