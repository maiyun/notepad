# ClickGo Notepad

完整的 ClickGo 网页/Native 示例，Native 入口为 `dist/index.ts`，使用全局 ClickGo Compiler。`npm run check` 检查 TypeScript；`npm run build` 编译 TypeScript 并生成 `dist/app.cga`；`clickgo --run ./dist/index` 本地运行；`clickgo --native` 打包到 `build/`。

## 三箱与验证

- App 文本统计契约在 `dist/app/lib/text.ts`，实现放 `dist/app/abox/text.ts`；按 Unicode 码点计数，选区/光标输入为 UTF-16 偏移。Form 保留业务判断和状态流转。
- 自动回归及 Electron 验收入口在 `dist/abox/test/`，从桌面安装包排除；主进程与 App 分属各自打包边界，App 黑箱随 CGA 编译，不能引用主进程黑箱。
- macOS 在 Mac/对应 CI 使用 `clickgo --native --platform mac --mirror cn`，目标与架构见 package.json 的 build.mac；图标由现有 PNG 转换。发布更新须签名并附 ZIP 与生成的 latest-mac.yml，证书和凭据由构建环境提供。

## 更新检测

- 主进程通过 `launcher({ updates: true })` 启用 ClickGo Native 更新器，不导入 Electron 或 electron-updater，不注册更新 IPC。
- `dist/app/form/main.ts` 使用 ClickGo native.checkUpdates/downloadUpdate/installUpdate 及 onUpdateState。挂载后自动检测仅提示新版本，菜单支持手动检测；业务负责下载、安装确认及保存检查。下载进度与安装异步失败经框架状态通知，失败恢复编辑，成功启动安装后保持编辑锁定。
- 更新源由根 `package.json` 的 `build.publish` 配置，默认是当前 GitHub 仓库的 Releases。整包版本以根 `package.json.version` 为准，CGA 版本独立。
- 开发运行、网页和 Windows portable 不更新。发布方需上传安装包、匹配元数据和辅助文件，macOS 还需签名及 ZIP；`yml/` 只用于示例，不能直接作为发布元数据上传。

## Native 窗口

- App 的固定标识在 dist/app/config.json 的 id，与 build.appId 一致；Native 持久存储按此标识区分，移动目录、改名及升级均保持不变。
- File → Exit 和 Form 的 `@close` 共用 `exit()`，未保存时使用 ClickGo confirm（保存 / 放弃 / 取消）；取消保存、保存失败或正在写入时不关闭。确认期间锁定编辑并防止重复确认。全新空文档可直接关闭，已打开文件清空后仍须确认。
- 新空白文档为未修改，状态显示 Ready；只有正文实际变化才递增 revision 并标记未保存。打开/新建同步输入基线，更新检测及内容未变的输入通知不改文档状态；未命名的空文档仍可首次保存。
- 系统关闭（如 Alt+F4）依赖 ClickGo Native 的 `close-request` 桥接以及新版 ClickGo Form，发布时须同步更新 npm 依赖和 `dist/index.html` 的 CDN 运行库。
- 首个 Form 的 `min-width="360"`、`min-height="240"` 由 ClickGo 同步至 Native 实体窗口；不是只限制网页内部样式。
- `dist/index.ts` 的 Native `icon` 使用 `doc/logo.png`，该文件必须包含在 `build.files`；Linux 包也使用单张 `doc/logo.png`，由支持图标自动生成的新版全局 ClickGo Compiler 在打包时生成多尺寸桌面图标并清理临时文件，不维护项目内的图标集。`desktopName` 与 `linux.syncDesktopName` 保持一致。

## 文件打开

- `dist/index.ts` 只启用 openFiles/singleInstance，不转发业务事件；主 Form 的 onNativeOpenFiles 接收框架全局事件，在 access 暂存忙碌期间的文件请求。Notepad 每次请求只处理首个真实文件，不限扩展名，内容按 UTF-8 读取；来源由框架 info.source 区分。
- 菜单和 Native 文件请求共用 `_openFile()`；替换未保存文档前必须完成保存、放弃或取消流程。

## AI 命令接入

- `dist/app/lib/command.ts` 在主 Form 挂载时注册公开命令，框架随 Form 销毁自动解除；菜单、快捷键和代理共用命令及文件操作。命令名稳定，不嵌入 taskId 或 formId，Notepad 保持单文档。
- `document.read` 分页返回 UTF-16 偏移与修订号；编辑、新建、打开和保存要求 expectedRevision。用户输入、代理编辑、文档切换及保存到新路径更新 revision；旧快照不执行修改。编辑只更改内存，保存失败不提交新文件身份，写入期间新增编辑仍未保存。
- `dist/index.ts` 创建窗口后启动 MCP，使用稳定软件 ID `clickgo-notepad` 和框架默认的本机监听、随机凭据与实例发现；launcher 的 commandAutoStart 允许 CLI/stdio 按需启动 GUI。业务不复制传输适配器或维护端口。
- View → AI Access 打开 `dist/app/form/ai/`，使用 getAgentGuide 生成网页、stdio 和 CLI 说明；仅用户点击 HTTP 设置时调用已有 root 权限保护的 getMcpInfo。公开命令与默认说明不包含凭据。
- `npm run build` 后运行 `npm test` 验证文档与取消边界，`npm run test:mcp` 使用实际 Electron、打包 App 和安装的框架验证 HTTP、CLI、stdio 及 UI 联动；测试只操作临时文件和独立用户数据目录，不用于替代各平台打包验收。
