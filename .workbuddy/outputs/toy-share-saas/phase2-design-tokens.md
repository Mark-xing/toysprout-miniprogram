# 家长玩具共享平台「童芽 ToySprout」· Phase 2 设计系统选择与设计令牌文档

> 设计系统专家：彩格调（Cai）｜ 面向 Phase 3 原型构建师可直接消费的令牌规范
> 状态：已锁定方向，本文件为唯一权威设计令牌来源（单源真相 Single Source of Truth）
> 品牌：童芽 ToySprout（示例品牌名）｜ 气质：温暖 · 可信 · 可持续 · 亲子陪伴 · 克制专业

---

## 〇、设计系统候选方案对比

基于 Phase 1 需求摘要（场景：家长玩具共享 SaaS；受众：25–40 岁家长；调性：Soft Warm 为主 + Modern Minimal 为辅；核心主线：信任可视化），从 71 套品牌级设计系统中筛选 3 套候选，风格互不雷同，各有明确适配点：

| 方案 | 设计系统 | 匹配度 | 特征 | 适合原因 |
|------|---------|--------|------|---------|
| **A** | **Airbnb**（共享经济 · 信任驱动） | ★★★★★ | 暖色亲和 + 圆角卡片 + 珊瑚色系 + 「信任=平台生命线」的验真/评价/保障体系 | 与「玩具共享 + 消毒信任可视化」商业模式**同构**：Airbnb 的「房东验真/用户评价/房源保障」可逐点映射到「消毒批次/质检报告/追溯体系」；珊瑚橙主色与品牌方向高度一致；Soft Warm 基座 + Modern Minimal 细节的天然范本 |
| **B** | **Notion**（现代极简 · 功能纪律） | ★★★★☆ | 低饱和中性 + 清晰信息层级 + 卡片/列表/侧边导航组件纪律 | 为产品界面与二期 SaaS 后台提供「功能优先」的骨架纪律，防止暖色失控成「儿童乐园感」；排版层级与数据密度规范可整体复用 |
| **C** | **Stripe**（专业可信 · 交易透明） | ★★★☆☆ | 克制排版 + 「透明即信任」的账单/规则呈现 + 金融级严谨 | 押金规则、费用透明、损坏赔付界定等「规则透明化」页面可借鉴其排版与文案纪律；为「可信」维度补足专业背书 |

**推荐方案（A+B 融合定制）**：

> **以 Airbnb 为「体」（暖色亲和、信任体系、共享经济心智），以 Notion 为「用」（组件克制、信息层级、SaaS 功能底座），以 Stripe 为「鉴」（交易透明、规则可信）。** 融合产出品牌化设计令牌「童芽 ToySprout / WarmTrust」。

此方案符合交接要点：Soft Warm 基座 + Modern Minimal 细节；避免卡通幼稚；信任可视化组件族作为一等组件纳入设计系统。

---

# 童芽 ToySprout · 设计令牌（W3C DTCG 风格）

---

## 1. Visual Theme（视觉主题）

**Philosophy**: 让每一次「共享」都可见地安全——温暖如家的信任体验，专业如仪器的品质承诺。
**Direction**: Soft Warm（柔和温暖）为主 + Modern Minimal（现代极简）细节；圆角适中、留白充足、克制不幼稚。
**Personality**: warm（温暖）、trustworthy（可信）、sustainable（可持续）、approachable（亲和）、disciplined（克制专业）。
**Reference**: Airbnb 信任体系 × Notion 组件纪律 × Stripe 规则透明；品牌色=奶油暖黄/珊瑚橙/鼠尾草绿。
**Visual Metaphor**: 「温暖的家 + 透明的工艺」——所有信任信息（消毒/质检/追溯）以可视化组件露出，不做隐藏式承诺。

---

## 2. Color Palette（色彩令牌）

> 权威值为 HEX；OKLCh 为参考近似值。所有文本色已按 WCAG 2.1 AA 校验（对比度标注为「白底/米白底」）。

### 2.1 Brand / Primary（品牌主色 · 奶油暖黄）

| Token | HEX | OKLCh(≈) | 用途 | 对比度 |
|-------|-----|----------|------|--------|
| `--color-primary` | `#F2B33D` | oklch(0.79 0.15 80) | 品牌身份色：Logo、激活态、进度条、高亮胶囊底色 | 配深炭文字 ≥8:1 |
| `--color-primary-strong` | `#D98E1F` | oklch(0.68 0.13 75) | 暖黄深阶：描边、图标描边、非文字强调 | — |
| `--color-primary-tint` | `#FCF0D8` | oklch(0.95 0.04 85) | 暖黄浅底：激活导航项、软按钮底色、标签底 | 与深琥珀文字 ≥6:1 |
| `--color-primary-ink` | `#7A4E0D` | oklch(0.55 0.10 70) | 暖黄语义文字（黄底/黄浅底上的文字） | 白底 ≥6:1 |

### 2.2 Accent（点缀色 · 珊瑚橙）

| Token | HEX | OKLCh(≈) | 用途 | 对比度 |
|-------|-----|----------|------|--------|
| `--color-accent` | `#F27355` | oklch(0.70 0.19 40) | 亮珊瑚：装饰填充、图标点缀、激活指示、进度高亮 | 配深炭文字 ≥4.5:1 |
| `--color-accent-strong` | `#C94324` | oklch(0.55 0.19 35) | **主 CTA 按钮底色**（白字）、链接色、危险级品牌强调 | 白字 ≥4.9:1 |
| `--color-accent-tint` | `#FCE8E0` | oklch(0.93 0.04 40) | 珊瑚浅底：标签底色、「租赁中」状态 | 与深炭文字 ≥9:1 |

### 2.3 Semantic（语义色 · 绿=安全 / 琥珀=提醒 / 红=风险 / 蓝=信息）

| Token | HEX | OKLCh(≈) | 用途 | 对比度(白底) |
|-------|-----|----------|------|--------------|
| `--color-success` | `#3E7C59` | oklch(0.55 0.08 155) | **安全语义**（消毒合格/已归还/可追溯）；白字按钮可用 | ≥4.9:1 |
| `--color-success-tint` | `#E7F2E8` | oklch(0.93 0.03 155) | 安全徽章/报告卡浅底 | — |
| `--color-success-border` | `#BFD8C6` | — | 安全描边 | — |
| `--color-success-text` | `#2F5D46` | oklch(0.47 0.06 155) | 安全语义文字（浅底上） | 浅底 ≥6:1 |
| `--color-warning` | `#9A6510` | oklch(0.55 0.12 70) | **提醒语义**（消毒中/待处理/押金提醒） | ≥4.9:1 |
| `--color-warning-tint` | `#FAEBD3` | oklch(0.94 0.05 80) | 提醒徽章浅底 | — |
| `--color-warning-border` | `#EAD3A4` | — | 提醒描边 | — |
| `--color-warning-text` | `#7A4E0D` | — | 提醒语义文字（浅底上） | 浅底 ≥6:1 |
| `--color-danger` | `#C2402F` | oklch(0.55 0.17 30) | **风险语义**（逾期/损坏/赔付/拒绝）；白字按钮可用 | ≥5.1:1 |
| `--color-danger-tint` | `#FBE4DF` | oklch(0.93 0.04 30) | 风险徽章浅底 | — |
| `--color-danger-border` | `#F0C9BF` | — | 风险描边 | — |
| `--color-danger-text` | `#A83325` | — | 风险语义文字（浅底上） | 浅底 ≥5:1 |
| `--color-info` | `#43618E` | oklch(0.52 0.07 260) | **信息语义**（配送中/物流追踪） | ≥6:1 |
| `--color-info-tint` | `#E8EFF7` | oklch(0.93 0.02 250) | 信息徽章浅底 | — |
| `--color-info-border` | `#C3D2E4` | — | 信息描边 | — |
| `--color-info-text` | `#35506E` | — | 信息语义文字（浅底上） | 浅底 ≥6:1 |
| `--color-neutral` | `#8A7C6A` | oklch(0.60 0.03 80) | 中性语义（待消毒/已提交） | ≥4.5:1 |
| `--color-neutral-tint` | `#F3EADB` | oklch(0.93 0.02 85) | 中性徽章浅底 | — |
| `--color-neutral-border` | `#DBCDB8` | — | 中性描边 | — |

> ⚠️ **语义锚定（全站不可变）**：**绿色永远=安全/合格/成功；红色永远=风险/损坏/逾期；琥珀=进行中/提醒。** 禁止用绿色表示「危险」或红色表示「通过」。

### 2.4 Neutral / 背景（暖调中性阶）

| Token | HEX | 用途 | 对比度 |
|-------|-----|------|--------|
| `--color-bg` | `#FBF6EC` | 页面背景（暖米白） | 主文字 ≥13:1 |
| `--color-surface` | `#FFFFFF` | 卡片/面板/表单背景 | 主文字 ≥14:1 |
| `--color-surface-muted` | `#F8F1E6` | 交替区块/次级面板 | — |
| `--color-surface-sunken` | `#F3EADB` | 按下态/凹陷区/输入框底 | — |
| `--color-border` | `#E9DFCE` | 默认边框/分隔线 | — |
| `--color-border-strong` | `#D6C8B0` | 输入框/强调边框 | — |
| `--color-divider` | `#EFE7D9` | 细分隔线 | — |
| `--color-text-primary` | `#33291F` | 标题/正文（深暖炭） | 白底 ≥14:1 |
| `--color-text-secondary` | `#6B5E4F` | 次级正文/说明 | 白底 ≥6.3:1 |
| `--color-text-tertiary` | `#7A6C5A` | 注释/元信息（小字） | 白底 ≥5:1 |
| `--color-text-inverse` | `#FFFFFF` | 深色/主色按钮上的文字 | — |
| `--color-text-on-primary` | `#33291F` | 黄/珊瑚浅底上的深色文字 | ≥4.5:1 |
| `--color-disabled` | `#B8AB99` | 禁用态（仅非关键信息） | ≈3:1（禁用豁免） |
| `--color-disabled-bg` | `#EFE8DC` | 禁用态底色 | — |

### 2.5 色彩使用规则

- 正文/说明文字只用中性阶（text-primary/secondary/tertiary）；彩色仅用于语义、装饰、按钮与状态。
- **黄色/亮珊瑚不作为小号正文文字**（对比度不足），如需彩色文字请用 primary-ink / accent-strong / semantic-text 深阶。
- 大面积背景建议保持暖米白/纯白；品牌色用作点缀与高亮（建议占比 ≤15%）。
- 装饰性彩色背景上一律使用深炭文字 `--color-text-on-primary`，禁止白字。

---

## 3. Typography（排版令牌）

### 3.1 Font Stacks（完整回退栈 · 覆盖中英文）

```css
--font-display: "Nunito", "Quicksand", "PingFang SC", "Source Han Sans SC",
                "Noto Sans SC", "Microsoft YaHei", system-ui, -apple-system,
                "Segoe UI", sans-serif;   /* 品牌展示/大标题：拉丁字符圆润暖感，中文回落 PingFang/思源黑体 */
--font-sans: "Inter", "PingFang SC", "Source Han Sans SC", "Noto Sans SC",
             "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif; /* UI 正文 */
--font-mono: "SF Mono", "JetBrains Mono", "Cascadia Code", ui-monospace,
             "SFMono-Regular", Menlo, monospace;  /* 批次号/报告编号/追溯码 */
```

> 说明：中文环境优先系统黑体（PingFang SC / 思源黑体 / Noto Sans SC / 微软雅黑），不引入衬线正文；大标题可借 Nunito 的圆润几何提升暖感。

### 3.2 Type Scale（字号阶梯 · 桌面端优先）

| Token | Size | Weight | Line-height | Letter-spacing | 用途 |
|-------|------|--------|-------------|----------------|------|
| `--text-display` | 44px / 2.75rem | 800 | 1.15 | -0.02em | Hero 大标题（落地页） |
| `--text-h1` | 32px / 2rem | 700 | 1.2 | -0.01em | 页面主标题 |
| `--text-h2` | 26px / 1.625rem | 700 | 1.3 | -0.01em | 区块标题 |
| `--text-h3` | 20px / 1.25rem | 600 | 1.4 | 0 | 卡片标题 |
| `--text-h4` | 17px / 1.0625rem | 600 | 1.45 | 0 | 子标题/分组 |
| `--text-body-lg` | 17px / 1.0625rem | 400 | 1.65 | 0 | 引导文案/卡片正文 |
| `--text-body` | 16px / 1rem | 400 | 1.6 | 0 | 正文（默认） |
| `--text-body-sm` | 14px / 0.875rem | 400 | 1.55 | 0 | 次级正文/表格 |
| `--text-caption` | 13px / 0.8125rem | 400/500 | 1.5 | 0 | 说明/脚注 |
| `--text-micro` | 12px / 0.75rem | 500/600 | 1.4 | +0.02em | 徽章/标签/按钮小字 |
| `--text-num` | 与语境同级 | 700 | 1.2 | 0 | 数字/价格/进度（用 display 字体 + `font-variant-numeric: tabular-nums`） |

### 3.3 Weight / 其他

- 字重阶梯：400（正文）→ 500（强调正文/标签）→ 600（按钮/卡片标题）→ 700（标题）→ 800（仅 Display）。
- 中文长段正文使用 400、行高 1.6–1.65，避免过密；标题 700。
- 价格/数字统一 `tabular-nums`，保证对齐与可读。

---

## 4. Spacing / Radius / Shadow（间距 · 圆角 · 阴影令牌）

### 4.1 Spacing（4px 基准间距阶梯）

| Token | Value | 用途 |
|-------|-------|------|
| `--space-1` | 4px | 图标与文字间距 |
| `--space-2` | 8px | 紧凑内间距（徽章内） |
| `--space-3` | 12px | 控件内边距、标签间距 |
| `--space-4` | 16px | 默认内边距（紧凑卡片） |
| `--space-5` | 20px | 常规内边距 |
| `--space-6` | 24px | 卡片内边距、栅格 gutter |
| `--space-8` | 32px | 区块内分隔 |
| `--space-10` | 40px | 区块间分隔 |
| `--space-12` | 48px | 大区块分隔 |
| `--space-16` | 64px | Landing 区块垂直节奏 |
| `--space-20` | 80px | Hero 上下留白 |

### 4.2 Radius（圆角）

| Token | Value | 用途 |
|-------|-------|------|
| `--radius-sm` | 6px | 标签、小控件、复选框 |
| `--radius-md` | 10px | 按钮、输入框、下拉 |
| `--radius-lg` | 16px | **卡片、报告卡、面板** |
| `--radius-xl` | 24px | Hero 面板、弹窗、大容器 |
| `--radius-full` | 999px | 胶囊徽章、头像、进度圆 |

### 4.3 Shadow（柔和暖调阴影 · 禁止冷黑纯阴影）

| Token | Value | 用途 |
|-------|-------|------|
| `--shadow-xs` | `0 1px 2px rgba(61,45,30,0.05)` | 扁平层级微投影 |
| `--shadow-sm` | `0 2px 6px rgba(61,45,30,0.07)` | 卡片默认/按钮 |
| `--shadow-md` | `0 6px 18px rgba(61,45,30,0.09)` | 卡片 hover、下拉 |
| `--shadow-lg` | `0 12px 32px rgba(61,45,30,0.12)` | 弹窗、浮层 |
| `--shadow-xl` | `0 20px 48px rgba(61,45,30,0.16)` | 全屏遮罩、Hero 强调 |
| `--focus-ring` | `0 0 0 3px rgba(242,179,61,0.40)` | 键盘焦点环（黄） |

### 4.4 Z-index Scale

| Token | Value | 层级 |
|-------|-------|------|
| `--z-base` | 0 | 内容 |
| `--z-dropdown` | 100 | 下拉/浮层 |
| `--z-sticky` | 200 | 吸顶导航 |
| `--z-modal` | 300 | 弹窗 |
| `--z-toast` | 400 | 轻提示 |
| `--z-tooltip` | 500 | 提示气泡 |

---

## 5. Component Styles（组件规范）

> 所有组件均以 2.1–2.4 色彩令牌与 4.x 几何令牌构建；状态（hover/focus/disabled）统一按本节执行。

### 5.1 Button（按钮）

| Variant | BG | Text | Border | Hover | 用途 |
|---------|-----|------|--------|-------|------|
| **Primary** | `--color-accent-strong` `#C94324` | `#FFFFFF` | none | `#B53A1F` + shadow-md | 主 CTA（立即订阅/立即租/确认归还） |
| **Secondary** | `--color-surface` `#FFF` | `--color-text-primary` | 1px `--color-border-strong` | bg `--color-bg` | 次级操作（加入心愿单/查看详情） |
| **Soft** | `--color-primary-tint` | `--color-primary-ink` | none | bg `#F9E9C4` | 温暖辅助操作（浏览玩具库/续租） |
| **Ghost** | transparent | `--color-text-secondary` | none | bg `--color-surface-sunken` | 轻量操作（取消/返回） |
| **Danger** | `--color-danger` | `#FFFFFF` | none | `#A83325` | 危险操作（解除绑定/拒绝赔付） |

- 尺寸：lg 48px / md 44px（默认）/ sm 36px / xs 28px；radius-md（10px）。
- Primary/Soft 配 `--shadow-xs`；hover 统一 `translateY(-1px)` + `--shadow-sm`。
- Disabled：`--color-disabled-bg` 底 + `--color-disabled` 文字，去阴影。
- 文字：16px/600（md），sm 14px/600；按钮内文字**不用品牌黄/亮珊瑚**（对比度不足）。

### 5.2 Card（卡片）

- 默认：`--color-surface` 白底、1px `--color-border`、`--radius-lg` 16px、padding `--space-6`、无阴影（扁平）。
- Hover：`translateY(-2px)` + `--shadow-md` + 边框转 `--color-border-strong`。
- Featured（推荐套餐/重点玩具）：顶部 4px 品牌色条（`--color-primary` 或 `--color-accent`），或 1.5px `--color-primary` 描边。
- Compact：padding `--space-4`、`--radius-lg` 用于网格密集区。

### 5.3 Badge / Status Tag（徽章 · 状态标签）

- 结构：胶囊（`--radius-full`）、padding 2px 10px、`--text-micro` 12px/600、高 22px、可带 12px 图标。
- 状态色（统一「浅底+深字」规则）：

| 状态 | BG | Text | 场景 |
|------|-----|------|------|
| 成功/合格 | `--color-success-tint` | `--color-success-text` | 已消毒/质检合格/已归还 |
| 提醒/进行中 | `--color-warning-tint` | `--color-warning-text` | 消毒中/待消毒/押金待确认 |
| 风险 | `--color-danger-tint` | `--color-danger-text` | 逾期/损坏待赔付 |
| 信息/配送 | `--color-info-tint` | `--color-info-text` | 配送中/物流追踪 |
| 中性 | `--color-neutral-tint` | `--color-text-secondary` | 已提交/已排期 |

- 实心徽章（白色文字）仅限需要强视觉的少数场景（如 Hero 顶部「100% 消毒」），用 semantic 深色实底 + 白字。

### 5.4 Form Controls（表单控件）

- Input/Select/Textarea：高 44px（textarea 除外）、`--radius-md`、1px `--color-border-strong`、底 `--color-surface`；
  focus：`--focus-ring` + 边框转 `--color-primary`；placeholder `--color-disabled`；label 14px/600 `--color-text-primary`。
- 校验：error 边框 `--color-danger` + 下方 13px `--color-danger-text` 提示；success 边框 `--color-success` + 绿勾。
- Checkbox/Radio：accent 用 `--color-accent-strong`，半径 4px/圆；Switch 开态 `--color-success`。
- 日期选择（归还日/续租）：日历网格 32px 单元格，选中日 `--color-accent-strong` 白字，今天描边 `--color-primary`。

### 5.5 Navigation（导航）

- **顶部导航（落地页）**：高 72px；默认透明/暖米白，滚动后白底+`--shadow-sm`；Logo=暖黄芽图形+品牌名；CTA=Primary 按钮。
- **侧边导航（登录后仪表盘）**：宽 240px，底 `--color-surface`，右侧 1px `--color-border`；激活项=`--color-primary-tint` 底 + 左侧 3px `--color-primary` 指示条 + `--color-text-primary`；未激活=图标 20px + `--color-text-secondary`；图标 hover 转 `--color-accent-strong`。
- Tab：激活下划线 `--color-primary` 2px + `--color-text-primary`；未激活 `--color-text-secondary`。

### 5.6 进度与数据呈现

- 会员等级/消毒进度条：高 8px、`--radius-full`、轨道 `--color-surface-sunken`、填充 `--color-primary`（或珊瑚渐变 `#F2B33D → #F27355`）；数值用 `--text-num` tabular。
- 数据统计块：`--text-h2` 700 + 单位 `--text-body-sm` secondary；可在块内加 small 同比箭头（成功=绿，下滑=红）。

---

## 6. Trust Component Family（信任可视化组件族 · 一等组件）

> 依据 Phase 1 核心结论「信任可视化是贯穿全站的核心体验主线」，以下 4 类组件为全站一等组件，落地页/仪表盘/详情页/流程页均需出现。

### 6.1 消毒报告卡 Sanitization Report Card

**结构**（卡片：`--color-surface` + `--radius-lg` + 1px `--color-border`；左缘 4px `--color-success` 标识条）：

```
┌──────────────────────────────────────────────┐
│ [✓盾 质检合格] 本件已通过标准化消毒质检     TS-20250613-0421
│ ─────────────────────────────────────────── │
│  ①预清洁 → ②UV/高温消毒 → ③质检 → ④密封封装  （4 步横排）
│   08:20      08:42       09:05     09:11
│ ─────────────────────────────────────────── │
│ 质检员：张 质检员No.071 · 本批 36 件 100% 通过
│ [查看完整检测报告 →]（accent-strong 链接，mono 编号）
└──────────────────────────────────────────────┘
```

- 头部：质检徽章（见 6.2）+ 主文案 16px/600 + 报告编号（`--font-mono`、`--text-caption`、secondary）。
- 4 步流程：等宽图标 + 12px 标签 + 时间戳；完成步绿勾（`--color-success`），进行步琥珀（`--color-warning`）带呼吸点动画。
- 尾部：质检员工号（可信背书）+ 「查看完整检测报告」链接（`--color-accent-strong`）。
- **状态变体**：
  - 已消毒可租（默认）：绿标识条 + 绿徽章「质检合格」
  - 消毒中：琥珀标识条 + 琥珀徽章「消毒中」+ 进度条
  - 待消毒/已归还待复检：中性灰标识条 + 中性徽章「待消毒」
- 无障碍：徽章文字对比 ≥4.5:1；状态不只靠颜色，同时配图标与文字。

### 6.2 质检徽章 Quality Badge

| Variant | 样式 | 文案 |
|---------|------|------|
| **合格 Certified** | `--color-success-tint` 底 + `--color-success-text` + 盾/勾图标，胶囊 | 「质检合格」「100% 消毒」 |
| **检测中 In Progress** | `--color-warning-tint` + `--color-warning-text` + 计时图标 | 「检测中」 |
| **待检 Pending** | `--color-neutral-tint` + `--color-text-secondary` + 时钟图标 | 「待检」 |

- 尺寸：大号（信任区/Hero，14px/600 + 16px 图标）与小号（卡片内，12px/600 + 12px 图标）。
- 常与报告编号联用：`[✓ 质检合格 · TS-20250613-0421]`（编号 mono 字体）。

### 6.3 批次追溯条 Batch Trace Bar

**结构**（横向步骤条，节点数 5–6，用于详情页/归还页/信任页）：

```
入库 → 消毒 → 质检 → 配送 → 使用中 → 归还复检
 ●完成  ●完成  ●完成  ●进行中  ○未开始  ○未开始
 06-11  06-12  06-13  06-14    —        —
```

- 节点状态：完成=绿实心（`--color-success`）+ 勾；进行中=琥珀实心（`--color-warning`）+ 呼吸动画；未开始=灰（`--color-neutral-border`）。
- 连线：完成段绿色实线，未开始段灰虚线。
- 每个节点可点击 → 气泡展示：时间戳（mono）、责任环节、关联报告链接。
- 顶部/尾部显示批次号：`--font-mono` 12px secondary（如 `BATCH-20250613-0421`）。

### 6.4 安全标识 Safety Badge（信任点）

- 结构：盾形/圆角方形图标 + 短文案，图标 20px（大）/16px（小）。
- 常用 4 组：`100% 消毒`（绿盾）｜ `质检合格`（绿勾盾）｜ `全程可追溯`（琥珀追踪图标）｜ `无铅 · 无 BPA`（绿叶）。
- 落地页信任区以 3–4 个并排展示（横排、等宽、浅底卡片或纯文字+图标）；卡片内以小尺寸单行展示。
- 颜色纪律：安全类用 `--color-success`/tint，品质/服务类用 `--color-primary`/tint，禁止混用语义。

---

## 7. Icons & Graphics（图标与图形语言）

- **风格**：线性图标（outline），stroke 1.75px（小尺寸可 2px），圆头端点与圆角连接（linecap/linejoin round，拐角半径 2px），24px 基准网格。
- **常用图标集**：盾（质检）、水滴/喷雾（消毒）、叶片（环保）、循环箭头（共享循环）、卡车（配送）、日历（归还日）、星（推荐）、勾/感叹（状态）、儿童/萌芽（品牌）。
- **配色**：默认 `--color-text-secondary`；激活/强调 `--color-accent-strong` 或 `--color-primary`；安全语义 `--color-success`；禁用 `--color-disabled`。
- **插画语言**：扁平几何、圆角饱满（非尖锐）、暖色调；禁止写实卡通脸谱，保持「现代亲子」克制感。
- **装饰图形**：允许微妙渐变（黄→珊瑚），仅用于 Hero 背景/进度填充，面积 ≤15%。

---

## 8. Layout（布局令牌）

- 容器：`--container` 1200px（落地页内容区）；仪表盘内容区 max 1280px（含侧边栏 240px 后自适应）。
- 栅格：12 列、gutter `--space-6`（24px）、页边距 24px；桌面端卡片网格 3/4 列，详情区 2 列（左图右信息）。
- 垂直节奏：Landing 区块间距 `--space-16`（64px）；仪表盘区块 `--space-8`（32px）；卡片内 `--space-6`。
- 密度：标准密度（信息适中）；数据列表行高 48px、紧凑列表 40px。
- 信任元素位置规范：消毒报告卡=详情页第一屏右侧/下方、仪表盘订单卡内嵌；质检徽章=每个玩具卡左上角；批次追溯条=详情页报告卡内 + 归还确认页顶部。

---

## 9. Responsive Behavior（响应式行为）

> 首期桌面端优先，以下为预留规则（Phase 3 可不完整实现，但结构上需可降级）。

| Breakpoint | Width | 行为 |
|------------|-------|------|
| Desktop | ≥1024px | 全布局：侧边栏 240px + 12 列栅格 |
| Tablet | 768–1023px | 侧边栏收为图标栏 64px；卡片 2 列 |
| Mobile | <768px | 单列堆叠；侧边导航→底部 Tab；报告卡 4 步改竖排；CTA 全宽 |

- 文本自适应：Display 44→36→28px；H1 32→28→24px。
- 触点：移动端按钮高 ≥44px，点击区 ≥48px。
- 信任组件移动端降级：批次追溯条转为纵向列表（节点=行），报告卡纵向堆叠。

---

## 10. Cautions（设计禁区 · 反模式）

### Never Do（禁止）
1. **儿童乐园感**：高饱和糖果撞色、大面积卡通插画、过度圆润所有元素（连按钮都 `--radius-full`）——家长是成人消费者，克制专业优先。
2. **黄色小字正文**：`#F2B33D` 等亮色直接作正文/小字（对比度不足）；彩色文字只用深阶（primary-ink / accent-strong / semantic-text）。
3. **语义错位**：用绿色表示「危险」、红色表示「通过」；绿只=安全/合格，红只=风险/逾期。
4. **纯黑冷阴影**：`rgba(0,0,0,…)` 冷阴影破坏暖调；一律用暖棕调 `rgba(61,45,30,…)`。
5. **装饰底上白字**：暖色浅底上放白字（对比度崩坏）；浅底一律深炭文字 `--color-text-on-primary`。
6. **信任信息隐藏化**：消毒/质检/追溯仅存在于详情页而仪表盘/订单卡缺失——信任组件是全站一等元素。
7. **虚拟占位敷衍**：消毒批次号、质检员工号、报告编号必须为可读格式（如 `TS-20250613-0421`），禁止 "lorem" 或空字符串。

### Prefer（推荐）
- 大留白 + 适中圆角 + 柔和暖阴影 表达「温暖」；深炭文字 + 高对比 表达「可信」。
- 所有状态同时用「颜色 + 图标 + 文字」三重编码，不单靠颜色。
- 数字（价格/进度/批次）用 mono 或 tabular-nums 保证对齐。

---

## 11. Agent Prompt Guide（Phase 3 生成指南）

### Key Instructions（给原型构建师的硬性要求）
1. **直接消费本文件的 CSS 变量**，不得自行发明色值；全部颜色/间距/圆角/阴影从 2.x/4.x 节取用。
2. 首期 4 页（落地页/仪表盘/详情页/流程页）**每页至少出现 1 处信任组件**：落地页=安全标识组+消毒三要素；仪表盘=订单卡消毒状态；详情页=完整消毒报告卡；流程页=归还页批次追溯条。
3. 状态编码必须「颜色+图标+文字」三重表达；绿/红语义严格遵守 §10.3。
4. 中文文案使用简体中文、真实感数据（玩具名/年龄段/消毒批次/质检员编号），禁止 lorem。
5. 字体栈使用 §3.1 完整回退栈；标题优先 `--font-display`，正文 `--font-sans`，编号 `--font-mono`。
6. 对比度底线：正文 ≥4.5:1，语义深阶文字 ≥4.5:1，按钮文字按 §2 标注执行。
7. 桌面端优先、hover/focus 状态齐全；响应式降级按 §9 预留，不强制实现。

### Quick CSS Snippet（核心令牌速查）

```css
:root {
  /* Brand / Primary */
  --color-primary: #F2B33D; --color-primary-strong: #D98E1F;
  --color-primary-tint: #FCF0D8; --color-primary-ink: #7A4E0D;
  /* Accent */
  --color-accent: #F27355; --color-accent-strong: #C94324; --color-accent-tint: #FCE8E0;
  /* Semantic */
  --color-success: #3E7C59; --color-success-tint: #E7F2E8; --color-success-text: #2F5D46;
  --color-warning: #9A6510; --color-warning-tint: #FAEBD3; --color-warning-text: #7A4E0D;
  --color-danger: #C2402F;  --color-danger-tint: #FBE4DF;  --color-danger-text: #A83325;
  --color-info: #43618E;    --color-info-tint: #E8EFF7;   --color-info-text: #35506E;
  --color-neutral: #8A7C6A; --color-neutral-tint: #F3EADB;
  /* Neutral / Text */
  --color-bg: #FBF6EC; --color-surface: #FFFFFF; --color-surface-muted: #F8F1E6; --color-surface-sunken: #F3EADB;
  --color-border: #E9DFCE; --color-border-strong: #D6C8B0; --color-divider: #EFE7D9;
  --color-text-primary: #33291F; --color-text-secondary: #6B5E4F; --color-text-tertiary: #7A6C5A;
  --color-text-inverse: #FFFFFF; --color-text-on-primary: #33291F;
  --color-disabled: #B8AB99; --color-disabled-bg: #EFE8DC;
  /* Typography */
  --font-display: "Nunito", "Quicksand", "PingFang SC", "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-sans: "Inter", "PingFang SC", "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace;
  /* Space */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px;
  --space-8:32px; --space-10:40px; --space-12:48px; --space-16:64px; --space-20:80px;
  /* Radius */
  --radius-sm:6px; --radius-md:10px; --radius-lg:16px; --radius-xl:24px; --radius-full:999px;
  /* Shadow */
  --shadow-xs:0 1px 2px rgba(61,45,30,0.05);
  --shadow-sm:0 2px 6px rgba(61,45,30,0.07);
  --shadow-md:0 6px 18px rgba(61,45,30,0.09);
  --shadow-lg:0 12px 32px rgba(61,45,30,0.12);
  --shadow-xl:0 20px 48px rgba(61,45,30,0.16);
  --focus-ring:0 0 0 3px rgba(242,179,61,0.40);
}
```

---

## 12. 设计令牌 DTCG 参考（核心子集）

```json
{
  "color": {
    "primary":        { "$type": "color", "$value": "#F2B33D" },
    "primaryStrong":  { "$type": "color", "$value": "#D98E1F" },
    "primaryTint":    { "$type": "color", "$value": "#FCF0D8" },
    "primaryInk":     { "$type": "color", "$value": "#7A4E0D" },
    "accent":         { "$type": "color", "$value": "#F27355" },
    "accentStrong":   { "$type": "color", "$value": "#C94324" },
    "accentTint":     { "$type": "color", "$value": "#FCE8E0" },
    "success":        { "$type": "color", "$value": "#3E7C59" },
    "successTint":    { "$type": "color", "$value": "#E7F2E8" },
    "successText":    { "$type": "color", "$value": "#2F5D46" },
    "warning":        { "$type": "color", "$value": "#9A6510" },
    "warningTint":    { "$type": "color", "$value": "#FAEBD3" },
    "warningText":    { "$type": "color", "$value": "#7A4E0D" },
    "danger":         { "$type": "color", "$value": "#C2402F" },
    "dangerTint":     { "$type": "color", "$value": "#FBE4DF" },
    "dangerText":     { "$type": "color", "$value": "#A83325" },
    "info":           { "$type": "color", "$value": "#43618E" },
    "infoTint":       { "$type": "color", "$value": "#E8EFF7" },
    "infoText":       { "$type": "color", "$value": "#35506E" },
    "bg":             { "$type": "color", "$value": "#FBF6EC" },
    "surface":        { "$type": "color", "$value": "#FFFFFF" },
    "border":         { "$type": "color", "$value": "#E9DFCE" },
    "borderStrong":   { "$type": "color", "$value": "#D6C8B0" },
    "textPrimary":    { "$type": "color", "$value": "#33291F" },
    "textSecondary":  { "$type": "color", "$value": "#6B5E4F" },
    "textTertiary":   { "$type": "color", "$value": "#7A6C5A" }
  },
  "fontFamily": {
    "display": { "$type": "fontFamily", "$value": ["Nunito", "Quicksand", "PingFang SC", "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", "sans-serif"] },
    "sans":    { "$type": "fontFamily", "$value": ["Inter", "PingFang SC", "Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", "sans-serif"] },
    "mono":    { "$type": "fontFamily", "$value": ["SF Mono", "JetBrains Mono", "ui-monospace", "Menlo", "monospace"] }
  },
  "spacing": {
    "space1": { "$type": "dimension", "$value": "4px" },
    "space2": { "$type": "dimension", "$value": "8px" },
    "space3": { "$type": "dimension", "$value": "12px" },
    "space4": { "$type": "dimension", "$value": "16px" },
    "space5": { "$type": "dimension", "$value": "20px" },
    "space6": { "$type": "dimension", "$value": "24px" },
    "space8": { "$type": "dimension", "$value": "32px" },
    "space12": { "$type": "dimension", "$value": "48px" },
    "space16": { "$type": "dimension", "$value": "64px" }
  },
  "borderRadius": {
    "sm":   { "$type": "dimension", "$value": "6px" },
    "md":   { "$type": "dimension", "$value": "10px" },
    "lg":   { "$type": "dimension", "$value": "16px" },
    "xl":   { "$type": "dimension", "$value": "24px" },
    "full": { "$type": "dimension", "$value": "999px" }
  }
}
```

---

*本文件由设计系统专家彩格调产出，供 Phase 3 原型构建师直接消费；若后续出现品牌手册等资产，按品牌提取协议（Locate→Download→Grep Hex→Codify→Vocalise）融合更新。*
