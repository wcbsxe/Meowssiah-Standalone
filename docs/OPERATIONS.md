# 本机运行、验证和回退

## 开发环境

当前实现使用 Node.js 24.18、Electron 45.3.0、electron-builder 26.18.0，版本以 lockfile 和本机实际安装为准。打开已有项目无需先重装；仅在依赖缺失或明确需要重新安装时运行 `npm ci`。

### 启动专属版

```powershell
# 在仓库根目录。先准备专门的测试存档副本，别直接指向正在玩的正式数据。
$env:MEOW_SPECIAL_EDITION = 'seraphina'
$env:MEOW_DATA_DIR = 'D:\本机测试副本\Meowssiah-Data'
npm start
```

要检查本机网页而不是窗口，可以在上述环境下用 `npm run web`。服务端口由 `PORT` 决定；不要修改成公网监听。

### 本地生成自用程序

```powershell
npm run build:special
```

输出到 `dist-seraphina-1.0.0`。专属配置复用项目已安装的 `node_modules/electron/dist`，避免重复下载相同 Electron；它仍需要正常的 electron-builder 打包组件/缓存。不要把构建结果提交到 Git 或发布到 GitHub。

## 最小定向验证

```powershell
# 专属拆分、目录、版本隔离、原输入信息与单步撤回：8 项
node --test tests/special.test.cjs tests/generation-undo.test.cjs

# 原脚本字节、工具/签名、历史滚动和流式格式：4 项
node --test --test-name-pattern='E1:|original initial context|12-pair archival|original formatter' tests/engine.test.cjs

# 待备份源码中的私人文件、密钥形状、文件哈希与语法
npm run check:source
```

默认不要运行全量 `npm test`。`check:source` 读取 `git ls-files`，新公开文件需先有意识地加入索引后再查；不要用 `git add .` 将数据和临时文件混入。

本机另有私有 `scripts/check-special-ui.cjs` 和 `scripts/check-special-cold.cjs`：前者使用真实卡的存档副本与本机模拟回复，后者检查便携 EXE 关闭重开与记住密钥。它们依赖本机个人卡、具体输出路径及浏览器自动化库，刻意没有公开。接手同一台电脑时可以读取，不要因公开克隆没有这些文件就凭空重造真实测试结果。公开克隆只能直接运行合成数据的单元检查。

这些私有脚本当前通过本机已有的 Playwright 控制 Edge/Electron；旧路径在 Codex 缓存目录下，但不需要 Codex 账号或订阅发起模型请求。若路径不存在，先确认本机浏览器测试工具，不要默默联网安装依赖。人工核对也可以按 `docs/VERIFICATION.md` 的场景做，结果分开记录。

## 分类存储与两份数据

```text
Meowssiah_独立版/
  v1.1.9/<通用 EXE>
  Meowssiah-Data/<通用数据>

Meowssiah_绯月专属版/
  v1.0.0/<专属 EXE>
  Meowssiah-Data/
    聊天/
    连接/
    角色卡/
    世界书/
    工作台/
    备份/
```

`resolveDataDir()` 在 `vX.Y.Z` 程序目录的父目录已有 `Meowssiah-Data` 时使用父目录共享数据；否则使用程序目录内的数据。专属正式文件夹要先放好对应共享数据，再验证路径，避免启动到另一份空白数据。

专属版首次复制通用数据，此后各自独立更新。重复迁移时不能覆盖已经玩过的专属数据。需要交流进度时用聊天导出/导入，并先保留双方文件。

### 密钥

`连接/设置.json` 保存地址、模型等。`连接/密钥.json` 保存当前 Windows 用户加密的值；`连接/测试连接.json` 仅为本机测试读取提供参数/引用。不要把真实值贴给接手模型。换 Windows 账号或搬到另一台电脑时，原加密文件可能读不出，届时在软件连接页重新填写即可。

## 冷启动检查的坑

旧测试脚本曾写死 `127.0.0.1:7890` 代理，并在冷启动途中额外调用 `page.reload()`。2026-11-14 该代理停止，原图片直连却返回 HTTP 200；额外重载也出现导航等待超时，而原窗口实际已载入存档和密钥。现在测试不覆盖系统代理，不再在冷启动中额外刷新，直接观察启动文档，并独立限时检查图片；两次启动间等进程与调试端口完全退出。两次真实 EXE 冷启动随后通过，业务代码没有因此修改。不要据此修改请求流程或删除账本。

## 发版与回退

用户只要源代码备份。更新源码分支/标签后，核对远端提交；不要创建 Release、上传安装包或开启工作流。

本地新版本按版本目录保存，数据留在对应产品父目录。保留前一可用程序和改前源码/哈希；实际删除旧文件需要对应授权。回退专属版时可退出它、打开通用版 1.1.9，通用数据保持独立；专属之后的新进度不会自动出现在通用版。

源代码可切回 `v1.1.9`，但切分支前先确认没有未提交修改，并保留私有资料。不要重置或清理仓库来掩盖未完成的工作。
