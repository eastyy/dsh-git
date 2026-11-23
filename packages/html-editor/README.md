# dsh-html-editor

在 DeepSeek Harness 的 Web 界面里直接改 HTML：全屏画布 + 工作区文件列表 + 属性面板。点文字改文案，点组件改颜色，删除组件，随时撤销，保存写回原文件。

这是给设计原型用的编辑器，不替代代码审查：它改的是工作区里的 `.html` / `.htm` 文件。

## 能做什么

| 层级 | 操作 |
|---|---|
| 文字 | 双击页面里的文字直接改，或用右侧「文字」输入框；Enter / 点空白处生效 |
| 颜色 | 文字色、背景色、边框色；边框粗细；字号、加粗、对齐 |
| 组件 | 选中、复制、删除、还原单项颜色；撤销 / 重做整页改动 |
| 文件 | 列出工作区所有 HTML（自动跳过 `node_modules`、`dist` 等目录），搜索、切换、刷新 |
| 保存 | 写回原文件；覆盖前自动备份到 `.dsh-html-editor/backups/`（每个文件保留最近 12 份） |

入口有两处：

1. 左下角的 **HTML 编辑** 悬浮按钮。
2. 在 DSH 右侧文档预览里打开一个 `.html` 时，标题栏左侧会出现 **编辑** 按钮，点击直接进入同一个编辑器。

## 安装

需要 dsh 桌面版或 Web 版，Node.js ≥ 20。

1. **设置 → 插件 → 安装本地 bundle**，选中本目录（含 `package.json` 的那一层）。
2. 或命令行：`dsh plugin add github:<owner>/dsh-git/packages/html-editor`。
3. 重启 dsh 一次。Host 半侧不会热加载。

安装后确认：插件列表里出现「HTML 可视化编辑」，左下角出现 **HTML 编辑** 按钮。

## 使用

1. 点击左下角 **HTML 编辑**，或从文档预览的 **编辑** 按钮进入。
2. 左侧选择工作区里的 HTML 文件。
3. 在画布里单击组件选中；右侧属性面板出现。
4. 双击文字直接改；选中组件后改颜色、字号、对齐，或复制 / 删除。
5. `Ctrl/⌘ + S` 保存；`Ctrl/⌘ + Z` 撤销；`Ctrl/⌘ + Shift + Z` 重做；`Delete` 删除；`Esc` 退出文字编辑 / 取消选择。
6. 关闭编辑器时如果有未保存改动，会先确认。

## 设计约束

- **编辑时页面脚本不执行。** Host 用 nonce CSP 只放行编辑器自己的脚本，因此设计稿里的 `<script>` 和内联事件在编辑画布里不会运行，避免运行时 DOM 被写进保存结果。脚本标签本身会原样保留，保存后照常工作。
- **保存会规范化标记。** 保存的是浏览器序列化后的 DOM：属性引号、自闭合写法、空白可能和原文件不同，但结构与样式等价。需要逐字节保留时请用 git 对比。
- **只读写已注册工作区。** Host 只接受 DSH 已登记的工作区路径，路径解析会拒绝 `..` 和符号链接逃逸。
- **CSS / 图片按原相对路径加载。** 页面通过 `/__dsh-html-editor/fs/<workspace>/<path>` 提供，相对资源会落到同一路径前缀；绝对路径 `/assets/...` 仍指向应用根，不会指向工作区。
- **首版没有拖拽移动和自由画布。** 选中、改字、改色、删除、撤销、保存是这一版的边界；拖动位置、多选、响应式画板属于下一版。
- 若页面依赖 JavaScript 动态渲染，编辑画布可能只显示静态骨架；这类页面更适合先在浏览器预览，再只改静态文案。

## 备份与恢复

保存前如果文件内容会变化，旧内容写到：

```
<工作区>/.dsh-html-editor/backups/<文件名>/<YYYYMMDD-HHmmss-SSS>.html
```

每个文件保留最近 12 份。恢复时把对应备份复制回原路径即可；备份目录不会出现在文件列表里。

## 结构

```
package.json          dsh.bundle.patch + dsh.client
cordis.patch.yml      插入 Host 行
index.js              Host：工作区扫描、HTML 注入、保存、备份
client.js             Client：React 全屏界面、文件列表、属性面板
assets/editor.js      iframe 运行时：选中、改字、改色、撤销、序列化
locale/{zh,en}.json   插件管理里的标题与描述
icon.svg              插件图标（源文件）
assets/icon-180.png   市场卡片图标（位图）
screenshots.json      市场截图清单
test/                 独立 harness 与 CDP 集成测试
```

## 开发与自检

不启动 dsh 也能跑完整链路：fake Cordis context 挂载真实 Host 路由，Edge headless 通过 CDP 操作画布。

```powershell
node --check index.js
node --check client.js
node --check assets/editor.js
node test/verify.mjs   # 包清单、patch、locale、资源：离线
node test/cdp.mjs      # Host 契约 + iframe 运行时：24 项，需要 Edge
node test/ui.mjs       # React 客户端：16 项，需要 Edge
```

`test/.run/` 是临时工作区、截图和备份，可随时删除，已在 `.gitignore` 里。`test/mock/` 只用于客户端测试里的 React 运行时，不会被安装。

## 已知限制

- 页面自身 CSP `<meta>` 会被保留；如果它禁止内联/外部脚本，编辑器脚本可能被一起挡住。
- 编辑期间禁用 `connect-src`，设计稿里的 `fetch` / WebSocket 不会工作。
- 保存不处理 `<base>`：带 `<base href>` 的页面资源可能按 base 解析。
- 只支持 `.html` / `.htm`；SVG、Vue/React 源码不在范围内。

## 许可证

MIT，见 [LICENSE](LICENSE)。
