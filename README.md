# Meowssiah 独立工作台 · 源码备份

由 [wcbsxe](https://github.com/wcbsxe) 维护的个人项目代码仓库，用 Git 保存源码、记录版本，避免代码丢失。**本仓库不发布安装包，也不自动构建或对外分发程序。**

基于 SoliUmbra 的 Meowssiah 2.0.9 预设进行独立宿主适配，不是原作者官方独立版。原作者署名、原始声明和第三方许可随源码保留，未对原预设或第三方代码重新授予许可。

当前源码版本：**1.1.7**。

## 找回历史代码

- [版本标签](https://github.com/wcbsxe/Meowssiah-Standalone/tags)：v1.0.0 至 v1.1.7 的源码快照。
- [源码版本索引](versions/index.json)：版本、源码提交与主要改动。
- [提交记录](https://github.com/wcbsxe/Meowssiah-Standalone/commits/main)：后续修改与备份记录。
- [变更记录](CHANGELOG.md)：已有功能变化。

历史归档提交来自本地已交付源码，提交时间为本次归档时间，没有倒填原开发日期。应用文件保留原字节，公开说明和开发辅助文件作了整理。

## 功能

保留原预设请求改写、工具、签名字段和输出处理，日志上传关闭。独立宿主提供世界书总库、角色卡独立选书、MVU 变量、EJS 模板、聊天管理和分页界面。

## 本地开发与自用

使用 Node.js 24：

```powershell
npm ci
npm start
# 需要时在自己本机生成程序
npm run build
```

上游源码和固定版本在 upstream/、integrations/，已生成的运行库在 app/；重新生成可用 npm run build:runtime。日常备份和维护方法见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 不进入仓库的内容

个人聊天、导入角色卡、世界书、连接配置、模型密钥、测试副本、依赖缓存和安装包都留在本地，不纳入 Git。Meowssiah-Data 是个人存档目录，更新代码或生成程序时应保留。

## 原作者与许可

见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、app/licenses 和上游目录。各部分按原声明分别使用，本仓库不作统一 MIT 授权声明。
