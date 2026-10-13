// components/report-sheet/report-sheet.js
// 举报弹层（举报玩具 / 举报用户共用）：选原因 → 填补充说明（选填）→ 提交。
//
// ⚠️ 对外事件名用 `close` / `report`，**绝不能**叫 `tap` / `submit` 等小程序原生事件名。
// 原因见 toy-card.js 顶部踩坑注释：组件内部的原生事件会冒泡出组件边界，直接命中父级写在
// 组件标签上的 bind:<原生名>，父级收到的是原生 detail（如 tap 的 {x,y}）而不是我们
// triggerEvent 传的 detail。这里同样用 EVT_ 常量，保证 scripts/check-event-contract.js 能静态解析。
'use strict';

// 举报原因枚举：value 必须与云函数 user.createReport 的 REPORT_REASONS 一一对应；
// label 仅前端展示。改这里务必同步改 cloudfunctions/user/index.js。
const REASONS = [
  { value: 'fake', label: '虚假信息' },
  { value: 'prohibited', label: '违禁品' },
  { value: 'fraud', label: '欺诈' },
  { value: 'inappropriate', label: '不当内容' },
  { value: 'other', label: '其他' },
];

const EVT_CLOSE = 'close';
const EVT_REPORT = 'report';

Component({
  // ⚠️ 必须开 addGlobalClass：本组件复用 app.wxss 的 .card / .btn / .opt-chip / .textarea，
  // 默认样式隔离下 app.wxss 的 class 对组件内节点完全无效（详见 toy-card.js 同款注释）。
  options: { addGlobalClass: true },
  properties: {
    visible: { type: Boolean, value: false },
    title: { type: String, value: '举报' },
  },
  data: {
    reasons: REASONS,
    selected: '',
    description: '',
  },
  observers: {
    // 每次重新打开都清空上一次的选择与输入，避免「上次选了原因，这次直接提交」的误操作。
    visible(v) {
      if (v) this.setData({ selected: '', description: '' });
    },
  },
  methods: {
    onPickReason(e) {
      const value = e.currentTarget.dataset.value;
      if (value) this.setData({ selected: value });
    },
    onDescInput(e) {
      this.setData({ description: e.detail.value || '' });
    },
    // 点遮罩 / 取消按钮 → 关闭
    onClose() {
      this.triggerEvent(EVT_CLOSE);
    },
    // 弹层卡片自身的点击不能关掉弹层（WXML 用 catchtap 拦住冒泡，这里只做占位）
    noop() {},
    onSubmit() {
      if (!this.data.selected) {
        // 失败分支必须有可见反馈，禁止静默 return
        wx.showToast({ title: '请先选择举报原因', icon: 'none' });
        return;
      }
      this.triggerEvent(EVT_REPORT, {
        reason: this.data.selected,
        description: (this.data.description || '').trim(),
      });
    },
  },
});
