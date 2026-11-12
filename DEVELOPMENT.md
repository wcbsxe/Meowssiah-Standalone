# 开发与发布

本仓库保存可维护源码，历史程序在 Releases，源码快照在同名标签。Git 归档提交由本地交付源码重建，没有倒填开发时间。

## 本地

使用 Node.js 24：npm ci，npm start。可用 npm run build 生成 Windows x64 便携程序。测试按本次改动选择，默认不会在发布工作流中运行全量测试，也不会调用模型服务。

## 发布新版本

完成修改后执行 npm run release:version -- 1.1.8（版本按实际修改），这会同步程序版本和应用文件校验清单。然后运行 npm run check:publish，查看 git diff 并提交。最后创建 v1.1.8 标签并推送 main 和该标签。GitHub Actions 会构建 EXE，生成启动脚本、说明、第三方声明和 SHA256 清单，并发到同名 Release。

Actions 中也能手动运行 Release Windows；手动运行只检查与构建，不发布或覆盖历史程序。推送新的版本标签才发布，历史标签保留不移动。仓库不把个人存档、模型密钥、构建目录、依赖缓存或 EXE 放进 Git。

## 原作者与许可

本仓库由 wcbsxe 维护独立宿主适配；SoliUmbra 原预设和第三方代码分别保留原署名与许可。不把各部分统一改为 MIT。上游源码和固定提交随仓库保留，具体见 THIRD_PARTY_NOTICES.md。
