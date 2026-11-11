# dsh-element-ref · 元素引用

像 Codex 那样点网页里的元素，只改这一处。

在 DSH 右栏自带的浏览器里打开你在开发的页面，点一下元素，它就带一个编号气泡：旁边的小胶囊里写评论，
左边「调节」按钮打开样式面板（文本、颜色、背景、透明度、字体字号字重、圆角、边框、宽高、内外边距），
改的时候页面实时预览。可以连着标几处，每标一处右栏就按编号顺序多一条批注；
按对话框右下角那个发送键，一段只针对这几处的修改请求直接进入对话。改的是局部，不是整页重写。

## 装了什么

- **对话框里的注释条**：点选过的元素按批注顺序排成 chip，保存后才出现；发送时一条消息把每处批注写成块级卡片、把你自己打的话单独成段。
- **浏览器地址行里的光标按钮**：网址输入框右边、打开按钮左边的方框+指针图标，跟后退/刷新同一排。
  它是地址行里的真实 flex 子项（28px 固定，不靠绝对定位），所以浏览器一打开就在、任何面板宽度都不重叠；
  点一下在当前页面开启点选，进入点选后变实心蓝。这是主入口；会话头部的按钮已经去掉。
- **页面内拾取脚本**：`GET /element-ref/picker.js`，由 host 按当前 GUI 地址生成。
  正常路径是插件把它注入 DSH 自己的右栏浏览器（webview），所以**项目里不需要装任何脚本**；
  外部浏览器里也能手动加载它，跨源可用。
- **数据路由**：`POST /element-ref/collect`（页面上报）、`POST /element-ref/draft`（页面实时上报正在写的批注）、
  `GET /element-ref/items`（右栏与输入框内的注释条轮询）、
  `POST /element-ref/update`（右栏改批注）、`POST /element-ref/command` + `GET /element-ref/commands`
  （右栏给页面的指令：打开某一处的调节框、同步评论）、`POST /element-ref/draft`（实时草稿见上）、
  `POST /element-ref/delete`、`POST /element-ref/clear`（列表整理）。

插件不调用模型、不改你的代码：它只把「这一个元素」变成一段结构化上下文，
交给普通对话，让 agent 按你平时的规矩去改。

## 用起来

1. 右栏展开自带浏览器（或先打开 `元素引用` 页，输入开发地址如 `http://127.0.0.1:3210/` 点「打开」）。
2. 点网址输入框右边的光标按钮，脚本被注入当前页面；在页面里点你想改的元素。`Shift+点击` 选父级，`Esc` 关闭当前批注（再按一次退出）。
3. 元素左上角出现编号气泡，旁边弹出小胶囊：
   - 直接在胶囊里写这句评论，回车或点 ✓ 收起来；什么都没写又去点别的元素时，这条空批注会跟着挪过去，不占编号；
   - 点胶囊左边的「调节」按钮打开样式面板（宽度约 300px，可按住面板拖动、鼠标移到面板上是抓手）：
     面板顶部也能写这条批注，和胶囊双向同步；14 项基础样式改完立刻作用在页面上，
     `保存` 留下，`取消` 把这一条草稿整个丢掉（样式还原、气泡和编号一起消失）。
   - 刚点出来的空批注（没写评论、没改样式），**再点一次这个元素、或点它自己的编号气泡**就等于取消；`Esc` 先收起面板/胶囊，再按一次退出点选。
4. 继续点别的元素，编号会按顺序累加。页面里没有任何发送按钮：每加一处就同步到右栏，发送只在对话框里发生。
5. 右栏 `元素引用` 页按编号列出每处：选择器、文本、源码线索、以及你在面板里改的样式。
   每张卡片上：铅笔让页面打开这一处的调节框，
   卡片里的批注文本框和页面里的胶囊同步。「插入引用」把整段请求放进输入框，自己再补一句。
6. **不用等「发送」**：输入框里（光标那一行上方）会实时出现「<标签> 编号」的注释条——页面上每加一个批注、改一句评论、动一个样式，
   都会在约 0.3 秒内同步到那里。点开展开卡片列表：铅笔让页面打开这一处的调节框，
   卡片里的批注文本框和页面里的胶囊双向同步。
7. **发送只有一个出口**：只要还有批注，输入框右下角那个发送键（以及回车）在输入框为空时也是亮的，
   按下去就把所有批注打包成一段请求发出去；输入框里另外打的字会作为「补充要求」追加在末尾。
   注释条本身没有发送按钮。

**取消这一轮**：批注面板右上角的 × 不是「收起」，而是「这一轮作废」——右栏的 chip 立刻清空，
页面上的标号被撤掉、预览过的样式还原成原样。想只是折叠面板，点一下上面的 chip 就行。

浏览器还没打开时点光标按钮，它会先把右栏浏览器打开，再注入拾取器。

「只改样式」给出视觉局部修改的版本，「复制」拿到同样的整段文本。
拾取列表最多保留 50 条，刷新页面不影响右栏里的历史；浏览器页刷新后点选会自动重新注入。

## 外部浏览器（可选）

不想用右栏浏览器（例如要 DevTools、或页面在 https 上）时，把拾取脚本装进页面：

右栏「怎么用」里有现成的一行命令和书签脚本。手写进项目时，地址固定为 GUI 的 origin：

```html
<!-- 任意页面，放 body 末尾；地址换成你自己的 GUI 端口 -->
<script src="http://127.0.0.1:59276/element-ref/picker.js"></script>
```

```ts
// Vite / React main.tsx，仅在本地开发时加载
if (import.meta.env.DEV) {
  void import('http://127.0.0.1:59276/element-ref/picker.js' as string)
}
```

```tsx
// Next.js app/layout.tsx，只在开发环境渲染
{process.env.NODE_ENV === 'development' && (
  <script src="http://127.0.0.1:59276/element-ref/picker.js" async />
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
node scripts/smoke-server.mjs    # 起一个临时 HTTP 服务，跑通九条路由
node scripts/smoke-client.mjs    # 用桩 Loader/ctx 跑一遍界面半的注册
node scripts/smoke-picker.mjs    # 用桩 DOM 跑一遍批注脚本（编号、同步、面板、上报）
node scripts/check-profile.mjs   # 按 Electron 的方式组合 desktop profile，确认能解析到本包
```

## 安装与生效

已装进 desktop profile：`package.json` 的 `dependencies` 指向本目录，`dsh.profile.bundles` 末尾加了
`dsh-element-ref`，`node_modules/dsh-element-ref` 是指回这里的 junction。

host 半（路由）在应用启动时加载，**改路由逻辑要重启一次应用**；`lib/picker.js` 是每次请求现读的，
改批注脚本只需重新点一次光标按钮（或刷新右栏浏览器页）；界面半（右栏页、按钮）刷新 DSH 页面即可。
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
