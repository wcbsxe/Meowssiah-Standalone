# Meowssiah 独立工作台

由 [wcbsxe](https://github.com/wcbsxe) 维护的 Windows 独立桌面适配。基于 SoliUmbra 的 Meowssiah 2.0.9 预设，不是原作者官方独立版。原作者署名、原始声明和第三方许可随源码保留，未对原预设或第三方代码重新授予许可。

当前源码版本：**1.1.4**。本版：MVU 更新请求与本地执行修复。

## 下载与使用

在 [Releases](https://github.com/wcbsxe/Meowssiah-Standalone/releases) 选择版本，下载 Windows x64 EXE。双击 EXE 即可；Start.cmd 是可选启动脚本。

升级前退出旧程序，保留自己的 Meowssiah-Data 文件夹，再使用新版程序。源码下载不含你的聊天或连接设置。

## 功能

- 保留原预设请求改写、工具、签名字段和输出处理，日志上传关闭。
- 1.1 系列提供共享世界书库、角色卡独立选书、MVU 变量和 EJS 提示词模板。
- 1.1.1 起本机数据按聊天、连接、角色卡、世界书等目录分别保存。模型密钥只在程序内存中保留，退出清除。
- 1.1.5 起页面默认渲染最近 20 层，可翻页查看全部存档；页面显示与原有模型历史滚动分开。
- 1.1.7 修复角色卡页面使用表单的保存按钮。

## 本地开发

需要 Node.js 24 和 npm。

```powershell
npm ci
npm start
# Windows 便携程序
npm run build
```

上游运行库源码和固定版本在 upstream/、integrations/；已生成的本地运行库在 app/。重新生成运行库时可执行 npm run build:runtime。

## 数据与许可

公开仓库与历史安装包不包含个人聊天、导入角色卡、世界书、连接设置或模型密钥。第三方和原预设声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，依赖原文许可见 app/licenses 和上游目录。各部分按原声明分别使用，本仓库不作统一 MIT 授权声明。

历史版本的 Git 提交是从本地已交付源码重建的归档提交，提交时间为本次归档时间，不冒充原开发时间。应用文件保留原字节，公开说明和开发辅助文件作了整理。
