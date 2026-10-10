// packageSwap/orders/orders.js
const api = require('../../utils/api');
const { STATUS_META, formatDate } = require('../../utils/format');

const ORDER_PRIORITY = { disputed: 0, requested: 1, accepted: 2, shipping: 3, received: 4, reviewed: 5, rejected: 6, cancelled: 7 };

Page({
  data: { loading: true, items: [] },

  onShow() {
    this.loadOrders();
  },

  async loadOrders() {
    this.setData({ loading: true });
    const listRes = await api.swap('list', {});
    if (listRes.code !== 0) {
      this.setData({ loading: false });
      return api.toast(listRes.message, 'error');
    }
    // 列表接口不带玩具标题，逐单补充详情（订单量小，MVP阶段可接受并行请求）
    const details = await Promise.all(listRes.data.items.map((s) => api.swap('detail', { id: s.id })));
    const items = details
      .filter((d) => d.code === 0)
      .map((d) => d.data)
      .sort((a, b) => (ORDER_PRIORITY[a.status] ?? 9) - (ORDER_PRIORITY[b.status] ?? 9))
      .map((s) => {
        const sm = STATUS_META[s.status] || STATUS_META.requested;
        return {
          id: s.id,
          shortId: s.id.slice(0, 8),
          statusLabel: sm.label,
          statusCls: sm.cls,
          myToyTitle: s.myToy ? s.myToy.title : '—',
          targetToyTitle: s.targetToy ? s.targetToy.title : '—',
          dateLabel: formatDate(s.createdAt),
        };
      });
    this.setData({ loading: false, items });
  },

  onOrderTap(e) {
    wx.navigateTo({ url: '/packageSwap/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },
});
