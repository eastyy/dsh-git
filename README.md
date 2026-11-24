# dsh-git

两个给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）用的 dsh 插件，放在一个仓库里，各自独立安装、互不依赖。

| 插件 | 做什么 | 市场分类 |
|---|---|---|
| [`packages/html-editor`](packages/html-editor) | 在 dsh 的 Web 界面里可视化编辑工作区的 HTML：点文字改文案、改颜色、删组件、撤销，保存写回原文件 | `ui` |
| [`packages/version-bubble`](packages/version-bubble) | 浮在窗口上的鲸鱼：一键把当前项目存成 git 版本，自动写一句版本说明，按时间查看版本树、回到任意一版，也能推到 GitHub / GitLab | `git` |

## 安装

两个包都声明了 `dsh.bundle`，用 dsh 的插件管理器安装，装完重启一次 dsh：

- 界面：**设置 → 插件 → 安装本地 bundle**，选中 `packages/<插件名>` 目录。
- 命令行：`dsh plugin add github:eastyy/dsh-git/packages/<插件名>`

安装后 Host 半侧不会热加载，必须重启。

## 目录

```
packages/html-editor/     可视化 HTML 编辑器
packages/version-bubble/  版本鲸鱼
market/                   提交到 awesome-dsh-plugin 收录列表用的两个条目
LICENSE                   MIT
```

每个包里有自己的 `README.md`、`cordis.patch.yml`、`locale/` 和 `icon.svg`。

## 许可证

MIT，见 [LICENSE](LICENSE)。
