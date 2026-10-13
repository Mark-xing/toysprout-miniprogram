// components/toy-card/toy-card.js
// 发现页瀑布流卡片（小红书风格：图片优先 + 轻量手势 + 即时反馈）。
//
// 组件是纯展示层：wanted / wantCount 全部来自 toy 属性，自身不做状态缓存。
// 这样"想要"的乐观更新统一由页面写回数据源，再顺着属性流下来，只有一处真相。
const { CONDITION_META, CREDIT_META, CATEGORY_NAMES } = require('../../utils/format');
const { cardRatio } = require('../../utils/masonry');

// 双击判定窗口（ms）。取 260 而非常见的 300：单击封面进详情要等这个窗口结束才触发，
// 窗口越长"点开详情"越显迟钝。260ms 配合按下缩放反馈，手感已经跟得上。
const DOUBLE_TAP_MS = 260;

// ⚠️⚠️ 自定义事件名绝对不能叫 `tap`（/`touchstart` 等原生事件名）。
//
// 踩坑实录（2026-10-10，用户反馈"点任意卡片都提示玩具不存在"）：
//   组件原本是 triggerEvent('tap', { id })，页面写 <toy-card bind:tap="onToyTap">。
//   但 `tap` 是原生事件名——组件内部的原生 tap 会**冒泡出组件边界**，
//   直接命中父级写在组件标签上的 bind:tap（这是「点遮罩关弹窗」那个经典用法的原理）。
//   于是 onToyTap 拿到的是原生事件的 detail = { x, y }（触点坐标），没有 id，
//   拼出 url = '?id=undefined' → 详情页查不到 → 「玩具不存在」。
//   实测取证：同一页面分别喂两种形状的 event，得到
//     { id }  → /packageToy/detail/detail?id=3f1b36...   ✅
//     { x,y } → /packageToy/detail/detail?id=undefined   ❌
// 因此这里统一用 `open`（非原生事件名），页面侧绑 bind:open。
const EVT_OPEN = 'open';
const EVT_WANT = 'want';

Component({
  // ⚠️ 必须开 addGlobalClass（等价 styleIsolation: 'apply-shared'）。
  // 微信自定义组件默认样式隔离：除「继承样式」和 CSS 变量外，app.wxss 里的 class
  // 对组件内节点**完全无效**。本组件封面上的成色标签写的是 `class="tcard__cond badge {{conditionCls}}"`
  // —— badge / condition--* 都在 app.wxss 里，不开这个开关就只剩裸文字贴在照片上，
  // 没有任何胶囊底色（实测：真机截图里"9成新""有使用痕迹"直接叠在图片上看不清）。
  // 变量能生效（--color-*）是因为 CSS 自定义属性属于可继承属性，容易让人误以为全局样式也生效了。
  options: { addGlobalClass: true },
  properties: {
    toy: { type: Object, value: {} },
  },
  data: {
    conditionCls: '',
    conditionLabel: '',
    creditCls: '',
    creditLabel: '',
    mediaPad: 100, // 封面高度 = 卡片宽度 × mediaPad%，用 padding-top 百分比实现等比
    hasImage: false,
    imgLoaded: false,
    categoryLabel: '', // 无图占位块上的品类文字
    hasAvatar: false, // 作者头像是否可用；加载失败时回落到默认头像占位
    // isMine：当前查看者是不是这件玩具的发布者，由服务端 publicToy() 按查看者 openid 算出。
    // true 时整块隐藏右下「想要」按钮、并禁用双击封面触发想要（服务端 handleToggleWant
    // 对自有玩具直接 400「不能对自己发布的玩具点想要」，留着控件就是"点了必然报错"）。
    isMine: false,
    burst: false, // 双击"想要"的爱心爆裂动效
  },
  observers: {
    toy(toy) {
      const cm = CONDITION_META[toy.conditionLevel] || CONDITION_META.used;
      const owner = toy.owner || {};
      const cr = CREDIT_META[owner.creditLevel] || CREDIT_META.sprout;
      const images = toy.images || [];

      // 关键：只有"换成了另一件玩具"才重置这三个"已加载/已失败"状态。
      // 同一件玩具的属性更新（点"想要"后页面回写 wanted/wantCount 会生成新对象）
      // 如果一并重置：
      //   - imgLoaded 回 false → 已加载的图先变透明再渐显，点一次心形闪一下；
      //   - hasImage 回 true  → onImgError 降级成的占位块被"复活"成破图图标；
      //   - hasAvatar 回 true → 作者头像的破图同理复活。
      // 所以三者一律只在玩具切换时按新数据重算。
      const switchedToy = this._lastToyId !== toy.id;
      this._lastToyId = toy.id;

      const patch = {
        conditionCls: cm.cls,
        conditionLabel: cm.label,
        creditCls: cr.cls,
        creditLabel: cr.label,
        mediaPad: Math.round(cardRatio(toy.id) * 100),
        categoryLabel: CATEGORY_NAMES[toy.category] || '童芽玩具',
        // isMine 放在这个"每次都重算"的 patch 里，而不是下面 switchedToy 分支：
        // 它只是 toy.isMine 的直映射，不涉及任何"已加载 / 已失败"状态，
        // 所以同玩具属性更新（点想要后页面回写）时重算不会闪图、也不会复活破图。
        // switchedToy 那套守卫是专为 imgLoaded / hasImage / hasAvatar 三个加载态设计的，别混用。
        isMine: !!toy.isMine,
      };
      if (switchedToy) {
        patch.hasImage = images.length > 0;
        patch.imgLoaded = false;
        patch.hasAvatar = !!owner.avatarUrl;
      }
      this.setData(patch);
    },
  },
  lifetimes: {
    detached() {
      // 组件销毁时清掉挂起的定时器，避免翻页后旧卡片的回调打到已卸载的组件上
      if (this._navTimer) clearTimeout(this._navTimer);
      if (this._burstTimer) clearTimeout(this._burstTimer);
    },
  },
  methods: {
    // 封面单击进详情 / 双击表"想要"。
    // 小程序没有原生双击事件，只能自己做单击延迟判定：
    // 第一次点先挂 260ms 定时器，期间若再来一次就取消导航、改为想要。
    onMediaTap() {
      // 自有玩具：不能"想要"（服务端 handleToggleWant 会 400），心形按钮也已隐藏，
      // 双击想要这套语义在此完全不成立。直接按单击处理、立即进详情：
      // 既不发出注定被拒的请求，也免掉 260ms 双击窗口带来的迟钝。
      // 注意这里不是"静默 return"——open 事件会让页面立刻跳详情，用户有明确反馈。
      if (this.data.isMine) {
        this.triggerEvent(EVT_OPEN, { id: this.data.toy.id });
        return;
      }
      const now = Date.now();
      if (now - (this._lastTapAt || 0) < DOUBLE_TAP_MS) {
        this._lastTapAt = 0;
        if (this._navTimer) { clearTimeout(this._navTimer); this._navTimer = null; }
        this.onWantTap();
        return;
      }
      this._lastTapAt = now;
      if (this._navTimer) clearTimeout(this._navTimer);
      this._navTimer = setTimeout(() => {
        this._navTimer = null;
        this.triggerEvent(EVT_OPEN, { id: this.data.toy.id });
      }, DOUBLE_TAP_MS);
    },

    // 卡片正文单击直接进详情，不做双击判定——正文没有"点赞"语义，不该被延迟
    onBodyTap() {
      this.triggerEvent(EVT_OPEN, { id: this.data.toy.id });
    },

    onWantTap() {
      const toy = this.data.toy || {};
      if (!toy.id) return;
      // 组件只负责动画；状态变更交给页面统一处理（页面做乐观更新 + 服务端校正）
      if (!toy.wanted) this.playBurst();
      this.triggerEvent(EVT_WANT, { id: toy.id, wanted: !toy.wanted });
    },

    playBurst() {
      this.setData({ burst: false });
      // 先复位再置 true，保证连续双击都能重放动画（同值 setData 不会重启 CSS 动画）
      wx.nextTick(() => {
        this.setData({ burst: true });
        if (this._burstTimer) clearTimeout(this._burstTimer);
        this._burstTimer = setTimeout(() => this.setData({ burst: false }), 700);
      });
    },

    onImgLoad() {
      this.setData({ imgLoaded: true });
    },

    // 图片加载失败（外链域名未加白名单、云端文件被删、网络异常）统一降级为主题色占位块，
    // 而不是留一个破图图标——列表版式不能因为一张图废掉。
    onImgError() {
      this.setData({ hasImage: false, imgLoaded: false });
    },

    // 作者头像加载失败：回落到默认头像占位，不让 32rpx 的破图图标出现在作者行
    onAvatarError() {
      this.setData({ hasAvatar: false });
    },
  },
});
