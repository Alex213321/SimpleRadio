# 贡献与二次开发

1. Fork 仓库，克隆到本地，为修改创建独立分支。
2. `npm ci` 安装开发依赖；`npm run test:unit` 可在未导入大型媒体时运行。
3. 如需实际运行，按 README 下载同版本 Program/Music 包，合并解压后执行 `npm run resources:import -- "成品目录"`。
4. 修改源码后运行相关测试；涉及播放器、曲库、存储和皮肤时，请运行 `npm test` 并用桌面版复现。
5. 提交 Pull Request，说明动机、改动范围、测试结果；视觉修改附截图。

不要提交 `node_modules`、`bundled-library`、高清壁纸、Release 成品、AppData、个人听歌记录、凭据或没有分发权的素材。二进制资源不进入 Git 历史，必要的资源更新通过维护者审核后的 Release 分发。

代码风格延续原生 JavaScript/CommonJS 与已有文件。不要因为局部界面修改引入整套前端框架；尽量保持离线、无账号、固定歌单的产品边界。重大变化请先开 Issue 讨论。

本项目未建立私密安全报告渠道。请勿在公开 Issue 贴出可访问他人数据的凭据、个人信息或完整私人存档。
