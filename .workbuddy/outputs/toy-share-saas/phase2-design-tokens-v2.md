# 家长玩具交换平台「童芽 ToySprout」· Phase 2 设计令牌文档（v2 · WarmTrust v2）

> 设计系统专家：彩格调（Cai）｜ 面向 Phase 3 双端原型构建师可直接消费的令牌规范
> 状态：**本文件为唯一权威设计令牌来源（Single Source of Truth），完整替代 `phase2-design-tokens.md`（v1）**
> 品牌：童芽 ToySprout（示例品牌名）｜ 气质：温暖 · 可信 · 邻里互助 · 环保分享 · 克制专业
> 业务模型：**C2C 一换一互邮交换**（平台零库存、撮合 + 每单服务费 ¥1.9 + 会员订阅）
> 信任主线：**人靠谱 + 物如实 + 平台兜底**（v1「消毒质检信任」已退役）

---

## 〇、变更总览（v1 → v2）

### 0.1 一句话修订方向

> 从「平台替你把关」（消毒质检的工业化安全感）→「**社区互相托付**」（信用、成色、互评的社区信任感）。
> 色彩/排版/间距/基础组件令牌**尽量沿用 v1 不推倒**；**信任组件族整体重映射**。

### 0.2 v1 → v2 组件映射关系表

| v1 信任组件（处置） | 处置 | v2 继承组件 | 职责继承逻辑 |
|---|---|---|---|
| 消毒报告卡 Sanitization Report Card | 🔴 退役 | **服务费保障条** + **互评卡** | 「平台背书可视化」职责 → 平台兜底（服务费担保）；报告卡实体随「平台零库存」废弃 |
| 质检徽章 Quality Badge | 🔴 退役 | **认证标识** + **信用分徽章** | 「可信背书徽章」职责 → 人靠谱（实名/信用等级） |
| 批次追溯条 Batch Trace Bar | 🔴 退役 | **交换订单状态机** | 「流程进度可视化」职责 → 一换一订单双轨物流追踪 |
| 安全标识 Safety Badge | 🟡 保留改造 | **安全提示标签 Toy Safety Tag** | 安全语义保留；内容从「平台消毒承诺」→「玩具属性（适龄/小零件）」 |

### 0.3 v2 信任组件族总览（7 个一等组件）

| v2 组件 | 所属要素 | 核心作用 | 最小使用场景 |
|---|---|---|---|
| 信用分徽章 Credit Score Badge | 人靠谱 | 等级化信用可视化（500–1000 分四级） | 玩具卡作者行 / 详情作者卡 / 聊天头像 |
| 认证标识 Verified Badge | 人靠谱 | 实名 / 家长认证背书 | 作者行 / 头像 / 我的主页 |
| 互评卡 Review Card | 人靠谱 | 5 星+文字+快捷标签口碑沉淀 | 详情页作者区 / 我的主页 / 评价页 |
| 成色标签 Condition Badge | 物如实 | 四级成色标准（全新/9成新/8成新/有使用痕迹） | 玩具卡 / 详情 / 发布表单 / 订单卡 |
| 安全提示标签 Toy Safety Tag | 物如实 | 适龄 + 小零件安全属性 | 详情页 / 发布表单 |
| 交换订单状态机 Swap Status Machine | 平台兜底 | 一换一履约进度可视化（五状态 + 双轨运单） | 订单详情 / 订单列表 / 聊天入口 |
| 服务费保障条 Service Fee Guarantee | 平台兜底 | 平台担保 + 收费透明（¥1.9/会员免） | 发起交换 / 订单详情 / 聊天意向卡 |

> **信任三要素全站贯穿**：任何页面至少出现 2 类要素（人/物/平台）；严禁信任组件只存在于详情页单页孤岛。

---

## 1. Visual Theme（视觉主题）

**Philosophy**: 让每一次「交换」都托付给可靠的人 —— 温暖如邻里的社区信任，清晰如账本的规则透明。
**Direction**: Soft Warm（柔和温暖）为体 + Modern Minimal（现代极简）为用；圆角适中、留白充足、克制不幼稚。
**Personality**: warm（温暖）、trustworthy（可信）、community（邻里互助）、honest（物如实）、disciplined（克制专业）。
**Reference**: Airbnb 信任体系（房东验真/评价/保障）× Notion 组件纪律 × Stripe 规则透明；品牌色=奶油暖黄/珊瑚橙/鼠尾草绿。
**Visual Metaphor**: 「温暖的邻里 + 透明的规矩」——所有信任信息（信用/成色/互评/担保/物流）以可视化组件露出，不做隐藏式承诺。
**v2 语义迁移**: 绿色语义从「消毒安全」→「**信用优质 / 物如实 / 平台担保**」；红色从「损坏赔付」→「**差评 / 纠纷仲裁 / 逾期**」。

---

## 2. Color Palette（色彩令牌）

> 权威值为 HEX；OKLCh 为参考近似值。所有文本色已按 WCAG 2.1 AA 校验（标注「白底/浅底」）。
> **v2 只新增语义别名与少量新色，品牌色阶全部保留 v1。**

### 2.1 Brand / Primary（品牌主色 · 奶油暖黄）【沿用 v1】

| Token | HEX | OKLCh(≈) | 用途 | 对比度 |
|-------|-----|----------|------|--------|
| `--color-primary` | `#F2B33D` | oklch(0.79 0.15 80) | 品牌身份色：Logo、激活态、进度条、星级填充 | 配深炭文字 ≥8:1 |
| `--color-primary-strong` | `#D98E1F` | oklch(0.68 0.13 75) | 暖黄深阶：描边、图标描边 | — |
| `--color-primary-tint` | `#FCF0D8` | oklch(0.95 0.04 85) | 暖黄浅底：激活导航、软按钮、会员强调底 | 与深琥珀文字 ≥6:1 |
| `--color-primary-ink` | `#7A4E0D` | oklch(0.55 0.10 70) | 暖黄语义文字（黄浅底上） | 白底 ≥6:1 |

### 2.2 Accent（点缀色 · 珊瑚橙）【沿用 v1】

| Token | HEX | OKLCh(≈) | 用途 | 对比度 |
|-------|-----|----------|------|--------|
| `--color-accent` | `#F27355` | oklch(0.70 0.19 40) | 亮珊瑚：装饰填充、图标点缀、激活指示 | 配深炭文字 ≥4.5:1 |
| `--color-accent-strong` | `#C94324` | oklch(0.55 0.19 35) | **主 CTA 底色**（发起交换/确认收货/订阅）、**服务费金额强调** | 白字 ≥4.9:1 |
| `--color-accent-tint` | `#FCE8E0` | oklch(0.93 0.04 40) | 珊瑚浅底：标签底色、服务费条强调底 | 与深炭文字 ≥9:1 |

### 2.3 Semantic（语义色 · 绿=安全优质 / 琥珀=提醒进行中 / 红=风险 / 蓝=信息物流）【沿用 v1】

| Token | HEX | OKLCh(≈) | 用途 | 对比度(白底) |
|-------|-----|----------|------|--------------|
| `--color-success` | `#3E7C59` | oklch(0.55 0.08 155) | **安全/优质/如实语义**（信赖级信用、全新成色、已收货、平台担保）；白字按钮可用 | ≥4.9:1 |
| `--color-success-tint` | `#E7F2E8` | oklch(0.93 0.03 155) | 安全徽章浅底 | — |
| `--color-success-border` | `#BFD8C6` | — | 安全描边 | — |
| `--color-success-text` | `#2F5D46` | oklch(0.47 0.06 155) | 安全语义文字（浅底上）/ **优选信用级深绿** | 浅底 ≥6:1 |
| `--color-warning` | `#9A6510` | oklch(0.55 0.12 70) | **提醒/进行中语义**（成长级信用、8成新、状态机当前节点、小零件警告） | ≥4.9:1 |
| `--color-warning-tint` | `#FAEBD3` | oklch(0.94 0.05 80) | 提醒徽章浅底 | — |
| `--color-warning-border` | `#EAD3A4` | — | 提醒描边 | — |
| `--color-warning-text` | `#7A4E0D` | — | 提醒语义文字（浅底上） | 浅底 ≥6:1 |
| `--color-danger` | `#C2402F` | oklch(0.55 0.17 30) | **风险语义**（差评、纠纷仲裁、逾期未寄）；白字按钮可用 | ≥5.1:1 |
| `--color-danger-tint` | `#FBE4DF` | oklch(0.93 0.04 30) | 风险徽章浅底 | — |
| `--color-danger-border` | `#F0C9BF` | — | 风险描边 | — |
| `--color-danger-text` | `#A83325` | — | 风险语义文字（浅底上） | 浅底 ≥5:1 |
| `--color-info` | `#43618E` | oklch(0.52 0.07 260) | **信息/物流蓝**（9成新成色、对方已同意、运单追踪） | ≥6:1 |
| `--color-info-tint` | `#E8EFF7` | oklch(0.93 0.02 250) | 信息徽章浅底 | — |
| `--color-info-border` | `#C3D2E4` | — | 信息描边 | — |
| `--color-info-text` | `#35506E` | — | 信息语义文字（浅底上） | 浅底 ≥6:1 |
| `--color-neutral` | `#8A7C6A` | oklch(0.60 0.03 80) | **中性语义**（新芽级信用、有使用痕迹、已发起、已取消） | ≥4.5:1 |
| `--color-neutral-tint` | `#F3EADB` | oklch(0.93 0.02 85) | 中性徽章浅底 | — |
| `--color-neutral-border` | `#DBCDB8` | — | 中性描边 | — |

> ⚠️ **语义锚定（全站不可变）**：**绿色永远=安全/优质/如实/担保；红色永远=差评/纠纷/逾期；琥珀=进行中/提醒；灰=中性/新用户；蓝=信息/物流。** 禁止用绿色表示「危险」或红色表示「优质/通过」。蓝=9成新 与蓝=物流 属同色双上下文（徽章 vs 状态机），靠图标+文字区分，不冲突。

### 2.4 Neutral / 背景（暖调中性阶）【沿用 v1】

| Token | HEX | 用途 | 对比度 |
|-------|-----|------|--------|
| `--color-bg` | `#FBF6EC` | 页面背景（暖米白） | 主文字 ≥13:1 |
| `--color-surface` | `#FFFFFF` | 卡片/面板/表单背景 | 主文字 ≥14:1 |
| `--color-surface-muted` | `#F8F1E6` | 交替区块/次级面板 | — |
| `--color-surface-sunken` | `#F3EADB` | 按下态/凹陷区/输入框底 | — |
| `--color-border` | `#E9DFCE` | 默认边框/分隔线 | — |
| `--color-border-strong` | `#D6C8B0` | 输入框/强调边框/空星 | — |
| `--color-divider` | `#EFE7D9` | 细分隔线 | — |
| `--color-text-primary` | `#33291F` | 标题/正文（深暖炭） | 白底 ≥14:1 |
| `--color-text-secondary` | `#6B5E4F` | 次级正文/说明 | 白底 ≥6.3:1 |
| `--color-text-tertiary` | `#7A6C5A` | 注释/元信息（小字） | 白底 ≥5:1 |
| `--color-text-inverse` | `#FFFFFF` | 深色/主色按钮上的文字 | — |
| `--color-text-on-primary` | `#33291F` | 黄/珊瑚浅底上的深色文字 | ≥4.5:1 |
| `--color-disabled` | `#B8AB99` | 禁用态（仅非关键信息） | ≈3:1（禁用豁免） |
| `--color-disabled-bg` | `#EFE8DC` | 禁用态底色 | — |

### 2.5 v2 新增语义色（信用等级 · 成色 · 星级 · 担保）

> 设计原则：**信用等级色 = 语义色别名**（新芽=灰、成长=琥珀、信赖=绿、优选=深绿），确保「绿=优质」锚定全站一致；成色四级同样复用既有语义色。**唯一新增 HEX 为 `--color-credit-elite-tint`。**

| Token | HEX | 别名自 | 用途 | 对比度 |
|-------|-----|--------|------|--------|
| `--color-credit-sprout` | `#8A7C6A` | `neutral` | 信用 500–599 **新芽** | 浅底文字 ≥4.5:1 |
| `--color-credit-sprout-tint` | `#F3EADB` | `neutral-tint` | 新芽徽章浅底 | — |
| `--color-credit-growing` | `#9A6510` | `warning` | 信用 600–799 **成长** | 浅底文字 ≥4.5:1 |
| `--color-credit-growing-tint` | `#FAEBD3` | `warning-tint` | 成长徽章浅底 | — |
| `--color-credit-trusted` | `#3E7C59` | `success` | 信用 800–949 **信赖** | 浅底文字 ≥4.5:1 |
| `--color-credit-trusted-tint` | `#E7F2E8` | `success-tint` | 信赖徽章浅底 | — |
| `--color-credit-elite` | `#2F5D46` | `success-text` | 信用 950–1000 **优选**（实心深绿+白字） | 白字 ≥8:1 |
| `--color-credit-elite-tint` | `#DCEBDD` | **新增 HEX** | 优选徽章浅底（移动端小徽章用） | 与深绿文字 ≥6:1 |
| `--color-condition-new` | `#3E7C59` | `success` | 成色 **全新** | 浅底文字 ≥4.5:1 |
| `--color-condition-new-tint` | `#E7F2E8` | `success-tint` | 全新标签浅底 | — |
| `--color-condition-9new` | `#43618E` | `info` | 成色 **9成新** | 浅底文字 ≥4.5:1 |
| `--color-condition-9new-tint` | `#E8EFF7` | `info-tint` | 9成新标签浅底 | — |
| `--color-condition-8new` | `#9A6510` | `warning` | 成色 **8成新** | 浅底文字 ≥4.5:1 |
| `--color-condition-8new-tint` | `#FAEBD3` | `warning-tint` | 8成新标签浅底 | — |
| `--color-condition-used` | `#8A7C6A` | `neutral` | 成色 **有使用痕迹** | 浅底文字 ≥4.5:1 |
| `--color-condition-used-tint` | `#F3EADB` | `neutral-tint` | 有使用痕迹标签浅底 | — |
| `--color-star` | `#F2B33D` | `primary` | 互评星级填充（暖黄，图标级无需文本对比） | — |
| `--color-star-empty` | `#D6C8B0` | `border-strong` | 互评空星 | — |
| `--color-guarantee` | `#3E7C59` | `success` | **平台担保**语义（双方发起快递时收取、担保盾） | 浅底文字 ≥4.5:1 |
| `--color-guarantee-tint` | `#E7F2E8` | `success-tint` | 担保条浅底/盾标底 | — |

> 📌 **信用等级 → 颜色速记**：新芽=灰（新用户）、成长=琥珀（一般）、信赖=绿（高信用）、优选=深绿（顶级）。**红色永不用于信用/成色等级**，只用于差评/纠纷/逾期。

### 2.6 色彩使用规则【沿用 v1 + v2 补充】

- 正文/说明文字只用中性阶；彩色仅用于语义、装饰、按钮与状态。
- 黄色/亮珊瑚不作为小号正文文字；彩色文字用深阶（primary-ink / accent-strong / semantic-text）。
- 大面积背景保持暖米白/纯白；品牌色点缀占比 ≤15%。
- 装饰性彩色背景上一律深炭文字 `--color-text-on-primary`，禁止白字。
- **v2 补充**：信用分数值、金额（¥1.9/¥10）、运单号一律使用 `--font-mono` 或 `tabular-nums`；星级填充只用 `--color-star`，禁止改用红/绿渲染星级。

---

## 3. Typography（排版令牌）【沿用 v1】

### 3.1 Font Stacks（完整回退栈 · 覆盖中英文）

```css
--font-display: "Nunito", "Quicksand", "PingFang SC", "Source Han Sans SC",
                "Noto Sans SC", "Microsoft YaHei", system-ui, -apple-system,
                "Segoe UI", sans-serif;   /* 品牌展示/大标题：拉丁圆润暖感，中文回落 PingFang/思源黑体 */
--font-sans: "Inter", "PingFang SC", "Source Han Sans SC", "Noto Sans SC",
             "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif; /* UI 正文 */
--font-mono: "SF Mono", "JetBrains Mono", "Cascadia Code", ui-monospace,
             "SFMono-Regular", Menlo, monospace;  /* 信用分/运单号/金额/编号 */
```

### 3.2 Type Scale（字号阶梯 · 桌面端优先，移动端按 §9 降级）

| Token | Size | Weight | Line-height | Letter-spacing | 用途 |
|-------|------|--------|-------------|----------------|------|
| `--text-display` | 44px / 2.75rem | 800 | 1.15 | -0.02em | Hero 大标题（落地页） |
| `--text-h1` | 32px / 2rem | 700 | 1.2 | -0.01em | 页面主标题 |
| `--text-h2` | 26px / 1.625rem | 700 | 1.3 | -0.01em | 区块标题 |
| `--text-h3` | 20px / 1.25rem | 600 | 1.4 | 0 | 卡片标题 |
| `--text-h4` | 17px / 1.0625rem | 600 | 1.45 | 0 | 子标题/分组 |
| `--text-body-lg` | 17px / 1.0625rem | 400 | 1.65 | 0 | 引导文案/卡片正文 |
| `--text-body` | 16px / 1rem | 400 | 1.6 | 0 | 正文（默认） |
| `--text-body-sm` | 14px / 0.875rem | 400 | 1.55 | 0 | 次级正文/表格/互评文字 |
| `--text-caption` | 13px / 0.8125rem | 400/500 | 1.5 | 0 | 说明/脚注/物流节点 |
| `--text-micro` | 12px / 0.75rem | 500/600 | 1.4 | +0.02em | 徽章/标签/快捷评价标签/按钮小字 |
| `--text-num` | 与语境同级 | 700 | 1.2 | 0 | 数字/信用分/价格/运单（display 字体 + `font-variant-numeric: tabular-nums`） |

### 3.3 Weight / 其他【沿用 v1】

- 字重阶梯：400（正文）→ 500（强调正文/标签）→ 600（按钮/卡片标题）→ 700（标题）→ 800（仅 Display）。
- 中文长段正文 400、行高 1.6–1.65；标题 700。
- **v2 补充**：信用分徽章中的分值、服务费金额、运单号强制 `tabular-nums` 或 `--font-mono`；星级对应的文字评价用 `--text-body-sm`。

---

## 4. Spacing / Radius / Shadow（间距 · 圆角 · 阴影令牌）【沿用 v1】

### 4.1 Spacing（4px 基准间距阶梯）

| Token | Value | 用途 |
|-------|-------|------|
| `--space-1` | 4px | 图标与文字间距 |
| `--space-2` | 8px | 紧凑内间距（徽章内） |
| `--space-3` | 12px | 控件内边距、标签间距、运单子卡内距 |
| `--space-4` | 16px | 默认内边距（紧凑卡片、互评紧凑卡） |
| `--space-5` | 20px | 常规内边距 |
| `--space-6` | 24px | 卡片内边距、栅格 gutter |
| `--space-8` | 32px | 区块内分隔 |
| `--space-10` | 40px | 区块间分隔 |
| `--space-12` | 48px | 大区块分隔 |
| `--space-16` | 64px | Landing 区块垂直节奏 |
| `--space-20` | 80px | Hero 上下留白 |

### 4.2 Radius（圆角）【沿用 v1】

| Token | Value | 用途 |
|-------|-------|------|
| `--radius-sm` | 6px | 标签、小控件、快捷评价 chips |
| `--radius-md` | 10px | 按钮、输入框、运单子卡、互评紧凑卡 |
| `--radius-lg` | 16px | **卡片、状态机、服务费保障条、互评完整卡** |
| `--radius-xl` | 24px | Hero 面板、弹窗、大容器 |
| `--radius-full` | 999px | 胶囊徽章、头像、进度圆、星级胶囊 |

### 4.3 Shadow（柔和暖调阴影 · 禁止冷黑纯阴影）【沿用 v1】

| Token | Value | 用途 |
|-------|-------|------|
| `--shadow-xs` | `0 1px 2px rgba(61,45,30,0.05)` | 扁平层级微投影 |
| `--shadow-sm` | `0 2px 6px rgba(61,45,30,0.07)` | 卡片默认/按钮 |
| `--shadow-md` | `0 6px 18px rgba(61,45,30,0.09)` | 卡片 hover、下拉、悬浮运单卡 |
| `--shadow-lg` | `0 12px 32px rgba(61,45,30,0.12)` | 弹窗、浮层、确认收货弹窗 |
| `--shadow-xl` | `0 20px 48px rgba(61,45,30,0.16)` | 全屏遮罩、Hero 强调 |
| `--focus-ring` | `0 0 0 3px rgba(242,179,61,0.40)` | 键盘焦点环（黄） |

### 4.4 Z-index Scale【沿用 v1】

| Token | Value | 层级 |
|-------|-------|------|
| `--z-base` | 0 | 内容 |
| `--z-dropdown` | 100 | 下拉/浮层/状态节点气泡 |
| `--z-sticky` | 200 | 吸顶导航/订单详情操作条 |
| `--z-modal` | 300 | 弹窗（确认收货/仲裁举证） |
| `--z-toast` | 400 | 轻提示（运单号已复制） |
| `--z-tooltip` | 500 | 提示气泡 |

---

## 5. Component Styles（基础组件规范）【沿用 v1，微调文案】

> 基础组件（按钮/卡片/表单/导航/进度）延续 v1，仅更新业务文案与信任组件引用。

### 5.1 Button（按钮）

| Variant | BG | Text | Border | Hover | 用途 |
|---------|-----|------|--------|-------|------|
| **Primary** | `--color-accent-strong` `#C94324` | `#FFFFFF` | none | `#B53A1F` + shadow-md | 主 CTA（发起交换/确认收货/立即订阅/去评价） |
| **Secondary** | `--color-surface` `#FFF` | `--color-text-primary` | 1px `--color-border-strong` | bg `--color-bg` | 次级操作（加入心愿单/查看详情/再换一件） |
| **Soft** | `--color-primary-tint` | `--color-primary-ink` | none | bg `#F9E9C4` | 温暖辅助操作（浏览玩具库/了解会员） |
| **Ghost** | transparent | `--color-text-secondary` | none | bg `--color-surface-sunken` | 轻量操作（取消/返回/复制运单号） |
| **Danger** | `--color-danger` | `#FFFFFF` | none | `#A83325` | 危险操作（发起纠纷/取消交换并退款） |

- 尺寸：lg 48px / md 44px（默认）/ sm 36px / xs 28px；radius-md（10px）。
- Primary/Soft 配 `--shadow-xs`；hover 统一 `translateY(-1px)` + `--shadow-sm`。
- Disabled：`--color-disabled-bg` 底 + `--color-disabled` 文字，去阴影。
- 文字：16px/600（md），sm 14px/600；按钮内文字不用品牌黄/亮珊瑚。

### 5.2 Card（卡片）【沿用 v1】

- 默认：`--color-surface` 白底、1px `--color-border`、`--radius-lg` 16px、padding `--space-6`、无阴影（扁平）。
- Hover：`translateY(-2px)` + `--shadow-md` + 边框转 `--color-border-strong`。
- Featured（推荐玩具/会员/优选信用作者卡）：顶部 4px 品牌色条（`--color-primary` 或 `--color-accent`），或 1.5px 描边。
- Compact：padding `--space-4`、`--radius-lg` 用于网格密集区与订单卡。

### 5.3 Badge / Status Tag（基础徽章）【沿用 v1 + v2 扩展】

- 结构：胶囊（`--radius-full`）、padding 2px 10px、`--text-micro` 12px/600、高 22px、可带 12px 图标。
- 基础状态色（统一「浅底+深字」）：

| 状态 | BG | Text | 场景 |
|------|-----|------|------|
| 成功/优质 | `--color-success-tint` | `--color-success-text` | 已收货/已互评/全新/信赖/优选 |
| 提醒/进行中 | `--color-warning-tint` | `--color-warning-text` | 邮寄中/8成新/成长/小零件警告 |
| 风险 | `--color-danger-tint` | `--color-danger-text` | 差评/纠纷仲裁/逾期 |
| 信息/物流 | `--color-info-tint` | `--color-info-text` | 对方已同意/9成新/运单追踪 |
| 中性 | `--color-neutral-tint` | `--color-text-secondary` | 已发起/有使用痕迹/新芽/已取消 |

- 实心徽章（白色文字）仅限强视觉场景：优选信用徽章（深绿实心）、已互评完成徽章、纠纷仲裁（红实心）。
- **v2 扩展**：信用等级徽章与成色标签为专用变体，详见 §6.1 / §6.2。

### 5.4 Form Controls（表单控件）【沿用 v1，新增成色选择器引用】

- Input/Select/Textarea：高 44px（textarea 除外）、`--radius-md`、1px `--color-border-strong`、底 `--color-surface`；focus：`--focus-ring` + 边框转 `--color-primary`；placeholder `--color-disabled`；label 14px/600。
- 校验：error 边框 `--color-danger` + 13px `--color-danger-text` 提示；success 边框 `--color-success` + 绿勾。
- Checkbox/Radio：accent `--color-accent-strong`；Switch 开态 `--color-success`。
- **v2 新增引用**：发布表单「成色选择器」= 四个成色标签胶囊可点选（§6.2 四档），选中态 1.5px `--color-*` 描边 + 底部说明文案；「适龄/小零件」= 安全提示标签必填项（§6.7）。

### 5.5 Navigation（导航）【沿用 v1，小程序底栏补充】

- **顶部导航（Web 落地页）**：高 72px；默认透明/暖米白，滚动后白底+`--shadow-sm`；Logo=暖黄芽图形+品牌名；CTA=Primary 按钮。
- **侧边导航（Web 登录后）**：宽 240px；激活项=`--color-primary-tint` 底 + 左 3px `--color-primary` 指示条；未激活=图标 20px + `--color-text-secondary`。
- **Tab（Web）**：激活下划线 `--color-primary` 2px + `--color-text-primary`。
- **小程序底栏 Tab（375px）**：高 49px + safe-area；4 Tab（发现/消息/发布/我的）；激活图标 `--color-accent-strong` + 文字 10px/600；发布 Tab 用中央凸起 Primary 圆钮（52px）。

### 5.6 进度与数据呈现【沿用 v1】

- 信用分升级进度/会员等级进度条：高 8px、`--radius-full`、轨道 `--color-surface-sunken`、填充 `--color-primary`（信用分进度可用绿渐变 `#3E7C59 → #2F5D46`）；数值 `--text-num` tabular。
- 数据统计块：`--text-h2` 700 + 单位 `--text-body-sm` secondary；同比箭头（上升=绿，下降=红）。

---

## 6. Trust Component Family v2（信任组件族 · 一等组件）

> 本家族为全站一等组件，**双端必须出现**。每个组件均给出：结构 / 变体 / 双尺寸（桌面 + 移动 375px）/ 状态编码纪律。
> **状态编码纪律：所有状态必须「颜色 + 图标 + 文字」三重编码，禁止单靠颜色传达。**

---

### 6.1 信用分徽章 Credit Score Badge

**所属要素**：人靠谱 ｜ **职责**：等级化信用可视化（实名+交换+好评加权，500 起 / 1000 满）

**结构**（胶囊徽章 + 可选分值）：

```
[🌱 新芽] 新芽 · 560分          ← 等级徽章（图标+等级名）+ 分值（mono/tabular）
[✓ 已实名] [家长认证] [成长·720]  ← 与认证标识联用的作者信息行
```

**等级变体**（颜色/图标/文字三重编码）：

| 等级 | 分值区间 | Token | 浅底徽章样式 | 图标 |
|------|---------|-------|-------------|------|
| 新芽 Sprout | 500–599 | `credit-sprout`（灰） | tint 底 + 灰字 | 芽 Sprout |
| 成长 Growing | 600–799 | `credit-growing`（琥珀） | tint 底 + 琥珀字 | 幼苗 Growing |
| 信赖 Trusted | 800–949 | `credit-trusted`（绿） | tint 底 + 绿字 | 盾勾 ShieldCheck |
| 优选 Elite | 950–1000 | `credit-elite`（深绿） | **实心深绿 + 白字** | 星盾 StarShield |

**双尺寸**：

| 尺寸 | 场景 | 规格 |
|------|------|------|
| L | 详情页作者卡 / 我的主页 | 图标 18px + 等级名 14px/700 + 分值 13px mono；高 28px；可选分值胶囊分离 |
| M | 玩具卡作者行 / 订单卡 / 评价头部 | 图标 14px + 等级名 12px/600 + 分值 12px mono；高 22px |
| S | 聊天头像 / 评论 / 列表头像 | 图标 12px + 等级名 12px/600（分值可省）；高 20px |
| 移动 375px | 玩具卡作者行= M；聊天头像= S；作者卡 L 可换行为两行（等级行 + 分值行） | 分值间距 2px，避免贴边 |

**状态变体**：
- 已实名有分（默认）：等级徽章 + 可选分值。
- 未认证：**不显示等级徽章**，显示灰「未认证」标签（不得伪造等级）。
- 分值变化：我的主页数字滚动动效（如 600→640，`tabular-nums` 对齐）。
- 信用分不足：浏览端「仅信用达标」筛选下，不达标的作者徽章置灰降饱和（`--color-disabled` 处理），hover 提示「信用分未达标」。

---

### 6.2 成色标签 Condition Badge

**所属要素**：物如实 ｜ **职责**：四级成色标准（货不对板最直接的事前约束）

**结构**（胶囊标签，颜色+图标+文字三重编码）：

```
[🎁 全新]        ← 绿
[✓ 9成新]        ← 蓝
[◐ 8成新]        ← 琥珀
[〰 有使用痕迹]   ← 灰
```

**等级变体**：

| 等级 | 标准定义 | Token | 图标 |
|------|---------|-------|------|
| 全新 | 未拆封/仅试玩 | `condition-new`（绿） | 礼盒 Gift |
| 9成新 | 轻微使用无明显瑕疵 | `condition-9new`（蓝） | 勾 CircleCheck |
| 8成新 | 正常使用痕迹 | `condition-8new`（琥珀） | 半圆钟 HalfClock |
| 有使用痕迹 | 明显磨损/小瑕疵（需描述如实说明） | `condition-used`（灰） | 折痕 Wrinkle |

**双尺寸**：

| 尺寸 | 场景 | 规格 |
|------|------|------|
| L | 详情页成色对照区 / 订单详情双方玩具 | 图标 16px + 文字 14px/600；高 28px |
| M | 玩具卡左上角 / 订单卡缩略 / 交换池 | 图标 12px + 文字 12px/600；高 22px |
| S | 筛选结果 / 聊天意向卡 | 图标 12px + 文字 12px/600（可省略图标）；高 20px |
| 移动 375px | 玩具卡左上角=M；详情页=L 并配「成色对照」折叠说明（点击展开四级标准）；筛选= S 多选胶囊 | 同一玩具卡上成色标签 + 安全标签最多并排 2 个 |

**纪律**：红色禁止用于成色（有使用痕迹=灰）；「全新」不得用黄/金（金=会员权益，避免混淆）。

---

### 6.3 互评卡 Review Card

**所属要素**：人靠谱 ｜ **职责**：交换完成后双方互评（5 星 + 文字 + 快捷标签）沉淀口碑

**结构**（完整卡）：

```
┌──────────────────────────────────────────────┐
│ (头像40) 妈妈·小雨  [✓已实名]  ★★★★☆   2天前  │
│           [玩具如描述] [包装用心]              │
│  玩具和描述完全一致，孩子特别喜欢，包装也很用心！  │
└──────────────────────────────────────────────┘
```

**元素规格**：
- 头部：头像 40px（移动 36px）+ 昵称 14px/600 + 认证标识（§6.6 S 版）+ 星级 + 时间 12px secondary。
- 星级：5 星横向；桌面 16px、移动 14px；填充 `--color-star`，空星 `--color-star-empty`；**星级恒为品牌黄**。
- 快捷标签：胶囊 chips（`--radius-sm` 或 full）、12px/500、tint 底 + 深字；标签集：玩具如描述 / 包装用心 / 沟通顺畅 / 发货快 / 信用好 / 如实描述。
- 文字评价：`--text-body-sm` 14px、行高 1.55；无文字时隐藏该行。

**变体**：

| 变体 | 样式 |
|------|------|
| 好评（默认） | 白卡 + 星级暖黄；快捷标签用 `success-tint`/`info-tint` |
| 差评 | 卡底 `--color-danger-tint` + 左缘 3px `--color-danger` + 红标签「差评」；星级仍品牌黄（1–2 星） |
| 无文字 | 仅星级 + 快捷标签 |
| 平台回复 | 缩进块（左 12px）+ `--color-primary-tint` 底，「平台回复」小标 12px/600 |

**双尺寸**：
- 桌面完整卡：padding `--space-6`（24px）、`--radius-lg`；列表多卡纵向排列，间距 16px。
- 移动 375px：padding 16px、`--radius-lg`；头像 36px；星级 14px；快捷标签自动换行（每行最多 3 个）。

---

### 6.4 交换订单状态机 Swap Status Machine

**所属要素**：平台兜底 ｜ **职责**：一换一履约进度可视化（替代 v1 批次追溯条）

**五状态流转**：`已发起 → 对方已同意 → 双方邮寄中 → 已收货 → 已互评`

**桌面横排步骤条**：

```
①已发起 → ②对方已同意 → ③双方邮寄中 → ④已收货 → ⑤已互评
  ●完成     ●完成          ●进行中(琥珀呼吸)  ○未开始   ○未开始
  06-11     06-12          06-13             —         —
```

- 节点：完成=绿实心（`--color-success`）+ 勾；进行中=琥珀实心（`--color-warning`）+ **呼吸动画**；未开始=灰虚线（`--color-neutral-border`）。
- 连线：完成段绿实线；未开始段灰虚线。
- 每个节点可点击 → 气泡展示：时间戳（mono）、责任人、关联运单/评价入口。

**双轨运单子卡**（展开于「双方邮寄中」步内，一换一专有）：

```
我寄出 → 对方    SF1402987634511    已揽收 → 运输中 ●呼吸 → 待签收
对方寄出 → 我    SF1402987634528    已揽收 → 运输中 → 待签收
```

- 每行：方向标签 12px secondary（「我寄出→对方」/「对方寄出→我」）+ 运单号 `--font-mono` 12px（可点击复制，toast「运单号已复制」）+ 物流节点 3 点（完成绿 / 当前琥珀呼吸 / 未到灰）。
- 物流节点语义：已揽收 / 运输中 / 已签收；当前节点呼吸动画；点击节点显示时间戳（mono）。

**状态语义色**：

| 状态 | 颜色 | 说明 |
|------|------|------|
| 已发起 | 中性灰 | 待对方确认 |
| 对方已同意 | 信息蓝 | 已达成意向，待互寄 |
| 双方邮寄中 | 信息蓝 + 当前节点琥珀呼吸 | 双轨运单展开 |
| 已收货 | 成功绿 | 双方均确认收货 |
| 已互评 | 成功深绿（实心） | 流程完成 |
| 已取消 | 中性灰虚线 | **非红**；标注取消方与原因 |
| 纠纷仲裁 | 危险红 | 替代正常流转；红色横幅 + 举证入口 |

**双尺寸**：
- 桌面完整版：横排五步；运单子卡 `--radius-md` 底 + 内 padding `--space-3`（12px）；箭头节点间距 24px。
- 移动 375px：**竖排步骤条**（每状态一行：图标 + 状态名 + 时间戳，行高 48px）；「双方邮寄中」展开双轨子卡（两行堆叠，内 padding 12px，`--radius-md`）；订单列表用 **mini 版**（当前状态徽章 + 3 点简化进度，非完整状态机）。

---

### 6.5 服务费保障条 Service Fee Guarantee

**所属要素**：平台兜底 ｜ **职责**：收费透明 + 平台担保（双方发起快递时收 ¥1.9，会员免）

**结构**（banner 卡）：

```
┌──────────────────────────────────────────────────────┐
│ [盾✓] 本单服务费 ¥1.9（会员免）· 平台担保 · 双方发起快递时收取  [了解规则 ▾] │
└──────────────────────────────────────────────────────┘
```

- 左：盾图标 20px（`--color-guarantee` 绿 / 白圆底）。
- 金额 ¥1.9：`--color-accent-strong` 700 + `--text-num` tabular。
- 担保句「平台担保 · 双方发起快递时收取」：`--color-guarantee` 绿。
- 「了解规则」可展开：① 意向未成/取消/未互寄不收费；② 成功交换完成（双方确认收货）后收取；③ 会员免服务费入口（Soft 按钮）。

**变体**：

| 变体 | 文案 | 样式 |
|------|------|------|
| 发起前（默认） | 本单服务费 ¥1.9（会员免）· 双方发起快递时收取，取消不收费 | 白卡 + 绿盾 |
| 订单进行中 | 服务费已担保 ¥1.9 · 双方发起快递时收取 | 白卡 + 绿盾 + 琥珀「担保中」徽章 |
| 会员 | 会员免服务费 ¥0 · 本单立省 ¥1.9 | `--color-primary-tint` 底 + 会员标识 |
| 已完成 | 服务费已收取 ¥1.9 | `--color-success-tint` 底 + 绿勾 |

**会员权益对照卡（6.5.1，一等展示）**：

| 权益 | 普通用户 | 会员 ¥10/月（单档） |
|------|---------|-----------|------------------|
| 每单服务费 | ¥1.9/单 | 免 | 免 |
| 优先曝光 | — | ✓ | ✓ |
| 专属客服 | — | ✓ | ✓ |

- 推荐列（会员）Featured：顶部 4px `--color-primary` 色条 + 1.5px `--color-primary` 描边 + 「推荐」角标。
- 免服务费计算器（Web 会员页）：滑杆选「每月预计交换 N 单」→ 显示「普通支出 ¥1.9×N / 会员立省 ¥1.9×N×12」。
- **金额全站统一**：¥1.9（服务费）/ ¥10（会员/月），禁止出现其他金额。

**双尺寸**：
- 桌面：banner 高 48px、padding 16px、`--radius-lg`、单行。
- 移动 375px：全宽 `--radius-lg`、高自适应（icon 20px + 文案可两行）、「了解规则」收为右侧箭头进入规则页。

---

### 6.6 认证标识 Verified Badge

**所属要素**：人靠谱 ｜ **职责**：实名认证 / 家长认证背书，与信用分徽章联用

**变体**：

| 类型 | 图标 | Token | 文案 | 尺寸 |
|------|------|-------|------|------|
| 实名认证 | 盾+勾 ShieldCheck | `success` 绿 | 已实名 | S 14px / M 16px |
| 家长认证 | 家庭+勾 FamilyCheck | `success` 绿 | 家长认证 | S 14px / M 16px |

**双尺寸**：
- 桌面：S（评论/列表头像旁）14px 图标；M（作者信息行/作者卡）16px 图标 + 12px/600 文字。
- 移动 375px：聊天/评论头像右下角 16px 圆形绿底盾标（`--radius-full`）；作者信息行 2 枚并排（实名 + 家长）。

**纪律**：
- 与信用分徽章联用顺序：`[家长认证] [已实名] [信用分徽章]`（人靠谱三连）。
- **未认证不显示任何认证标**；个人主页可显示灰「未认证」状态卡（提示去认证的 CTA）。
- 实名认证与家长认证是**两个独立认证**，必须分别标注，不可互相替代。

---

### 6.7 安全提示标签 Toy Safety Tag（v1 保留改造）

**所属要素**：物如实 ｜ **职责**：玩具安全属性（适龄 + 小零件），v1「消毒安全承诺」→ v2「玩具属性安全信息」

**结构**（胶囊标签 + 图标）：

```
[0-3岁] 适合 0-3 岁      ← 适龄标签（属性信息，中性/暖黄）
[⚠] 含小零件 · 3岁以下慎玩  ← 小零件警告（提醒语义，琥珀）
```

**变体**：

| 类型 | 内容 | Token | 图标 |
|------|------|-------|------|
| 适龄 | 适合 0-3 岁 / 3-6 岁 / 6-10 岁 | `primary-tint`（暖黄）/ `neutral-tint` | 数字/童 AgeBadge |
| 小零件警告 | 含小零件 · 3 岁以下慎玩 | `warning` 琥珀 | ⚠ TriangleWarning |

- 适龄为发布必填（单选三档）；小零件为勾选项，勾选后详情页展示警告标签。
- 与成色标签联用：详情页成色区横排 `[成色标签] [适龄] [小零件警告?]`；玩具卡上最多并排 2 个（成色 + 适龄），小零件警告仅在详情页露出。

**双尺寸**：
- 桌面：胶囊 22px（`--text-micro` 12px/600 + 12px 图标）；详情大版 28px（14px/600 + 14px 图标）。
- 移动 375px：与桌面同规格；小零件警告允许换行为两行胶囊，琥珀底 + 深琥珀字。

---

## 7. Icons & Graphics（图标与图形语言）【沿用 v1 + v2 增删】

- **风格**：线性图标（outline），stroke 1.75px（小尺寸 2px），圆头端点与圆角连接（linecap/linejoin round，拐角半径 2px），24px 基准网格。
- **v1 退役图标**：水滴/喷雾（消毒）、消毒质检盾、批次/追溯图标 —— 不再使用。
- **v2 新增图标集**：星盾 StarShield（优选信用）、芽 Sprout / 幼苗 Growing（信用等级）、礼盒 Gift（全新）、半圆钟 HalfClock（8成新）、折痕 Wrinkle（有使用痕迹）、家庭 FamilyCheck（家长认证）、盾勾 ShieldCheck（实名/担保）、快递盒/运单 Parcel（物流）、三角警告 TriangleWarning（小零件）、交换箭头 Swap（一换一）。
- **保留图标**：盾（担保/认证）、叶片（环保）、循环箭头（共享循环）、卡车/快递（配送）、日历（交换日期）、星（评级）、勾/感叹（状态）、儿童/萌芽（品牌）。
- **配色**：默认 `--color-text-secondary`；激活/强调 `--color-accent-strong` 或 `--color-primary`；安全/担保 `--color-success`；提醒 `--color-warning`；风险 `--color-danger`；禁用 `--color-disabled`；星级 `--color-star`。
- **插画语言**：扁平几何、圆角饱满（非尖锐）、暖色调；禁止写实卡通脸谱，保持「现代亲子」克制感。
- **装饰图形**：允许微妙渐变（黄→珊瑚 或 绿渐变），仅用于 Hero 背景/进度填充/信用分进度，面积 ≤15%。

---

## 8. Layout（布局令牌）【沿用 v1 + v2 信任落点】

- 容器：`--container` 1200px（Web 落地页）；Web 应用层内容区 max 1280px（含侧边栏 240px）。
- 栅格：12 列、gutter `--space-6`（24px）、页边距 24px；桌面卡片网格 3/4 列，详情区 2 列（左图右信息）。
- 垂直节奏：Landing 区块 `--space-16`（64px）；应用层区块 `--space-8`（32px）；卡片内 `--space-6`。
- 小程序：375px 设计基准；单列流式布局；卡片间距 12px；底栏 49px + safe-area。

### 8.1 信任组件全站落点规范（v2 核心）

| 组件 | 落点 |
|------|------|
| 信用分徽章 | 玩具卡作者行 / 详情页作者卡 / 聊天页头像 / 我的主页概览 / 评价头部 |
| 认证标识 | 作者信息行 / 头像右下角 / 我的主页认证卡 |
| 互评卡 | 详情页作者区（收到评价摘要+完整卡）/ 我的主页 / 评价页 / 玩具卡评论区 |
| 成色标签 | 玩具卡左上角 / 详情页成色区 / 筛选 / 发布表单 / 订单卡双方玩具 |
| 安全提示标签 | 详情页成色区 / 发布表单（必填适龄+小零件） |
| 交换订单状态机 | 订单详情页（完整）/ 订单列表卡（mini）/ 聊天页订单入口 |
| 服务费保障条 | 发起交换页 / 订单详情页顶部 / 聊天意向卡内 / 会员页（对照卡） |

---

## 9. Responsive Behavior（响应式行为）【v2 改为双端并行一等】

> v2 业务为 **Web + 小程序双端**，移动端（375px）为小程序一等基准，不再只是桌面降级。

### 9.1 Web 端

| Breakpoint | Width | 行为 |
|------------|-------|------|
| Desktop | ≥1024px | 全布局：侧边栏 240px + 12 列栅格 |
| Tablet | 768–1023px | 侧边栏收为图标栏 64px；卡片 2 列；状态机保留横排（节点可滚动） |
| Mobile | <768px | 单列堆叠；侧边导航→底部 Tab；状态机转竖排；CTA 全宽（与小程序一致） |

### 9.2 小程序端（375px）

- 4 Tab 底栏（发现/消息/发布/我的）：高 49px + safe-area；发布 Tab 中央凸起。
- 交互优先场景：拍照发布、消息聊天、消息提醒、扫码/寄件提醒。
- 信任组件竖排降级：状态机=竖排步骤条 + 双轨运单子卡；服务费条=全宽可换行；互评卡=单列。
- 触点：按钮高 ≥44px，点击区 ≥48px；运单号复制为触达高频操作（toast 反馈）。

### 9.3 文本自适应

- Display 44→36→28px；H1 32→28→24px；H2 26→22→20px。
- 信用分分值/运单号在移动端保持 `tabular-nums`，字号 ≥12px。

---

## 10. Cautions（设计禁区 · 反模式）【沿用 v1 + v2 新增】

### Never Do（禁止）

**沿用 v1：**
1. **儿童乐园感**：高饱和糖果撞色、大面积卡通插画、全元素过度圆润 —— 家长是成人消费者，克制专业优先。
2. **黄色小字正文**：`#F2B33D` 等亮色直接作正文/小字；彩色文字只用深阶。
3. **语义错位**：绿=危险 / 红=通过；**绿只=安全/优质/如实/担保，红只=差评/纠纷/逾期**。
4. **纯黑冷阴影**：一律用暖棕调 `rgba(61,45,30,…)`。
5. **装饰底上白字**：暖色浅底上放白字；浅底一律深炭文字 `--color-text-on-primary`。
6. **信任信息隐藏化**：信任组件只存在于详情页而列表/订单/主页缺失 —— 信任三要素全站贯穿。
7. **虚拟占位敷衍**：信用分、运单号、金额、评价必须真实可读格式（如信用 720、`SF1402987634511`），禁止 "lorem" 或空字符串。

**v2 新增：**
8. **消毒/质检语义残留**：禁止出现「已消毒 / 质检合格 / 消毒批次 / 追溯批次」等 v1 文案（平台零库存，无消毒质检职责）；安全提示只表述玩具属性（适龄/小零件）。
9. **信用等级色错位**：灰不得表示高信用，绿不得表示新用户；**新芽=灰、成长=琥珀、信赖=绿、优选=深绿**；红色永不用于信用等级。
10. **成色用红**：红色禁止用于成色标签（有使用痕迹=灰）；红色仅限差评/纠纷/逾期。
11. **状态机颜色错用**：已取消=中性灰虚线（**不是红**）；纠纷仲裁才用红；进行中节点必须琥珀呼吸（不可静止灰）。
12. **金额口径不一**：服务费 ¥1.9 / 会员 ¥10/月 全站统一，禁止出现其他金额或「免费」误导（双方发起快递时才收）。
13. **认证误导**：未认证用户不得显示认证盾标；实名认证与家长认证不得互相替代标注。
14. **星级滥用**：星级恒为品牌黄（`--color-star`），禁止用红/绿渲染星级；差评靠红边框/标签表达，好评靠绿标识表达。

### Prefer（推荐）
- 大留白 + 适中圆角 + 柔和暖阴影 表达「温暖」；深炭文字 + 高对比 表达「可信」。
- 所有状态同时用「颜色 + 图标 + 文字」三重编码，不单靠颜色。
- 数字（信用分/金额/运单号）用 mono 或 tabular-nums 保证对齐。
- 信任三要素同时出现时按顺序组织：人（信用/认证）→ 物（成色/安全）→ 平台（担保/状态机）。

---

## 11. Agent Prompt Guide（Phase 3 双端生成指南）

### 11.1 Key Instructions（硬性要求）

1. **直接消费本文件的 CSS 变量**，不得自行发明色值；全部颜色/间距/圆角/阴影从 §2/§4 取用。
2. **信任三要素全站贯穿**：每个页面至少出现 2 类要素（人/物/平台）；信任组件落点按 §8.1 执行，严禁单页孤岛。
3. **状态编码必须「颜色+图标+文字」三重表达**；绿/红/琥珀/蓝/灰语义严格遵守 §2.3 + §10。
4. 中文文案使用简体中文、真实感数据（玩具名/年龄段/信用分/运单号/金额/评价），禁止 lorem。
5. 字体栈使用 §3.1 完整回退栈；标题优先 `--font-display`，正文 `--font-sans`，信用分/金额/运单号 `--font-mono` 或 tabular-nums。
6. 对比度底线：正文 ≥4.5:1，语义深阶文字 ≥4.5:1，按钮文字按 §2 标注执行。
7. **双端差异化**：Web=浏览决策/订单管理/会员（大屏信息密度）；小程序=拍照发布/聊天/提醒（移动交互优先），页面不可简单复制。
8. 小程序按 375px 基准 + 底栏 49px + safe-area；Web 桌面优先 + 按 §9.1 降级。

### 11.2 每页信任组件落点清单（Phase 3 逐页检查）

**Web 端（8 页）：**

| 页面 | 必须出现的信任组件 |
|------|-------------------|
| ① 落地页 | 信任三要素展示区（信用分徽章样例 + 成色标签样例 + 服务费保障条）+ 如何交换三步 + 会员权益对照卡 |
| ② 平台首页·发现 | 每个玩具卡：成色标签(M) + 主人信用分徽章(S) + 认证标识(S)；顶部信用提示条 |
| ③ 玩具详情页 | 作者卡（信用分徽章 L + 认证标识 + 收到互评摘要）+ 成色标签 L + 安全提示标签 + 实拍规范提示 + 服务费保障条 |
| ④ 发起交换页 | 服务费保障条（¥1.9/会员免）+ 我的玩具交换池（每卡成色标签）+ 留言模板 |
| ⑤ 交换订单列表 | 每订单卡：状态机 mini（当前状态徽章 + 3 点进度）+ 双方玩具缩略（成色标签） |
| ⑥ 交换订单详情页 | 服务费保障条（担保/放款）+ 完整状态机（含双轨运单）+ 确认收货 + 互评入口 + 异常/仲裁入口 |
| ⑦ 我的主页 | 信用分概览（L 徽章 + 分值 + 升级进度条）+ 认证标识状态卡 + 收到的互评卡列表 |
| ⑧ 会员订阅页 | 会员权益对照卡（普通/月/年）+ 免服务费计算器 + 订阅 CTA |

**小程序端（4 Tab + 子页）：**

| 页面 | 必须出现的信任组件 |
|------|-------------------|
| Tab1 发现 | 玩具卡：成色标签(M) + 主人信用分徽章(S) |
| Tab2 消息 · 聊天 | 头像旁认证标识/信用分徽章(S) + 意向卡内服务费保障条 + 订单状态入口 |
| Tab3 发布 | 成色选择器（四档 + 对照说明）+ 实拍规范提示（≥3 张/瑕疵特写）+ 安全提示标签必填（适龄 + 小零件） |
| Tab4 我的 | 信用分概览 + 认证标识 + 我的交换（状态机 mini）+ 评价记录（互评卡列表） |
| 子页·玩具详情 | 作者卡 + 成色标签 L + 安全提示标签 |
| 子页·发起交换 | 服务费保障条 + 交换池成色标签 |
| 子页·订单详情 | 状态机（竖排）+ 双轨运单 + 确认收货 + 仲裁入口 |
| 子页·评价 | 星级选择器 + 快捷标签（互评卡编辑器，评价后信用分即时更新提示） |
| 子页·会员 | 会员权益对照卡 |

### 11.3 Quick CSS Snippet（核心令牌速查 · 含 v2 新增）

```css
:root {
  /* ===== Brand / Primary（沿用 v1） ===== */
  --color-primary:#F2B33D; --color-primary-strong:#D98E1F;
  --color-primary-tint:#FCF0D8; --color-primary-ink:#7A4E0D;
  /* ===== Accent（沿用 v1） ===== */
  --color-accent:#F27355; --color-accent-strong:#C94324; --color-accent-tint:#FCE8E0;
  /* ===== Semantic（沿用 v1） ===== */
  --color-success:#3E7C59; --color-success-tint:#E7F2E8; --color-success-text:#2F5D46;
  --color-warning:#9A6510; --color-warning-tint:#FAEBD3; --color-warning-text:#7A4E0D;
  --color-danger:#C2402F;  --color-danger-tint:#FBE4DF;  --color-danger-text:#A83325;
  --color-info:#43618E;    --color-info-tint:#E8EFF7;   --color-info-text:#35506E;
  --color-neutral:#8A7C6A; --color-neutral-tint:#F3EADB;
  /* ===== Neutral / Text（沿用 v1） ===== */
  --color-bg:#FBF6EC; --color-surface:#FFF; --color-surface-muted:#F8F1E6; --color-surface-sunken:#F3EADB;
  --color-border:#E9DFCE; --color-border-strong:#D6C8B0; --color-divider:#EFE7D9;
  --color-text-primary:#33291F; --color-text-secondary:#6B5E4F; --color-text-tertiary:#7A6C5A;
  --color-text-inverse:#FFF; --color-text-on-primary:#33291F;
  --color-disabled:#B8AB99; --color-disabled-bg:#EFE8DC;
  /* ===== ★ v2 新增：信用等级色（alias 语义色） ===== */
  --color-credit-sprout:#8A7C6A;       --color-credit-sprout-tint:#F3EADB;      /* 500-599 新芽 灰 */
  --color-credit-growing:#9A6510;      --color-credit-growing-tint:#FAEBD3;     /* 600-799 成长 琥珀 */
  --color-credit-trusted:#3E7C59;      --color-credit-trusted-tint:#E7F2E8;     /* 800-949 信赖 绿 */
  --color-credit-elite:#2F5D46;        --color-credit-elite-tint:#DCEBDD;       /* 950+ 优选 深绿 */
  /* ===== ★ v2 新增：成色标签色（alias 语义色） ===== */
  --color-condition-new:#3E7C59;       --color-condition-new-tint:#E7F2E8;      /* 全新 绿 */
  --color-condition-9new:#43618E;      --color-condition-9new-tint:#E8EFF7;     /* 9成新 蓝 */
  --color-condition-8new:#9A6510;      --color-condition-8new-tint:#FAEBD3;     /* 8成新 琥珀 */
  --color-condition-used:#8A7C6A;      --color-condition-used-tint:#F3EADB;     /* 有使用痕迹 灰 */
  /* ===== ★ v2 新增：星级 / 担保 ===== */
  --color-star:#F2B33D;  --color-star-empty:#D6C8B0;                            /* 互评星级 */
  --color-guarantee:#3E7C59; --color-guarantee-tint:#E7F2E8;                    /* 平台担保 */
  /* ===== Typography（沿用 v1） ===== */
  --font-display:"Nunito","Quicksand","PingFang SC","Source Han Sans SC","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif;
  --font-sans:"Inter","PingFang SC","Source Han Sans SC","Noto Sans SC","Microsoft YaHei",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-mono:"SF Mono","JetBrains Mono",ui-monospace,Menlo,monospace;
  /* ===== Space / Radius / Shadow（沿用 v1） ===== */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px;
  --space-8:32px; --space-10:40px; --space-12:48px; --space-16:64px; --space-20:80px;
  --radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-xl:24px; --radius-full:999px;
  --shadow-xs:0 1px 2px rgba(61,45,30,0.05);
  --shadow-sm:0 2px 6px rgba(61,45,30,0.07);
  --shadow-md:0 6px 18px rgba(61,45,30,0.09);
  --shadow-lg:0 12px 32px rgba(61,45,30,0.12);
  --shadow-xl:0 20px 48px rgba(61,45,30,0.16);
  --focus-ring:0 0 0 3px rgba(242,179,61,0.40);
}
```

---

## 12. 设计令牌 DTCG 参考（核心子集 · v2 更新）

```json
{
  "color": {
    "primary": { "$type": "color", "$value": "#F2B33D" },
    "accentStrong": { "$type": "color", "$value": "#C94324" },
    "success": { "$type": "color", "$value": "#3E7C59" },
    "warning": { "$type": "color", "$value": "#9A6510" },
    "danger": { "$type": "color", "$value": "#C2402F" },
    "info": { "$type": "color", "$value": "#43618E" },
    "neutral": { "$type": "color", "$value": "#8A7C6A" },
    "creditSprout":   { "$type": "color", "$value": "#8A7C6A" },
    "creditGrowing":  { "$type": "color", "$value": "#9A6510" },
    "creditTrusted":  { "$type": "color", "$value": "#3E7C59" },
    "creditElite":    { "$type": "color", "$value": "#2F5D46" },
    "conditionNew":   { "$type": "color", "$value": "#3E7C59" },
    "condition9New":  { "$type": "color", "$value": "#43618E" },
    "condition8New":  { "$type": "color", "$value": "#9A6510" },
    "conditionUsed":  { "$type": "color", "$value": "#8A7C6A" },
    "star": { "$type": "color", "$value": "#F2B33D" },
    "starEmpty": { "$type": "color", "$value": "#D6C8B0" },
    "guarantee": { "$type": "color", "$value": "#3E7C59" },
    "bg": { "$type": "color", "$value": "#FBF6EC" },
    "surface": { "$type": "color", "$value": "#FFFFFF" },
    "textPrimary": { "$type": "color", "$value": "#33291F" },
    "textSecondary": { "$type": "color", "$value": "#6B5E4F" }
  },
  "fontFamily": {
    "display": { "$type": "fontFamily", "$value": ["Nunito", "Quicksand", "PingFang SC", "sans-serif"] },
    "sans": { "$type": "fontFamily", "$value": ["Inter", "PingFang SC", "sans-serif"] },
    "mono": { "$type": "fontFamily", "$value": ["SF Mono", "JetBrains Mono", "monospace"] }
  },
  "spacing": {
    "space1": { "$type": "dimension", "$value": "4px" },
    "space4": { "$type": "dimension", "$value": "16px" },
    "space6": { "$type": "dimension", "$value": "24px" },
    "space8": { "$type": "dimension", "$value": "32px" }
  },
  "borderRadius": {
    "md": { "$type": "dimension", "$value": "10px" },
    "lg": { "$type": "dimension", "$value": "16px" },
    "full": { "$type": "dimension", "$value": "999px" }
  }
}
```

---

*本文件由设计系统专家彩格调产出，供 Phase 3 双端原型构建师直接消费；若后续出现品牌手册等资产，按品牌提取协议（Locate→Download→Grep Hex→Codify→Vocalise）融合更新。*
