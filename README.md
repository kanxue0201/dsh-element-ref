# dsh-element-ref · 元素引用

像 Codex 那样点网页里的元素。

在 DSH 右栏自带的浏览器里打开你在开发的页面，点一下元素，它就带一个编号气泡：旁边的小胶囊里写评论，
左边「调节」按钮打开样式面板（文本、颜色、背景、透明度、字体字号字重、圆角、边框、宽高、内外边距），
改的时候页面实时预览。可以连着标几处，每标一处右栏就按编号顺序多一条批注；
按对话框右下角那个发送键，一段只针对这几处的修改请求直接进入对话。改的是局部，不是整页重写。

## 装了什么

- **对话框里的注释条**：保存过的元素按顺序排成 chip（纯标签，悬停看这条的要求），
  鼠标移上去右侧出现 × —— 点它只取消这一处；发送时一条消息把每处批注写成块级卡片、
  你自己打的话单独成段。
- **浏览器地址行里的光标按钮**：网址输入框右边、打开按钮左边，跟后退/刷新同一排。
  它是地址行里的真实 flex 子项（28px 固定，不靠绝对定位），所以浏览器一打开就在、任何面板宽度都不重叠；
  点一下开启点选（变实心蓝），再点一下关闭——关闭等于「这一轮作废」，没发出去的 chip 一起清掉。
- **页面内拾取脚本**：`GET /element-ref/picker.js`，由 host 按当前 GUI 地址生成。
  正常路径是插件把它注入 DSH 自己的右栏浏览器（webview），所以**项目里不需要装任何脚本**；
  外部浏览器里也能手动加载它，跨源可用。
- **样式面板**：点元素后弹出，按元素类型裁剪字段、内外边距两对边带锁定、每个框独立撤销、
  颜色用自带取色弹层（预设 / 中性 / 色板 / 自定义 + 吸管），下面「0.8.0 之前没有的东西」有详述。
- **模型侧的工具**：`element_ref_details` 返回每处批注的选择器、HTML 快照、关键样式、
  改动记录和你写的要求；选中 `img` / `svg` / `canvas` 时会额外截一张元素图，路径一起给出。
- **数据路由**：`POST /element-ref/collect`（页面上报）、`POST /element-ref/draft`（实时草稿）、
  `GET /element-ref/items`（右栏与输入框里的注释条轮询）、`POST /element-ref/update`、
  `POST /element-ref/command` + `GET /element-ref/commands`（给页面的指令：打开某一处、同步评论、删除标号）、
  `POST /element-ref/shot`（元素截图落盘）、`POST /element-ref/consume`（发送后把草稿转成「已用」行，
  仍然可以被工具读到）、`POST /element-ref/reassign`（把新任务里攒的行改挂到真实会话）、
  `POST /element-ref/purge`、`POST /element-ref/delete`、`POST /element-ref/clear`。

插件不调用模型、不改你的代码：它只把「这一个元素」变成一段结构化上下文，
交给普通对话，让 agent 按你平时的规矩去改。

## 用起来

1. 右栏展开自带浏览器（或输入开发地址如 `http://127.0.0.1:3210/` 点「打开」）。
2. 点网址输入框右边的光标按钮，脚本注入当前页面；在页面里点你想改的元素。
   `Shift+点击` 选父级，`Esc` 收起面板/胶囊，再按一次退出点选。
3. 元素左上角出现编号气泡（28px），旁边弹出一条小胶囊：
   - 直接在胶囊里写这句要求，回车或点 ✓ 收起；
   - 点胶囊左边的「调节」打开样式面板（可拖动）；
   - 什么都没写、没改又点了别的元素，这条空批注会跟着挪过去，不占编号。
4. **编号气泡可以点**：点一下重新打开这一处的面板，再点一下收起。
   收起时如果这一处还没保存，预览过的样式会**还原**成打开前的样子（见第 7 条）。
5. 继续点别的元素，编号按顺序累加。页面里没有发送按钮：每加一处就同步到右栏，
   发送只在对话框里发生。
6. **发送只有一个出口**：输入框右下角那个发送键（以及回车）在输入框为空时也是亮的，
   按下去把所有批注打包成一条消息发出去；你另外打的字会作为补充要求另起一段。
   注释条本身没有发送按钮，也点不开任何面板。
7. 面板里的一切都先「预览」：选色、改宽高、调字号立刻生效在页面上，
   但只有点 `保存`（或 ✓）才真正落定；不保存就把面板收起来，那一处的内联样式会退回原样。
   `取消` 则是整条批注作废（标号、样式、草稿一起清）。

**0.8.0 之前没有的东西**

- 面板按元素类型裁剪：图片不显示文本/颜色/字号，纯容器不显示文本，`textarea` 直接改它的 `value`。
- 内边距 / 外边距：`上/底部`、`左/右` 两对，中间那个 15px 正圆链条**锁定**后改一边另一边跟着改；
  折叠时四个数字挤成一行分段控件。
- 每个框左边有小撤销按钮（改过才出现），撤销回**第一次打开这个元素时**看到的页面原值，
  所以「保存 → 重开 → 撤销」也能真的撤回去；内外边距四个框各自撤。
- 颜色弹层：基础（默认 / 纯透明）、中性 12 阶、10 色相 × 6 明度色板、自定义（饱和度方块 + 色相条 +
  吸管），全流程统一输出 `rgb()` / `rgba()`；打开弹层不会立刻改值。
- 字体 / 字重是自绘圆角菜单，不再调系统 `<select>`。
- 改边框（颜色 / 宽度 / 圆角）时高亮框会收起一次，并且**一直保持隐藏到保存或收起面板**，
  免得挡住元素自己的边框；平时高亮常亮。高亮框本身画在元素外侧、直角，不压元素边框。
- 边框宽度会连带 `border-style: solid`，并逐边写入；遇到站点用 `!important` 锁死某条边时会提示。

**取消这一轮**：批注面板右上角的 × 不是「收起」，而是「这一轮作废」——右栏的 chip 立刻清空，
页面上的标号被撤掉、预览过的样式还原成原样。只是折叠面板就点编号气泡。

**地址行那个光标按钮也是同一套语义**：点它关闭点选时，还没发出去的 chip 一起作废、页面标号撤掉、
拾取器销毁；已经发出去的那几条不动（模型可能还在读它们的细节）。

浏览器还没打开时点光标按钮，它会先把右栏浏览器打开，再注入拾取器。

拾取列表最多保留 50 条，刷新页面不影响右栏里的历史；浏览器页刷新后点选会自动重新注入。

## 外部浏览器（可选）

不想用右栏浏览器（例如要 DevTools、或页面在 https 上）时，把拾取脚本装进页面：

把下面任一方式贴进你的项目即可，地址里的端口换成当前 GUI 的端口（应用标题栏/设置里能看到，每次重启可能不同）：

```html
<!-- 任意页面，放 body 末尾；地址换成你自己的 GUI 端口 -->
<script src="http://127.0.0.1:<GUI 端口>/element-ref/picker.js"></script>
```

```ts
// Vite / React main.tsx，仅在本地开发时加载
if (import.meta.env.DEV) {
  void import('http://127.0.0.1:<GUI 端口>/element-ref/picker.js' as string)
}
```

```tsx
// Next.js app/layout.tsx，只在开发环境渲染
{process.env.NODE_ENV === 'development' && (
  <script src="http://127.0.0.1:<GUI 端口>/element-ref/picker.js" async />
)}
```

页面是 https 时浏览器会拦掉 http 的脚本（混合内容），此时用书签或控制台那两种方式，
或者直接用 http://localhost 访问开发页。

## 拾取脚本上报了什么

选择器、标签名、id、class、文本（截断）、outerHTML（截断）、关键计算样式、
同源脚本线索（React/Vue 开发模式下的文件名与行列）、外层结构摘要、页面地址与标题；
另外还有批注顺序 `order`、评论 `requirement`，以及你在样式面板里动过的字段 `adjustments`
（形如 `{"字号":"64px","文本颜色":"#111111"}`）。
只上报这些；不发页面内容、不发网络请求、不注入要改的代码。

跨源说明：脚本从 DSH GUI 的地址加载，向同一地址 `POST /collect`，因此走 CORS
（`access-control-allow-origin: *`）。这是本机开发工具，接口不做鉴权，不要把它开到公网。

## 开发

```
lib/index.js    host 半：13 条路由（picker.js / collect / draft / items / update / command / commands / delete / clear / consume / restore / shot / debug）
lib/picker.js   页面内批注脚本（编号气泡 + 评论胶囊 + 可拖拽样式面板 + 指令轮询）
lib/client.js   界面半：右栏页、引导卡片、地址行光标按钮、输入框内的注释条
cordis.patch.yml  insert 一条 entry 进 cordis 树
preview/address-row.html  地址行的静态复现（真实 toolbar CSS + 注入按钮），用于核对布局
```

手写客户端 bundle，无需构建：`window.__ModuleLoader__.load({ id, factory })`，
`factory` 返回 cordis 插件对象（`inject` + `apply`）。`require('react')` 由宿主提供。

自检：

```
npm run smoke                    # 三套一起跑
node scripts/smoke-server.mjs    # 起一个临时 HTTP 服务，跑通全部路由（含 shot / consume / reassign / purge）
node scripts/smoke-client.mjs    # 用桩 Loader/ctx 跑一遍界面半的注册
node scripts/smoke-picker.mjs    # 用桩 DOM 跑一遍批注脚本（编号、胶囊、面板字段、撤销、上报）
node scripts/check-profile.mjs   # 按 Electron 的方式组合 desktop profile，确认能解析到本包
```

## 安装与生效

### 下载安装（不 clone 仓库）

从 [Releases](https://github.com/kanxue0201/dsh-element-ref/releases/latest) 下载 `dsh-element-ref-0.8.1.zip`，解压到任意目录，然后在该目录执行：

```bash
node scripts/install-into-profile.mjs             # 装进默认 desktop profile
node scripts/install-into-profile.mjs --dry-run   # 先看它会写什么
node scripts/install-into-profile.mjs --profile <profile 目录>
```

它会写 profile 的 `package.json`（`dependencies` + `dsh.profile.bundles`）并建 `node_modules` 链接，装完重启一次 DSH。

### 从本地源码装（开发者）

已装进 desktop profile：`package.json` 的 `dependencies` 指向本目录，`dsh.profile.bundles` 末尾加了
`dsh-element-ref`，`node_modules/dsh-element-ref` 是指回这里的 junction。

host 半（路由）在应用启动时加载，**改路由逻辑要重启一次应用**；`lib/picker.js` 是每次请求现读的，
改批注脚本只需重新点一次光标按钮（或刷新右栏浏览器页）；界面半（地址行按钮、注释条、发送桥）刷新 DSH 页面即可。
重启后 `http://127.0.0.1:<GUI 端口>/element-ref/items` 应返回带 `rev` / `version` 字段的空列表。

## 权限与数据边界

| 项目 | 说明 |
| --- | --- |
| DSH 能力 | `webServer`（注册本机路由）、`tools`（注册 `element_ref_details` 工具）、`slots` / `sidebarRight`（地址行按钮注入）、`uiConversation`（消息里的批注卡片） |
| 文件访问 | 只写系统临时目录：`%TEMP%\dsh-element-ref-shots\*.png`，且**仅在**选中 `<img>` / `<svg>` / `<canvas>` 时写 |
| 网络 | 只在本机回环端口提供 HTTP 路由，不向外发请求；页面脚本向同一端口回传数据 |
| 凭据 | 不读取、不存储任何密钥或登录态 |
| 命令执行 | 不执行 shell 命令；`lib/picker.js` 由宿主注入到右栏 webview |
| 页面数据 | 上报选择器、标签、class、截断文本/HTML、关键计算样式、批注与 `adjustments`；不抓页面截图以外的像素，不读跨域 iframe |

## 已知风险

- **本地路由无鉴权**：同一台机器上任何进程都能读写批注列表（`/element-ref/*`）。这是本机开发工具，不要把它映射到公网。
- **会改页面 DOM**：点选时插入高亮层与预览样式，刷新页面即消失；`取消` / 关掉点选会还原。
- **依赖 DSH 内部形态**：地址行 DOM、composer 卡片、`conversation.user.text.node` 插槽和 `uiConversation` 规则都是内部接口，DSH 升级后可能需要跟着改。
- **热更新残留**：模块热替换时旧副本可能还在跑（已用一次性通行证、开机扫描缓解）。升级后若行为怪异，重启一次应用最稳。

## 兼容的 DSH 版本

`package.json` 声明 `engines.dsh >= 0.2.0-rc.2`；实测开发环境为桌面版 `0.2.2-rc.1`。

## 卸载

1. 从 profile 的 `package.json` 里把 `dsh-element-ref` 从 `dsh.profile.bundles` 移除（或 `plugin_manager` 里禁用）；
2. 删掉 `dependencies` 中指向本目录的 `link:` 项；
3. 重启 DSH。残留物只有 `%TEMP%\dsh-element-ref-shots\`，可以直接删。

## 许可证

MIT，全文见 [LICENSE](LICENSE)。
