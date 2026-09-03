# 第三方软件说明

SimpleRadio 使用 Electron、electron-builder、music-metadata 及其依赖。其名称用于说明技术组成，不代表官方背书。

- Electron 发行包包含 Chromium、Node.js 等组件，它们受各自许可证约束。
- 请保留成品目录中的 `LICENSE.electron.txt`、`LICENSES.chromium.html` 等通知文件，不要在重新打包时删除。
- npm 依赖的精确版本见 `package-lock.json`，各依赖的许可见其包内 LICENSE/NOTICE 和官方仓库。
- 项目的 MIT LICENSE 不能替代依赖的许可证，也不能授权歌曲、壁纸等第三方媒体。
- 本仓库锁定了 1.4.2 的构建依赖以利复现；版本锁定不代表这些依赖永远没有安全问题。维护者应持续评估升级。
