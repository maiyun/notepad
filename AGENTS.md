# ClickGo Notepad

完整的 ClickGo 网页/Native 示例，Native 入口为 `dist/index.ts`，使用全局 ClickGo Compiler。`npm run check` 检查 TypeScript；`npm run build` 编译 TypeScript 并生成 `dist/app.cga`；`clickgo --run ./dist/index` 本地运行；`clickgo --native` 打包到 `build/`。

## 更新检测

- `dist/update.ts` 只在 Native 主进程使用 `electron-updater`，关闭自动下载和退出时安装，合并并发检测/下载；下载中和下载后不再检测以避免改变安装目标。只允许安装本会话成功下载和校验的包。
- 应用版本和打包状态通过 ClickGo Native 的 `getAppVersion()` / `isPackaged()` 获取，业务项目不直接安装或导入 Electron；运行时由全局 Compiler 提供。
- `dist/index.ts` 注册 `notepad-check-updates`、`notepad-download-update`、`notepad-install-update`、`notepad-update-state`；网页不能传入更新地址或安装文件。
- `dist/app/form/main.ts` 挂载后发起非阻塞检测，自动检测只提示新版本；View 菜单可手动检测。用户确认下载后可暂缓安装，再次检测进入已下载包的安装确认。安装前要求保存未保存的文档，取消、保存失败或写入期间新增编辑均阻止安装。安装启动后锁定编辑，轮询安装错误以恢复重试入口。
- 更新源由根 `package.json` 的 `build.publish` 配置，默认是当前 GitHub 仓库的 Releases。整包版本以根 `package.json.version` 为准，CGA 版本独立。
- 开发运行、网页和 Windows portable 不更新。发布方需上传安装包、匹配元数据和辅助文件，macOS 还需签名及 ZIP；`yml/` 只用于示例，不能直接作为发布元数据上传。新建文档的未保存内容提醒尚未实现。

## Native 窗口

- File → Exit 和 Form 的 `@close` 共用 `exit()`，未保存时使用 ClickGo confirm（保存 / 放弃 / 取消）；取消保存、保存失败或正在写入时不关闭。确认期间锁定编辑并防止重复确认。全新空文档可直接关闭，已打开文件清空后仍须确认。
- 系统关闭（如 Alt+F4）依赖 ClickGo Native 的 `close-request` 桥接以及新版 ClickGo Form，发布时须同步更新 npm 依赖和 `dist/index.html` 的 CDN 运行库。
- 首个 Form 的 `min-width="360"`、`min-height="240"` 由 ClickGo 同步至 Native 实体窗口；不是只限制网页内部样式。
- `dist/index.ts` 的 Native `icon` 使用 `doc/logo.png`，该文件必须包含在 `build.files`；Linux 包也使用单张 `doc/logo.png`，由支持图标自动生成的新版全局 ClickGo Compiler 在打包时生成多尺寸桌面图标并清理临时文件，不维护项目内的图标集。`desktopName` 与 `linux.syncDesktopName` 保持一致。

## 文件打开

- `dist/index.ts` 通过 `openFiles` 和 `singleInstance` 统一接收文件关联、后续实例与窗口拖入的文件。Notepad 是单文档应用，每次请求只处理首个真实文件，不限扩展名，内容按 UTF-8 文本读取。
- 菜单和 Native 文件请求共用 `_openFile()`；替换未保存文档前必须完成保存、放弃或取消流程。
