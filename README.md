# dsh-element-ref · 元素引用

**在 DSH 右栏浏览器里点一下网页元素，把「改哪里、改成什么」直接交给模型。**

像 Codex 那样在真实页面上点选：点中的元素带编号气泡，可以在气泡里写一句「字体变粗」，也可以在左侧面板里逐项调样式；点底部发送键后，这一处的选择器、HTML 快照、当前样式与元素截图一起进入对话，模型据此改代码。默认本地运行——不联网（除你自己配的模型接口）、不写工作区、不需要另外装浏览器扩展。

---

## 它解决什么

改一个已经在跑的页面，最费时间的往往不是写那几行 CSS，而是「说清楚是哪一块」。把页面截图贴进对话，模型靠猜；手写选择器，人靠数。这个插件把「点哪儿、改成什么、现在长什么样」变成结构化上下文，交给普通对话去改，改动范围是这一处，不是整页重写。

## 能做什么

### 点选与标注

- 右栏浏览器打开任意页面，点一下元素就带上编号气泡；同一页可以连着标很多处，按顺序编号。
- `Shift + 点击` 向上选父级元素，`Esc` 退出点选。
- 再点一次编号气泡收起面板；面板里没保存的改动会回滚到打开前的样子。
- 每个标号都可点击：开着就收起，收起后再点重新打开这一处。

### 逐项调样式

- 文本、文本颜色、背景、Opacity、字体、字号、字重。
- 边框圆角、边框颜色、边框宽度、宽度、高度。
- 内边距 / 外边距：`上 / 底部` 与 `左 / 右` 两对，每对中间有锁定按钮（改一边另一边跟着动）。
- 字段按元素类型裁剪：图片只给盒子类属性，没有文本内容的容器不显示文字类字段，表单控件按 `value` 读写字。
- 颜色用自带的取色弹层：预设色板 + 饱和度/色相自定义 + `rgb()/rgba()/#hex` 输入 + 吸管；另有「默认」（去掉这处的该属性、回到页面继承值）与「纯透明」两个一键项。
- 每个字段改过就在框左侧出现撤销箭头，点一下退回页面原值；「默认」恢复的是页面原本的内联值，不是空。

### 交给模型

- 底部发送键（或回车）把这一轮组装成一条消息：编号卡片在上，你打的话在下，互不混杂。
- 模型侧通过 `element_ref_details` 工具拿到每处的选择器、标签、可见文本、HTML 快照、关键计算样式、你的改动记录与要求；`img / svg / canvas` 会额外附一张元素截图（绝对路径）。
- 发送后这一轮自动收尾：chip 清空、页面编号撤掉、拾取器退出；再次使用需要重新点按钮。

### 开关跟着标签页走

- 地址行右侧的「方框 + 指针」按钮常驻，是地址行里的真实 flex 子项，不靠绝对定位，任何面板宽度下都不会盖住别的图标。
- 点开即在当前页拾取（变实心蓝）；切到别的标签页图标变灰，但那一页的编号与面板状态保留，切回来继续。
- 只有「开着的那一页自己刷新」才作废这一轮。

## 安装

### 用 Release 里的 zip（推荐）

1. 下载本仓库最新 Release 的 `dsh-element-ref-<版本>.zip`，解压到任意目录（不必是工作区）。
2. 在解压目录执行：

   ```bash
   node scripts/install-into-profile.mjs
   ```

   默认装进 `C:\Users\<你>\.dsh\profiles\desktop`；换 profile 用 `--profile <名字>`，只想看会改什么用 `--dry-run`。脚本幂等，重跑只更新链接。
3. 重启 DSH。

### 从源码

```bash
git clone https://github.com/kanxue0201/dsh-element-ref.git
cd dsh-element-ref
node scripts/install-into-profile.mjs
```

### 手动接入

在目标 profile 的 `package.json` 里加两处（其余文件不动）：

```jsonc
{
  "dependencies": { "dsh-element-ref": "link:D:/path/to/dsh-element-ref" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "...", "dsh-element-ref"] } }
}
```

再在 profile 的 `node_modules` 里建一个指向仓库目录的 junction（脚本会代做这一步）。

## 用起来

1. 右栏展开自带浏览器，输入你在开发的地址（例如 `http://127.0.0.1:3210/`）。
2. 点地址行右侧的「方框 + 指针」按钮，脚本注入当前页面；在页面里点你想改的元素。
3. 在气泡里写要求，或点左侧扳手图标逐项调样式；改完点面板里的 ✓ 保存。
4. 需要改多处就继续点别的元素，右栏会按编号顺序排队。
5. 点对话框底部发送键（或回车），把这一轮交出去；模型改完代码，刷新页面看效果。

## 模型侧的工具

`element_ref_details`（可选参数 `order` 只取某一处）返回 JSON：

| 字段 | 内容 |
| --- | --- |
| `order` / `selector` / `tag` | 第几处、CSS 选择器、标签名 |
| `text` / `outerHTML` | 可见文本（截断）、HTML 快照（截断） |
| `styles` | 20 个关键计算样式 |
| `adjustments` / `requirement` | 你在面板里改的项、你写的要求 |
| `screenshot` | 图片类元素截图的绝对路径（没有则为空） |

## 权限与数据边界

- **files**：仅在选中 `img / svg / canvas` 时把元素截图写入 `<系统临时目录>/dsh-element-ref-shots/*.png`，不上传、不写工作区。
- **network**：仅在 `127.0.0.1` 上开 HTTP 路由供右栏与页面脚本通信；访问模型走你在设置里配的接口。
- **页面数据**：HTML 快照、选择器、样式只在你按发送时进入对话，不落盘。
- **卸载**：删掉 profile 的 `dependencies` 与 `dsh.profile.bundles` 条目即可，不留全局状态。

## 兼容性

- DSH `>= 0.2.0-rc.2`（桌面版实测 0.2.2-rc.1）
- Node.js `>= 20`
- 元素拾取跑在 DSH 内置浏览器的 webview 里，不需要另外装 Chrome 扩展
- 外部浏览器可手动加载 `GET /element-ref/picker.js`（host 按当前 GUI 地址生成），跨源可用

## 实现说明

- **界面半**（`lib/client.js`）：一个 cordis 插件，注册地址行按钮、对话框里的 chip 条与发送桥、`conversation.user.text.node` 插槽里的卡片渲染，以及自己的 user-text 规则（消息里的 `@[标签](dsh-element:N)` 线标记会被渲染成编号卡片）。
- **宿主半**（`lib/index.js`）：注册 `element_ref_details` 工具与一组本地 HTTP 路由：

  | 路由 | 用途 |
  | --- | --- |
  | `GET /element-ref/picker.js` | 页面拾取脚本（按当前 GUI 地址生成） |
  | `POST /element-ref/collect` | 页面上报一次标注 |
  | `POST /element-ref/draft` | 实时草稿（实时同步到右栏） |
  | `GET /element-ref/items` | 右栏与 chip 条轮询 |
  | `POST /element-ref/update` / `delete` / `clear` | 修改、删除、清空一轮 |
  | `POST /element-ref/command` + `GET /element-ref/commands` | 给页面的指令（打开某处、同步评论、删标号） |
  | `POST /element-ref/shot` | 元素截图落盘 |
  | `POST /element-ref/consume` | 发送后把草稿转成「已用」行（工具仍可读） |
  | `POST /element-ref/reassign` | 把新任务里攒的行改挂到真实会话 |
  | `POST /element-ref/purge` | 清掉某个会话名下未发送的行 |
  | `GET /element-ref/debug` | 最近 60 条自检 beacon（排查用） |

- **页面半**（`lib/picker.js`）：注入页面的 IIFE，负责高亮、编号、气泡、样式面板与取色弹层；版本号与宿主协商，旧版本会自动升级。
- 插件不调用模型、不改你的代码：它只把「这一个元素」变成结构化上下文，交给普通对话。

## 开发与测试

```bash
node scripts/check-bundle.mjs   # manifest / 出口 / 注入点自检
npm run smoke                   # 三套：host 路由、界面半、页面拾取脚本（假 DOM）
node scripts/preview-panel.mjs  # 用真实注入的 CSS 渲染面板预览到 preview/
```

`preview/` 下的 HTML 是纯静态预览，不参与运行；`scripts/tmp-*` 不留档。

## 已知限制

- 元素详情依赖拾取器注入页面：`file://` 页面与部分受限站点（CSP 很严、跨域 iframe 内部）取不到。
- 边框可能被页面自己的 `!important` 锁住，这种情况会提示「这一处的边框被页面样式锁住了」。
- 商店的自动准入要求 files/network 权限信号全为 false，本插件必然触发，因此只能走人工准入。

## 许可证

[MIT](LICENSE)
