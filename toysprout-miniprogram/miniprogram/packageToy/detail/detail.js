// packageToy/detail/detail.js
const api = require('../../utils/api');
const { CONDITION_META, CREDIT_META, CATEGORY_NAMES, formatDate, joinMeta } = require('../../utils/format');

Page({
  data: {
    loading: true,
    toy: {},
    conditionCls: '', conditionLabel: '',
    creditCls: '', creditLabel: '',
    hasOwnerAvatar: false, // 作者头像可用性；外链加载失败时回落到灰底占位，避免破图
    isMine: false, // 是否自己发布的玩具。由服务端 toy.detail 基于 cloud.getWXContext().OPENID 计算，
                   // 不要在前端拿 userInfo.id 比 ownerId —— 前者是数据库 _id，后者是 openid，不是一回事。
    previewError: '', // previewShipping 失败时的服务端 message；点击兑换时如实告知原因，避免「点了没反应」
    metaLine: '', // 「品类 · 城市 · 发布于日期」整行，在 JS 侧滤空拼接（见下方注释）
    creditLine: '', // 「信用等级 · 信用分」整行，同上
    reviewSummaryText: '',
    // 积分双向流通（business-model-v3.md §2.1/§2.2）：运费归属预览 + 积分兑换状态
    shippingPreview: null, // { sameCity, shippingPayer, shippingNote, pointsRequired, myBalance, sufficientBalance }
    redeeming: false,
  },

  onLoad(query) {
    this.toyId = query.id;
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    const res = await api.toy('detail', { id: this.toyId });
    this.setData({ loading: false });
    if (res.code !== 0) {
      api.toast(res.message, 'error');
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const t = res.data;
    const cm = CONDITION_META[t.conditionLevel] || CONDITION_META.used;
    const owner = t.owner || {};
    const cr = CREDIT_META[owner.creditLevel] || CREDIT_META.sprout;
    const rs = t.reviewSummary || {};
    this.setData({
      toy: Object.assign({}, t, {
        categoryLabel: CATEGORY_NAMES[t.category] || t.category,
        dateLabel: formatDate(t.createdAt),
      }),
      conditionCls: cm.cls, conditionLabel: cm.label,
      creditCls: cr.cls, creditLabel: cr.label,
      // 这两行有可选片段（city 可能为 null、creditScore 可能缺失）。
      // 不能交给 WXML 拼：**WXML 会把 null 渲染成字面量「null」**，实测页面真的出现过
      // 「积木拼搭 · null · 发布于 2026-10-10」。所以统一在 JS 侧用 joinMeta 滤空。
      metaLine: joinMeta([CATEGORY_NAMES[t.category] || t.category, t.city, '发布于 ' + formatDate(t.createdAt)]),
      creditLine: joinMeta([cr.label, owner.creditScore]),
      hasOwnerAvatar: !!owner.avatarUrl,
      isMine: !!t.isMine,
      reviewSummaryText: rs.count ? `收到评价 ${rs.avgRating} 星 / 共 ${rs.count} 条` : '还没有收到评价',
    });
    this.loadShippingPreview();
  },

  async loadShippingPreview() {
    const res = await api.points('previewShipping', { toyId: this.toyId });
    if (res.code === 0) {
      this.setData({ shippingPreview: res.data, previewError: '' });
    } else {
      // 记录失败原因。注意：自有玩具会必然走到这里（服务端 400「不能兑换自己发布的玩具」），
      // 这是预期内的，由 isMine 分支负责给出正确文案，不算异常。
      this.setData({ shippingPreview: null, previewError: res.message || '' });
    }
  },

  onSwapTap() {
    // 自己的玩具在 swap.create 侧同样会被 400 拒绝（_openid === openid）。
    // 按钮本该被隐藏，这里再兜一层，确保任何情况下都不会「点了没反应」。
    if (this.data.isMine) return api.toast('这是你发布的玩具，不能与自己交换', 'error');
    wx.navigateTo({ url: '/packageSwap/swap/swap?targetToyId=' + this.toyId });
  },

  async onRedeemTap() {
    // 自己的玩具：服务端 swap.redeemWithPoints 必然 400 拒绝。按钮本该被隐藏，
    // 这里再兜一层，确保任何情况下都不会「点了没反应」。
    if (this.data.isMine) return api.toast('这是你发布的玩具，不能兑换自己的玩具', 'error');
    // 积分兑换同样会暴露昵称给对方，属「对外可见」操作。服务端 swap.redeemWithPoints 有同样兜底校验。
    // requireProfile 自己会弹「先设置一下昵称」弹窗，不算静默
    if (!(await api.requireProfile())) return;
    const sp = this.data.shippingPreview;
    if (!sp) {
      // 预览没拿到（接口失败 / 还在加载 / 网络异常）—— 之前这里直接 return，
      // 用户点按钮零反馈，被当成「按钮坏了」。现在如实告知并重试一次。
      api.toast(this.data.previewError || '暂时无法获取兑换信息，请稍后重试', 'error');
      this.loadShippingPreview();
      return;
    }
    if (!sp.sufficientBalance) {
      return api.toast(`积分不足（需要 ${sp.pointsRequired}，当前 ${sp.myBalance}），先去发布闲置玩具赚积分吧`, 'error');
    }
    wx.showModal({
      title: '确认用积分兑换',
      content: `将消耗 ${sp.pointsRequired} 积分兑换该玩具。${sp.shippingNote}`,
      success: (r) => { if (r.confirm) this.doRedeem(); },
    });
  },

  async doRedeem() {
    this.setData({ redeeming: true });
    const res = await api.swap('redeemWithPoints', { toyId: this.toyId });
    this.setData({ redeeming: false });
    if (res.code === 0) {
      api.toast(res.message || '兑换成功', 'success');
      setTimeout(() => wx.redirectTo({ url: '/packageSwap/order-detail/order-detail?id=' + res.data.id }), 800);
    } else {
      api.toast(res.message, 'error');
    }
  },

  // 作者头像加载失败（外链未加白名单 / 换签名链接过期 / 文件被删）时回落到灰底占位圆，
  // 不要在作者卡上留一个 48px 的破图图标。
  onOwnerAvatarError() {
    this.setData({ hasOwnerAvatar: false });
  },

  onShareAppMessage() {
    return { title: this.data.toy.title || '童芽 ToySprout', path: '/packageToy/detail/detail?id=' + this.toyId };
  },
});
