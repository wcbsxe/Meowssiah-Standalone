# 个人源码维护与备份

本仓库只用 Git 留存代码，保留提交历史和版本标签，不发布安装包，不设置自动打包/发布工作流。

## 日常修改

修改所需源码后，只运行与本次改动有关的检查。使用 npm run check:source 检查已跟踪的文件、应用文件清单、语法与常见密钥形状；这不是全量功能测试，也不会调用模型。

需要更新版本号时，执行 npm run version:set -- X.Y.Z，同步版本和应用校验清单。完成后查看 git diff，提交源码，再 git push。版本标签仅标记可找回的源码快照，不触发程序发布。

## 找回代码

GitHub 的 Tags 和 versions/index.json 保存 v1.0.0 至 v1.1.7 的归档源码。可以查看指定标签、比较版本差异，或在单独目录检出旧源码。历史提交是本次整理时重建的归档，没有倒填开发时间。

## 本机运行

npm ci 安装依赖，npm start 启动开发版。需要自用程序时再执行 npm run build；构建目录和 EXE 不加入 Git、不上传。npm run build:runtime 用于有需要时重新生成固定上游运行库。

## 个人数据

Meowssiah-Data、evidence、backups、node_modules、dist 和密钥不加入 Git。代码备份不等于个人存档备份；个人聊天与配置继续在本机保留。

原作者和第三方代码分别保留原署名与许可，见 THIRD_PARTY_NOTICES.md。
