# 项目长期记忆 — weixin-quan / 童芽 ToySprout 小程序

> 只记跨会话仍然有效、写代码时必须遵守的约定与踩过的坑。日常进展写在同目录的 `YYYY-MM-DD.md`。

## 代码约定（必须遵守）

1. **自定义组件的对外事件名绝不能与小程序原生事件名撞名**（`tap` / `longpress` / `touchstart` /
   `touchmove` / `touchend` / `touchcancel` / `input` / `change` / `confirm` / `load` / `error` /
   `scroll` / `submit` / `focus` / `blur` 等）。
   组件内部的原生事件会**冒泡出组件边界**命中父级写在组件标签上的 `bind:<同名>`，父级拿到的是
   原生事件的 `detail`（如 tap 的 `{x,y}` 触点坐标）而不是你 `triggerEvent` 传的 `detail`。
   本项目已因此出过 P0：`toy-card` 发 `tap` → 发现页拿到 `{x,y}` → 拼出 `?id=undefined` →
   详情页报「玩具不存在」。现用 `open` / `want`。
   **防线**：`scripts/check-event-contract.js`（跨文件契约检查，改组件事件名或页面绑定时必跑）。

2. **WXML 会把 `null` 渲染成字面量字符串「null」**，不像 React 自动消隐。
   凡「可选片段 + 分隔符」的拼接（`品类 · 城市 · 发布于日期` 这类），一律在 JS 侧用
   `utils/format.js` 的 `joinMeta()` 滤空后再交给模板，**不要写 `{{a}} · {{b}} · {{c}}`**。

3. **组件必须显式开 `options: { addGlobalClass: true }`**，否则 `app.wxss` 里的 class
   （`.badge` / `.condition--*` 等）对组件内节点完全无效。CSS 变量能生效是因为自定义属性可继承，
   容易让人误判"全局样式也生效了"。

4. **测试断言不许写死数量。** 数据会随发布/下架/兑换漂移，写死会整片误报、久套件就没人看了。
   一律从实时数据推导（`run-discover-e2e.js` 开头有参考快照 `SNAP_ITEMS`/`SNAP_TOTAL`）。
   本项目已因此误报过多次。**改断言后必须做反向验证**：把预期改错，确认它真的 FAIL，再改回。

5. **用户操作失败时绝不允许静默无反馈。** 每个失败分支都必须 toast 或弹窗——点一下什么都不发生，
   用户只会认为"按钮坏了"。已出过实例：详情页 `onRedeemTap` 在 `shippingPreview` 为 `null` 时
   直接 `return`，而自有玩具必然预览失败 → 「点击用积分兑换没反应」。
   **防线**：`scripts/check-detail-redeem.js`（35 条），核心是"总闸门"断言——
   每个失败分支的 `showToast + showModal` 调用次数之和必须 ≥ 1。改详情页交互后必跑。

6. **不要提供注定失败的操作入口。** 若服务端一定有 400 拒绝的分支（如对自有玩具兑换/交换/点想要），
   UI 就该把它隐藏或置灰，而不是让用户去点一个必然失败的按钮。

## 身份字段：`id` ≠ `openid`（极易混淆，务必看清）

- **全项目通用的身份键是 openid**：`toy.ownerId`、`swap.targetOpenid`、`wants._openid` 存的都是 openid。
- 但 `users` 文档有**两个**形似长十六进制串的字段，实测值：
  `_id: aeb30c436ac9a62f0007d87741086bab`、`_openid: ohav85CnID4kBNChnkEgNKmEcgrA`。
- `_shared/publicUser.js` 下发的 **`id` 取的是 `_id`，不是 openid**。
- ⚠️ **判断「这件玩具是不是我的」不要在前端拿 `userInfo.id` 比 `toy.ownerId`**（永远不等），
  一律用服务端下发的 **`isMine`**（`publicToy` 按 `cloud.getWXContext().OPENID` 计算）。
  身份只以云函数上下文为准，前端不该也不需要自己判断。
- 本项目已因此误判过一次（把 `_id` 当成 openid 记进了笔记）。

## 验证纪律

- **数值断言会漏掉真实渲染缺陷**。已漏过两次：`addGlobalClass` 缺失致成色标签无底色、
  WXML 渲染出字面量 `null`。所以关键页面改动后要看**真机渲染截图**（`mp.screenshot()` 可用）。
- 组件内部逻辑用 `scripts/check-toy-card.js` 的方式验证：Node 直接加载组件源码、捕获
  `Component()` 定义、手工构造最小 ctx 驱动真实方法体（断言的是会真正跑的那段代码）。
- 本机 automator **只能走逻辑层协议**，view 层协议全部挂起 → **无法模拟物理点击**，
  也拿不到组件实例。涉及手势/点击的最终确认**必须人工**。详见当日日志。

## 环境要点

- **云函数部署是异步的（本轮实测踩到，很容易误判成"代码没生效"）**：
  `manageFunctions(updateFunctionCode)` 返回 `success` **只代表请求被接受**，此后函数会进入
  `Status=Updating`，**此时调用仍跑旧代码**。表现为：改完部署、立刻 invoke，返回的还是旧行为。
  连打第二次写操作会直接报 `FUNCTION_UPDATING`（且提示"不要立即重试同一写操作"）。
  → **验证部署结果必须「部署 → 等 Status=Active → 再 invoke」**，别用一次 invoke 就下结论。
  （本轮 `toy.listWants` 第一次仍 404、`notify` 第一次仍走旧分支，都是这个原因。)
- ⚠️ **本地 mock 会按需自动建集合，所以"集合不存在"这个坑本地测试永远抓不到**。
  云函数侧对不存在的集合做 `where().get()` 会抛 `-502005`，写侧 `add()` 同样会失败。
  本轮新增的 `reports` / `blocks` / `feedbacks` / `notifications` 四个集合已建。
  新增集合后**必须去 CloudBase 实际创建**，不能只改代码。
- 微信开发者工具自动化端口：`ws://127.0.0.1:9420`，用
  `/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project <项目绝对路径> --auto-port 9420` 启动。
- Node 统一用 `/Users/xiangxingguo/.workbuddy/binaries/node/versions/22.22.2-6/bin/node`。
- 云函数各自独立打包，**不支持跨目录 require**。改 `cloudfunctions/_shared/` 后必须重跑
  `scripts/sync-shared.js` 分发到各云函数目录（各目录下的同名文件是构建产物，勿直接改）。
- 演示数据全部带 `seedDemo: true` 标记便于按标记清理；但库里还有**用户手动创建的玩具**，
  未带该标记，清理时注意别误删。

## GitHub 推送（实测结论，别重复踩）

- 工作区根目录 `/weixin-quan/` 是 git 仓库（2026-10-12 建，分支 `main`），remote 走 **SSH**：
  `git@github.com:Mark-xing/toysprout-miniprogram.git`。
- 环境里的 `GITHUB_TOKEN` 是个 **fine-grained PAT，只读**：读 200 / 写 403 / 创建仓库 403
  （`Resource not accessible`）。GitHub connector 用的是同一个 token，同样建不了仓库
  （`not accessible by integration`）。**所以 gh CLI 与 connector 都只能读，不能写、不能建仓。**
- ✅ **`~/.ssh/id_ed25519_github` 已注册到 GitHub 并通过认证**（返回 `Hi Mark-xing!`），
  `github.com` 已在 known_hosts。**推送一律走 SSH，不需要任何 token**，绕开 PAT 的写权限限制。
- 推论：**push 不需要凭据，但"创建仓库"必须由用户手动在网页完成**（或换成有 `repo` scope 的
  classic PAT）。用户已选手动创建，不共享凭据。
- 仓库级 `.gitignore` 排除：`node_modules/`、`.workbuddy/`（本地会话记忆，**只排除不删除**）、
  `.DS_Store`、`*.log`、`toysprout-mvp/data/*.db*`、`.env*`、`*.pem/*.key/*.p12/id_rsa*`。
  首次提交 178 个文件、约 5M（最大是 `generated-images/` 里的设计稿 PNG，778K）。

## 提审阻塞项

- `app.js` 的 `checkPrivacyAndSession` 只打日志，**从未真正调用 `wx.requirePrivacyAuthorize`**。
  头像昵称填写已属个人信息收集，**提审前必须处理**。
