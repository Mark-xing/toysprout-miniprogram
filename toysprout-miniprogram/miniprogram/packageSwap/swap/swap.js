// packageSwap/swap/swap.js
const api = require('../../utils/api');
const { CONDITION_META, CATEGORY_NAMES, joinMeta } = require('../../utils/format');
const { requestSubscribe } = require('../../utils/subscribe');

Page({
  data: {
    loading: true,
    targetToy: {},
    targetConditionCls: '', targetConditionLabel: '',
    myToys: [],
    selectedMyToy: '',
    message: '',
    submitting: false,
  },

  onLoad(query) {
    this.targetToyId = query.targetToyId;
    if (!this.targetToyId) {
      wx.switchTab({ url: '/pages/discover/discover' });
      return;
    }
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    const [targetRes, mineRes] = await Promise.all([
      api.toy('detail', { id: this.targetToyId }),
      api.toy('mine', { status: 'available' }),
    ]);
    this.setData({ loading: false });

    if (targetRes.code !== 0) {
      api.toast(targetRes.message, 'error');
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }
    const t = targetRes.data;
    const cm = CONDITION_META[t.conditionLevel] || CONDITION_META.used;
    this.setData({ targetToy: t, targetConditionCls: cm.cls, targetConditionLabel: cm.label });

    if (mineRes.code === 0) {
      const myToys = mineRes.data.items.map((toy) => {
        const c = CONDITION_META[toy.conditionLevel] || CONDITION_META.used;
        return Object.assign({}, toy, {
          categoryLabel: CATEGORY_NAMES[toy.category] || toy.category,
          // 「品类 · 年龄段」整行在 JS 侧滤空拼接：WXML 会把 null 渲染成字面量「null」，
          // 直接写 {{item.categoryLabel}} · {{item.ageRange}} 岁 会显示「积木拼搭 · null 岁」。
          metaLabel: joinMeta([
            CATEGORY_NAMES[toy.category] || toy.category,
            toy.ageRange ? toy.ageRange + ' 岁' : '',
          ]),
          conditionCls: c.cls, conditionLabel: c.label,
        });
      });
      this.setData({ myToys });
    }
  },

  onSelectMyToy(e) {
    this.setData({ selectedMyToy: e.currentTarget.dataset.id });
  },
  onMessageInput(e) {
    this.setData({ message: e.detail.value });
  },

  async onSubmit() {
    // 订阅授权：必须在用户点击的**同步调用栈**里发起，因此放在方法第一行、任何 await 之前。
    // 不 await、不阻断主流程；用户拒绝或模板未申请时订阅封装内部自行跳过（见 utils/subscribe.js）。
    // 请求发起方后续会收到的模板：对方同意/拒绝、对方发货。
    requestSubscribe(['SWAP_ACCEPTED', 'SWAP_REJECTED', 'SWAP_SHIPPED']);

    // 发起交换会让对方看到你的昵称，属于「对外可见」操作：未设昵称先引导去设置。
    // 服务端 swap.create 有同样的兜底校验。
    if (!(await api.requireProfile())) return;
    if (!this.data.selectedMyToy) return api.toast('请选择一件自己的玩具用于交换', 'error');
    this.setData({ submitting: true });
    const res = await api.swap('create', {
      targetToyId: this.targetToyId,
      myToyId: this.data.selectedMyToy,
      message: this.data.message.trim(),
    });
    this.setData({ submitting: false });
    if (res.code === 0) {
      api.toast('交换意向已发出，等待对方确认', 'success');
      setTimeout(() => wx.redirectTo({ url: '/packageSwap/orders/orders' }), 800);
    } else {
      api.toast(res.message, 'error');
    }
  },
});
