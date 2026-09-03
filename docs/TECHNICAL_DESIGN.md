# SimpleRadio 1.4.2 技术设计

> 本文记录播放器运行实现。GitHub 开源版的资源恢复、依赖安装与打包命令以 [开发指南](DEVELOPMENT.md) 为准；大体积素材通过 Release 恢复，不需要维护者的原盘符。

## 1. 进程边界

Renderer：主页、沉浸舞台、收藏、最近播放、本地筛选和 HTMLAudioElement。
Preload：仅暴露状态、收藏、播放器/设置/统计保存、系统窗口控制及定位已有音频的白名单 API。
Main：固定曲库装载、LibraryStore 持久化、BrowserWindow、Tray/Menu、simple-radio 媒体协议和 simple-wallpaper 壁纸协议。

不启动 HTTP 服务，不开放端口，不加载远程页面。contextIsolation、sandbox、webSecurity 开启，nodeIntegration 关闭。渲染 CSP 禁止联网。

## 2. 维护者构建链路

scripts/prepare-catalog.cjs 读取 electron/catalog.cjs 中的七张歌单配置。scanner.cjs 仅负责构建期扫描音频元数据和封面，parseCuratedFilename 按来源规则整理字段。不扫描或读取配套歌词。scripts/prepare-wallpapers.cjs 以精确文件清单复制 15 个新增壁纸，并生成大小与 SHA256 清单；scripts/capture-wallpaper-posters.cjs 使用隔离的本地 Electron 窗口，为 9 张静态图片执行等比 cover 裁切、为 8 段视频截取画面，统一输出 320×200 JPEG。所有源素材保持不变。

源文件以字节相同的副本写入 bundled-library；manifest.json 包含稳定 ID、相对 mediaPath、源文件名、旧 ID 映射、名称、歌手、归属、时长、大小、SHA256、封面及歌单定义，不再包含歌词字段。

catalog:prepare 是开发脚本，不通过 IPC 暴露。更换曲库时重新运行；使用原版资源则可直接从 Release 导入并验证。维护者若改变歌单条数需同步 COLLECTIONS 与验收测试。

## 3. 自包含资源

Electron Builder extraResources 将 bundled-library 复制为 resources/music-library，音频不放进 ASAR。开发环境读取项目 bundled-library，成品仅读取 process.resourcesPath/music-library，不搜索开发机文件夹。

加载时检查 manifest 版本、237 个唯一歌曲 ID、七张歌单的精确数量、资源路径不能越界、每首音频存在且大小一致。测试时逐首核对 SHA256。任何加载错误在保存迁移前中止，保留原用户状态。

音频由 simple-radio://track/ID 访问，支持 Range / 206 Partial Content；封面只允许已登记曲目。17 个图片/视频壁纸从 ASAR 释放到 userData/built-in-wallpapers，再由 simple-wallpaper 白名单协议读取；4 套渐变由本地 CSS 直接渲染。壁纸 ID 统一由 electron/wallpapers.cjs 定义并参与设置规范化。

## 4. 数据迁移

LibraryStore.applyCatalog 先计算新状态；首次 catalogRevision 变化先复制原 library.json 为带时间戳的 .bak，再写临时 JSON 并 rename 替换。

migrateCatalogState 以规范 ID、旧 ID 或源文件名与源歌单匹配旧记录，不按相同歌名跨歌单合并。匹配后保留收藏、播放次数、已听秒数和最后播放时间；旧重复/非曲库条目移出活动库。陈楚生歌单最终只有一个、六首。

固定歌单顺序替换原歌单列表；当前曲目和队列映射并过滤失效 ID。全局累计时长保留。normalizeSettings 仅返回皮肤 ID、可见度、暗度、模糊，丢弃旧视觉和歌词参数。stripRetiredTrackFields 只用于旧存档兼容，丢弃 lyricsRaw、lyricsSource、lyricsReview，不提供读取、解析或显示能力。

每次启动都重新绑定媒体路径，支持 ZIP 解压目录移动，也兼容早期单文件 portable 的临时释放目录。相同 catalogRevision 不重复备份；升级前备份可供手动恢复。

## 5. UI 与播放

七张卡片共用布局，以 colors、variant、eyebrow、name、description、trackIds 配置外观，详情对话框使用同色背景。陈楚生使用 wind 柔和风痕；陶喆与精选串烧分别使用 soft-glow、horizon-glow，均只由模糊圆形/椭圆光晕构成，不使用唱片环纹或节拍条纹。卡片数根据宽度自适应换行。

HTMLAudioElement 直接输出声音，无 AudioContext、分析器或环境 Canvas。进度拖动、播放模式与听歌统计继续保留。所有终端用户导入按钮、快捷键、拖放读取和 IPC 已删除；drop 事件仅阻止浏览器导航。

外观面板只有 skin 区域。9 张图片与 8 段视频都优先通过 `previewUrl` 白名单 URL 渲染构建期封面；面板不解码原始大图，也不存在 video 元素。动态壁纸本体仍使用双视频元素交叉切换并在窗口隐藏时暂停。选择皮肤时 syncWallpaperOptionSelection 只切换现有按钮 class，不重建 21 个选项，避免缩略图闪烁与重复解码。初始化由 renderAll 唯一触发一次皮肤列表构建，避免启动阶段重复 DOM 创建。

控制台使用不透明渐变玻璃底替代大面积 backdrop-filter，进场动画仅操作 `translate3d`，并以 contain / content-visibility 限制 21 张皮肤卡片的布局与绘制范围；缩略图高光改用普通渐变叠层，不再逐项执行 blur filter。openControls 在添加 open 状态后等待两个 requestAnimationFrame，并将四个一级页面的首帧耗时写入 smoke 报告。沉浸页只保留 heading，移除 stage cover 与 stage 级遮罩；页面容器显式透明。歌单当前行在 loadTrack 后刷新开放中的详情列表。

BrowserWindow 关闭系统窗口阴影，应用壳移除外投影并使用 clip-path 强制裁剪圆角透明区。initialize 始终调用 switchView('home')，不恢复上次关闭时的一级页面；音乐、队列与进度仍正常恢复。最近播放在排序后切片为 10 首，每次 playing 事件更新。

BrowserWindow 的 close 事件在非退出流程中 preventDefault 并 hide；Windows 隐藏后将窗口 opacity 设为 0。Tray 使用主题化 SR ICO，左键/双击或菜单“显示 SimpleRadio”调用异步恢复：保持 opacity 0 执行 restore/show，等待渲染层连续两个 requestAnimationFrame 后再设为 1 并 focus。180ms 超时仅作为渲染异常时的兜底，避免窗口永久不可见。菜单“退出”设置 isQuitting 后调用 app.quit；before-quit 同步设置退出标志，保证系统退出与 smoke 流程可真正关闭。

## 6. 统计与本地数据

状态位于 app.getPath('userData')/library.json。音频实际播放时累计秒数，每 10 秒及暂停/切歌/关闭前提交；单次提交最多 30 秒，播放 token 去重。有效播放阈值为 min(30, max(5, duration×0.2)) 秒。

主进程不接受渲染层覆盖完整曲库或文件路径。Top 10 仅显示 playCount > 0 的歌曲。

## 7. 验证与交付

node --test tests/*.test.cjs：固定数量、全部音频与新增壁纸哈希、元数据清洗、迁移幂等/备份/换路径、旧字段清理、无歌词结构、IPC 移除、安全配置及 Range 测试。

桌面 smoke 使用 SIMPLERADIO_TEST_USER_DATA 独立测试目录，避免改变使用者的收藏、音量和壁纸。SIMPLERADIO_SMOKE_AUDIT 在真实 Electron 环境逐首加载音频并验证 decoded data。截图与 JSON 保存在 qa。

Windows ZIP 便携包完整包含 237 首音频、21 款皮肤、17 张图片/视频轻量封面及主题化 SR PNG/ICO；高清图标源稿以否定 glob 排除，不进入成品。资源压缩后超过 NSIS 32 位 mmap 的 2 GiB 边界，因此 1.4.2 不生成不可用的 NSIS/单文件 portable；ZIP 使用 ZIP64 并保留可直接运行的 win-unpacked 目录。SHA256SUMS 在最终构建后生成，不写入应用自身以免循环改变成品哈希。
