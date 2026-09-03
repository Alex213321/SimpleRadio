# 开发与维护指南

## 一、两类用户，不同入口

- 听歌用户：下载 Release 的 Program/Music 两包，合并解压即可，不安装开发环境。
- 开发者：克隆源码、`npm ci`、导入上述成品资源，然后运行或构建。源码是完整程序工程，但大媒体不存储在 Git 历史中。

## 二、最短开发路径

```powershell
git clone https://github.com/Alex213321/SimpleRadio.git
cd SimpleRadio
npm ci
npm run test:unit
npm run resources:import -- "D:\Apps\SimpleRadio-1.4.2"
npm run resources:verify
npm start
```

Electron 的依赖安装脚本被较新 npm 阻止时，可在核对依赖包后单独执行 `node node_modules/electron/install.js`。这只是开发环境下载；普通成品用户无需执行。

`resources:import` 使用 Electron 自带的 ASAR 文件读取能力，不需要下载外部解包软件。所有源文件先验证大小与 SHA256，再决定复制；本地相同文件跳过，不同文件默认拒绝覆盖。`--force` 仅用于已经备份后明确恢复原版媒体。

导入对象只有音乐清单、音频与壁纸资源，不会扫描其他磁盘，不会复制 AppData，也不会修改原成品目录。

## 三、源码的运行链路

```text
main.cjs 启动窗口并加载固定曲库
  → preload.cjs 暴露有限 IPC 方法
  → src/index.html + styles.css + app.js 显示 UI
  → HTMLAudioElement 通过本地媒体协议播放
  → store.cjs 把收藏/播放统计/设置保存到用户目录
```

详情见 [技术设计](TECHNICAL_DESIGN.md)。`package.json` 的 `private: true` 只是阻止误发 npm 包，不影响 GitHub 开源、Fork 或二次开发。

## 四、调整歌单与音频

1. 修改 `electron/catalog.cjs` 中 `COLLECTIONS`：稳定 ID、曲目数、文件夹、标题、简介、颜色及元数据格式。
2. 若只有 UI 配色/简介变化，也应重新生成曲库清单，因为主页读取清单中的歌单展示字段。
3. 原始音频维护脚本默认读取**源码目录的上一级**中的歌单文件夹，不要求固定盘符；现有目录名是周杰伦歌单、陈楚生歌单、经典华语歌曲、经典英语歌曲、毛不易歌单、陶喆歌单、歌曲串烧。
4. 文件名规则写在 `parseCuratedFilename`，自定义曲库请同时调整解析规则，避免作者与歌名颠倒。
5. 执行 `npm run catalog:prepare`。脚本复制资源、计算哈希、写入稳定 ID 和 `manifest.json`，不重命名或修改原音频。
6. 调整 `tests/catalog.test.cjs` 中的固定曲目数和场景，以及受影响的资源测试。
7. 审核资源后执行 `npm run resources:manifest`，明确更新仓库固定版本的哈希清单。不要为了掩盖损坏资源而盲目重建清单。
8. 运行 `npm run resources:verify`、`npm test` 并实际试听，再修改版本号与发布说明。

如果更换整套曲库，可简化/重写准备脚本，但请保留 ID 稳定性、清单路径检查、资源存在性验证与迁移备份。直接向 `bundled-library` 追加 MP3 不会自动生成歌单。

## 五、调整皮肤

- `electron/wallpapers.cjs` 定义 ID、中文名字、静态/图片/视频类型、资源文件名、缩略图文件名、描述和渐变颜色。
- 实际图片/视频放在 `assets/wallpapers`；4 套纯 CSS 渐变不需要媒体文件。
- `npm run wallpaper:posters` 为定义中的媒体生成 320×200 的轻量封面，主背景仍使用完整素材。
- `npm run wallpaper:prepare` 是维护者原始素材整理入口，读取源码上级的“壁纸”文件夹，并要求当前映射的15个文件。它不准备原有的绛瞳予心、冰澜映瞳两段素材；二次开发通常先从原成品导入它们。
- 修改后同步 `supplied-manifest.json` 的原素材校验逻辑、资源清单与测试，不要让缩略图列表退回多个同时运行的视频。

`npm run assets:prepare` 会执行原始曲库整理、15个壁纸整理和封面生成；仅在相应原始素材完整时使用。普通二次开发以 `resources:import` 为起点更方便。

## 六、测试分层

- `npm run test:unit`：26 项逻辑、结构和资源工具测试，不需要音频/高清壁纸。GitHub Actions 只运行这一组，不在每次提交下载约2GB素材。
- `npm test`：另外执行完整音频哈希、歌单数量、迁移及壁纸测试。原始周杰伦目录不存在时，两个针对原始文件命名的测试会自动跳过；成品资源测试不会因此跳过。
- 桌面 smoke：`electron/main.cjs` 中保留了维护者 QA 环境变量。必须同时设置独立的 `SIMPLERADIO_TEST_USER_DATA` 与报告/截图路径，避免覆盖真实用户数据；不要提交测试用户目录或私人报告。
- 旧的 `docs/ACCEPTANCE.md` 记录 1.4.2 原成品测试；开源发布工具链另见 `docs/RELEASE.md`。

## 七、构建与拆包

```powershell
npm run resources:verify
npm test
npm run dist:win
```

完整 ZIP 和 `win-unpacked` 输出到 `release`。资源采用 extraResources/ASAR 随成品内置，不引用维护者的原始盘符。

将完整 ZIP 拆成可分别解压的程序包和音乐包：

```powershell
.\scripts\split-release.ps1 -Archive ".\release\SimpleRadio-Portable-1.4.2-x64.zip" -OutputDirectory ".\release\github-v1.4.2" -Version "1.4.2"
```

使用 PowerShell；如果组织策略限制执行脚本，请遵循组织规定，不要关闭系统安全保护。脚本不会覆盖已有输出，需要使用一个新的输出目录；更改曲库总数后传入 `-ExpectedTrackCount`。

拆包脚本从完整 ZIP 读取每个文件，按 `resources/music-library` 分配，再验证两个新包与原包的每个文件大小和 SHA256。每个新包均必须小于2GiB。它生成 `SHA256SUMS.txt` 和 `release-validation.json`。

上传两个 ZIP、使用说明和 SHA256 到同一个版本 Release。不要上传开发机的 AppData、旧版成品、测试截图或 `node_modules`。发布前使用全新目录合并解压并实际运行验证。

## 八、打包与许可

1.4.2 使用 Electron 37.10.3 与 electron-builder 26.15.3，完整依赖版本在 lockfile。首次构建可能需要联网获取打包工具。源码支持修改和重新构建，但不保证跨机器产生字节完全相同的 EXE/ZIP。

代码为 MIT；第三方媒体、依赖和运行库各有独立权利边界。二次开发不意味着原音乐/图片自动获得任意用途许可。请阅读根目录的 `ASSET_LICENSES.md` 与 `THIRD_PARTY_NOTICES.md`。
