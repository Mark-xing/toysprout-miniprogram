// packageSwap/order-detail/order-detail.js
const api = require('../../utils/api');
const { STATUS_META, fenToYuan, formatDate, joinMeta } = require('../../utils/format');

const SM_STEPS = [
  { key: 'requested', label: '已发起' },
  { key: 'accepted', label: '对方已同意' },
  { key: 'shipping', label: '双方邮寄中' },
  { key: 'received', label: '已收货' },
  { key: 'reviewed', label: '已互评' },
];
const SM_ORDER = { requested: 1, accepted: 2, shipping: 3, received: 4, reviewed: 5 };
const DISPUTE_TYPE_OPTIONS = [
  { value: 'item_mismatch', label: '货不对板' },
  { value: 'not_received', label: '未收到货' },
  { value: 'damaged', label: '收到损坏' },
  { value: 'other', label: '其他问题' },
];
const REVIEW_TAG_OPTIONS = ['成色如描述', '包装仔细', '沟通友好', '发货快'];

Page({
  data: {
    loading: true,
    swap: {},
    smSteps: [],
    myRoleLabel: '',
    myTrackingNo: '', otherTrackingNo: '',
    showShipForm: false, trackingInput: '',
    counterpartAddressText: '',
    feeBarText: '', feeBarCls: '',
    canRespond: false, canCancel: false, canPayFee: false, canConfirmReceipt: false,
    canReview: false, canDispute: false,
    payFeeLabel: '',
    disputeTypeOptions: DISPUTE_TYPE_OPTIONS.map((o) => o.label),
    disputeTypeIndex: 0, disputeTypeLabel: DISPUTE_TYPE_OPTIONS[0].label,
    disputeDesc: '',
    reviewVisible: false, reviewRating: 5, reviewTags: [], reviewComment: '',
    reviewTagOptions: REVIEW_TAG_OPTIONS,
  },

  onLoad(query) {
    this.swapId = query.id;
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    const res = await api.swap('detail', { id: this.swapId });
    this.setData({ loading: false });
    if (res.code !== 0) {
      api.toast(res.message, 'error');
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    this.render(res.data);
  },

  render(s) {
    const isInitiator = s.myRole === 'initiator';
    const sm = STATUS_META[s.status] || STATUS_META.requested;
    const myRoleLabel = isInitiator ? '你（发起方）' : '你（接收方）';

    let smSteps = [];
    if (!['cancelled', 'rejected', 'disputed'].includes(s.status)) {
      const curOrder = SM_ORDER[s.status] || 1;
      smSteps = SM_STEPS.map((step, i) => {
        const stepOrder = i + 1;
        let cls = '';
        if (stepOrder < curOrder) cls = 'st-done';
        else if (stepOrder === curOrder) cls = 'st-current';
        return Object.assign({}, step, { cls });
      });
    }

    const myTrackingNo = isInitiator ? s.initiatorTrackingNo : s.targetTrackingNo;
    const otherTrackingNo = isInitiator ? s.targetTrackingNo : s.initiatorTrackingNo;
    const fee = isInitiator ? s.serviceFeeAmountInitiator : s.serviceFeeAmountTarget;
    const paid = isInitiator ? s.serviceFeePaidByInitiator : s.serviceFeePaidByTarget;

    let feeBarText = '本单服务费 ¥1.9（会员免）· 双方发起快递时收取';
    let feeBarCls = '';
    if (paid) {
      feeBarText = `服务费已支付 ¥${fenToYuan(fee)}` + (fee === 0 ? '（会员免单）' : '');
      feeBarCls = 'notice-bar--success';
    }

    let counterpartAddressText = '';
    if (s.counterpartAddress) {
      const a = s.counterpartAddress;
      counterpartAddressText = `${a.receiverName} ${a.phone} · ${a.province}${a.city}${a.detail}`;
    }

    const myReceived = isInitiator ? s.initiatorReceivedAt : s.targetReceivedAt;

    this.setData({
      swap: Object.assign({}, s, {
        shortId: s.id.slice(0, 8),
        dateLabel: formatDate(s.createdAt),
        // 「订单 #xxx · 日期」整行在 JS 侧滤空拼接：dateLabel 无效时为 ''，
        // 交给 WXML 拼会留下悬空的分隔符（WXML 还会把 null 渲染成字面量「null」）。
        orderLine: joinMeta(['订单 #' + s.id.slice(0, 8), formatDate(s.createdAt)]),
        statusLabel: sm.label, statusCls: sm.cls,
        myToy: s.myToy || {}, targetToy: s.targetToy || {},
      }),
      smSteps,
      myRoleLabel,
      myTrackingNo: myTrackingNo || '', otherTrackingNo: otherTrackingNo || '',
      showShipForm: ['accepted', 'shipping'].includes(s.status) && !myTrackingNo,
      counterpartAddressText,
      feeBarText, feeBarCls,
      canRespond: s.status === 'requested' && !isInitiator,
      canCancel: ['requested', 'accepted'].includes(s.status),
      canPayFee: ['accepted', 'shipping'].includes(s.status) && !paid,
      payFeeLabel: fee === 0 ? '确认免单（会员）' : `支付服务费 ¥${fenToYuan(fee != null ? fee : 190)}`,
      canConfirmReceipt: s.status === 'shipping' && !myReceived,
      canReview: s.status === 'received',
      canDispute: !['reviewed', 'cancelled', 'disputed'].includes(s.status),
    });

    this.isInitiator = isInitiator;
  },

  onTrackingInput(e) { this.setData({ trackingInput: e.detail.value }); },
  async onShip() {
    if (!this.data.trackingInput.trim()) return api.toast('请填写快递单号', 'error');
    const res = await api.swap('ship', { id: this.swapId, trackingNo: this.data.trackingInput.trim() });
    if (res.code === 0) { api.toast(res.message || '运单已登记', 'success'); this.loadDetail(); }
    else api.toast(res.message, 'error');
  },

  async onAccept() {
    const res = await api.swap('respond', { id: this.swapId, accept: true });
    if (res.code === 0) { api.toast(res.message, 'success'); this.loadDetail(); }
    else api.toast(res.message, 'error');
  },
  async onReject() {
    const res = await api.swap('respond', { id: this.swapId, accept: false });
    if (res.code === 0) { api.toast(res.message, 'success'); this.loadDetail(); }
    else api.toast(res.message, 'error');
  },
  onCancel() {
    wx.showModal({
      title: '确认取消',
      content: '取消后双方玩具将退回交换池',
      success: async (r) => {
        if (!r.confirm) return;
        const res = await api.swap('cancel', { id: this.swapId });
        if (res.code === 0) { api.toast(res.message, 'success'); this.loadDetail(); }
        else api.toast(res.message, 'error');
      },
    });
  },
  async onPayFee() {
    const res = await api.swap('payFee', { id: this.swapId });
    if (res.code === 0) {
      api.toast(res.data.amountPaid === 0 ? '会员免服务费，已跳过支付' : `服务费 ¥${fenToYuan(res.data.amountPaid)} 支付成功`, 'success');
      this.loadDetail();
    } else api.toast(res.message, 'error');
  },
  async onConfirmReceipt() {
    const res = await api.swap('confirmReceipt', { id: this.swapId });
    if (res.code === 0) { api.toast(res.message, 'success'); this.loadDetail(); }
    else api.toast(res.message, 'error');
  },

  // 纠纷
  onDisputeTypeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ disputeTypeIndex: idx, disputeTypeLabel: DISPUTE_TYPE_OPTIONS[idx].label });
  },
  onDisputeDescInput(e) { this.setData({ disputeDesc: e.detail.value }); },
  async onSubmitDispute() {
    if (!this.data.disputeDesc.trim()) return api.toast('请描述纠纷情况', 'error');
    const res = await api.swap('dispute', {
      id: this.swapId,
      type: DISPUTE_TYPE_OPTIONS[this.data.disputeTypeIndex].value,
      description: this.data.disputeDesc.trim(),
    });
    if (res.code === 0) { api.toast(res.message, 'success'); this.loadDetail(); }
    else api.toast(res.message, 'error');
  },

  // 评价浮层
  onOpenReview() { this.setData({ reviewVisible: true, reviewRating: 5, reviewTags: [], reviewComment: '' }); },
  onCloseReview() { this.setData({ reviewVisible: false }); },
  onStarTap(e) { this.setData({ reviewRating: Number(e.currentTarget.dataset.v) }); },
  onTagToggle(e) {
    const tag = e.currentTarget.dataset.tag;
    const tags = this.data.reviewTags.slice();
    const idx = tags.indexOf(tag);
    if (idx > -1) tags.splice(idx, 1); else tags.push(tag);
    this.setData({ reviewTags: tags });
  },
  onReviewCommentInput(e) { this.setData({ reviewComment: e.detail.value }); },
  async onSubmitReview() {
    const res = await api.swap('review', {
      id: this.swapId,
      rating: this.data.reviewRating,
      tags: this.data.reviewTags,
      comment: this.data.reviewComment.trim(),
    });
    if (res.code === 0) {
      api.toast(res.message, 'success');
      this.setData({ reviewVisible: false });
      this.loadDetail();
    } else {
      api.toast(res.message, 'error');
    }
  },
});
