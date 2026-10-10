// packageUser/points-wallet/points-wallet.js
// 积分钱包：余额 + 流水（business-model-v3.md §2.1 积分资产沉淀）
const api = require('../../utils/api');
const { formatDate } = require('../../utils/format');

const TYPE_LABEL = {
  redeem_spend: '积分兑换消耗',
  redeem_earn: '玩具被兑换入账',
  redeem_refund: '兑换取消退还',
  redeem_reverse: '兑换取消冲正',
  adjust: '积分调整',
};

Page({
  data: {
    loading: true,
    balance: 0,
    ledger: [],
  },

  onShow() {
    this.loadBalance();
  },

  async loadBalance() {
    this.setData({ loading: true });
    const res = await api.points('getBalance', {});
    this.setData({ loading: false });
    if (res.code !== 0) return api.toast(res.message, 'error');
    const ledger = (res.data.ledger || []).map((l) => Object.assign({}, l, {
      typeLabel: TYPE_LABEL[l.type] || l.type,
      dateLabel: formatDate(l.createdAt, true),
      isPositive: l.delta > 0,
    }));
    this.setData({ balance: res.data.balance, ledger });
  },
});
