# 源码与数据流地图

## 技术形式

Windows 便携式 Electron 程序。主进程在 `127.0.0.1` 的随机端口启动 Node HTTP 服务，再在受限浏览器窗口中打开本地页面。界面使用原生 JavaScript、CSS、HTML，没有 React/Vue 项目；运行数据是分类 JSON 文件，没有外部数据库。

## 按改动目标找文件

| 要处理的事情 | 先读文件/入口 |
| --- | --- |
| 桌面窗口、独立实例、退出、数据目录 | `app/electron.cjs`、`app/core/data-dir.cjs` |
| 本机接口、生成全过程、停止 | `app/server.cjs` 的 `/api/generate`、`/api/stop` |
| 原预设请求、工具与历史账本 | `app/core/original-runtime.cjs`、`app/core/engine.cjs` 的 `compileOriginal()` |
| 远端接口、流式响应、工具参数还原 | `app/core/provider.cjs` |
| MVU/EJS/脚本运行与前后快照 | `app/core/card-runtime.cjs` 的 `prepare()`、`complete()`；运行包 `app/vendor/card-runtime.js` |
| 世界书、角色绑定、角色删除保留聊天 | `app/core/worldbook.cjs`、`app/core/library.cjs` |
| 分类保存、写入日志、异常恢复 | `app/core/store.cjs` |
| 加密记住密钥、按服务隔离 | `app/core/api-key-store.cjs` |
| 生成前单步快照与恢复 | `app/core/generation-undo.cjs`、`Store.captureUndo()` / `restoreUndo()` |
| 通用聊天、编辑、重生成、连接设置 | `app/public/app.js` |
| 角色库、世界书管理、卡片消息桥 | `app/public/library-ui.js` |
| 卡片独立页面、消息桥、执行上下文 | `app/core/card-frame.cjs`、`app/public/frame-vendor.js` |
| 识别专属版与绑定的卡 | `app/core/special-edition.cjs` |
| 专属原生外层界面和单层导航 | `app/public/special.js`、`special.css` |
| 拆分回复、故事目录、本层记录 | `app/public/special-data.js` |
| 改原卡 UI 的呈现而不改其业务 | `app/core/special-card-ui.cjs`、`app/public/special-card.css` |
| 本地封装与专属版本 | `package.json`、`build.special.cjs` |

## 正常发送的一轮

`app.js send()` 先保存当前状态与页面草稿，再发送 `/api/generate`。服务端从已保存状态捕获一份独立撤回点，接着执行 `Runtime.prepare()`、`E.compile()`，由原预设完成重写。`provider.generate()` 请求模型并解析流式文本/工具参数；完整回复交给 `Runtime.complete()`，再把消息原文、显示结果、变量前后快照及账本保存。

同一条助手消息的不同内容不要混用：

- `content`：模型原文；思考和原始更新指令在这里。
- `renderedContent`：经过框架/模板处理、尚未插入完整展示页面的文本。
- `displayContent`：显示处理后的文本，可能包含很大的 base64 卡片 HTML。
- `runtime.after`：这一层的变量快照。
- `turnContext`：这轮原用户消息 ID、导演便笺、深思/模式信息。

专属正文读取 `renderedContent ?? content`，附带思考仍从原文提取。不要用 `displayContent` 重新搭目录，否则会反复解析嵌入页面和状态栏。

## 专属 UI 为什么保留一个 iframe

外层正文和辅助页是原生页面。左侧只有一个受限制的卡片 iframe，里面继续运行原卡服装/角色控制器。`special-card-ui.cjs` 识别已知的 base64 包装与文档结构，只改布局锚点；未知结构会报错。

打开功能面板时，宿主使用 `Element.moveBefore()` 将同一个 iframe 移入宽对话框，关闭后移回。不要用 `appendChild()`、重新赋 `src` 或复制 iframe 代替这一步：跨父节点移动若重载页面，会丢失正在编辑的表单草稿。

`library-ui.js` 的 `frameRegistry` 记录 frame、随机 nonce、所属聊天/消息、只读标志。消息必须匹配来源窗口和 nonce。历史只读的宿主拦截针对所有变量作用域，不仅是 MVU 消息变量。退出/卸载时释放票据，避免积累旧 frame。

## 保存与撤回边界

`Store` 将聊天、角色、世界书分文件写入，工作台清单索引这些文件；有待完成写入日志和上一份自动备份。读取 `Store` 本身可能创建目录或更新规范化的连接文件，因此只读审阅正式数据时，直接读文件或先复制，别在正式目录随手实例化 `Store`。

撤回点单独存在 `备份/回撤/最近一次生成.json`。它保存目标聊天、角色变量、全局变量与输入/阅读视图，不包含自己，不套娃。下一次生成覆盖、使用后消费；配置变化会使旧点失效。撤回不重放模型或 MVU，其他聊天、连接与主题不跟着回退。

## 两种滚动互不替代

页面只显示一个故事层，是前端挂载数量限制；模型的历史滚动是原预设的账本流程。通用版原规则达到 12 对后保留最近 4 对并归档更早 8 对。改 UI 时不要额外裁掉发送历史；完整聊天及变量快照继续保存。

## 服务与密钥

本机接口包含来源/本机会话校验；卡片 frame 有独立 nonce。不要把本机服务改为监听公网地址，也不要把 Node 权限打开给卡片 iframe。密钥由当前 Windows 用户的 DPAPI 加密，按接口协议、域名、端口隔离；普通设置/聊天导出只保存连接参数，不带密钥。
