import * as clickgo from 'clickgo';
import aiFrm from './ai/ai';
import * as lCommand from '../lib/command';

/** --- 文本文件优先显示常用格式，同时允许用户处理其他纯文本文件 --- */
const fileFilters = [
    {
        'name': 'Text Files',
        'accept': ['txt', 'json'],
    },
    {
        'name': 'All Files',
        'accept': ['*'],
    },
];

export default class extends clickgo.form.AbstractForm {

    public title = 'New file - ClickGo Notepad';

    /** --- 未处理的文件请求，不参与界面响应式状态 --- */
    public access = { 'openFiles': [] as string[] };

    /** --- 当前是否存在未保存的编辑，空白新文档初始为未修改 --- */
    public nosave = false;

    /** --- 文件地址 --- */
    public file: string = '';

    /** --- 文本内容 --- */
    public text: string = '';

    /** --- 上次处理的正文，用于区分实际编辑与内容未变的输入通知 --- */
    private _observedText = '';

    /** --- 当前选区，使用 Text 控件提供的原生双向绑定 --- */
    public selectionStart = 0;

    public selectionEnd = 0;

    /** --- 是否自动换行 --- */
    public wordWrap = true;

    /** --- 避免重复显示更新检测对话框 --- */
    public checkingUpdate = false;

    /** --- 下载或安装时显示的状态 --- */
    public updateStatus = '';

    /** --- 安装启动后禁止继续修改文档 --- */
    public installingUpdate = false;

    /** --- 避免保存操作并发覆盖文档状态 --- */
    private _saving = false;

    /** --- 避免并发读取 Native 交给应用的文件 --- */
    public openingFiles = false;

    /** --- 文档内容或身份变化时递增，阻止代理覆盖旧快照 --- */
    public revision = 0;

    /** --- 避免重复关闭确认，确认期间锁住文档内容 --- */
    public closing = false;

    /** --- 不同命令操作同一文档时共用的可用条件 --- */
    public get commandDisabledReason(): string | true {
        if (this.installingUpdate || this.closing) {
            return 'The document is closing or an update is being installed.';
        }
        if (this._saving || this.openingFiles || this.loading) {
            return 'A document operation is in progress.';
        }
        return true;
    }

    /** --- 文档字符数，Unicode 扩展字符按一个字符计算 --- */
    public get characterCount(): number {
        return Array.from(this.text).length;
    }

    /** --- 文档总行数，空文档也有第一行 --- */
    public get lineCount(): number {
        return this.text.split(/\r\n|\r|\n/).length;
    }

    /** --- 当前选中的字符数 --- */
    public get selectionCount(): number {
        const start = Math.max(0, Math.min(this.selectionStart, this.selectionEnd, this.text.length));
        const end = Math.max(0, Math.min(Math.max(this.selectionStart, this.selectionEnd), this.text.length));
        return Array.from(this.text.slice(start, end)).length;
    }

    /** --- 光标所在行 --- */
    public get cursorLine(): number {
        return this._cursorParts.length;
    }

    /** --- 光标所在列，Unicode 扩展字符按一列计算 --- */
    public get cursorColumn(): number {
        return Array.from(this._cursorParts[this._cursorParts.length - 1] ?? '').length + 1;
    }

    /** --- 当前文档的换行符类型 --- */
    public get lineEnding(): 'CRLF' | 'CR' | 'LF' {
        if (this.text.includes('\r\n')) {
            return 'CRLF';
        }
        if (this.text.includes('\r')) {
            return 'CR';
        }
        return 'LF';
    }

    /** --- 状态栏左侧文本 --- */
    public get documentStatus(): string {
        if (this.updateStatus) {
            return this.updateStatus;
        }
        if (this._saving) {
            return 'Saving…';
        }
        if (this.nosave) {
            return 'Unsaved';
        }
        return this.file ? 'Saved' : 'Ready';
    }

    /** --- 状态栏左侧语义颜色 --- */
    public get documentStatusType(): 'primary' | 'warning' | 'cg' {
        if (this.updateStatus) {
            return 'cg';
        }
        return this.nosave ? 'warning' : 'primary';
    }

    /** --- 光标前的各行内容 --- */
    private get _cursorParts(): string[] {
        const offset = Math.max(0, Math.min(this.selectionEnd, this.text.length));
        return this.text.slice(0, offset).split(/\r\n|\r|\n/);
    }

    /**
     * --- 启动后自动检测，只有发现新版本时才提示 ---
     * @returns 无
     */
    public onMounted(): void {
        lCommand.register(this);
        if (!clickgo.isNative()) {
            return;
        }
        clickgo.native.onUpdateState(this, (state): void => {
            if (state.status === 'downloading' && this.checkingUpdate) {
                this.updateStatus = state.progress ? `Downloading update… ${Math.floor(state.progress.percent)}%` : 'Downloading update…';
            }
            if (state.errorCode === 'install-failed') {
                void this._updateInstallFailed();
            }
        });
        this._continueOpenFiles();
        this.checkUpdates(true).catch((): void => {
            return;
        });
    }

    /**
     * --- 系统文件请求共用业务打开流程；单文档应用每次只接收首个文件 ---
     * @param paths 框架已规范化的文件路径，不含 /storage/
     * @returns 无，忙碌时暂存；未保存确认仍由本窗体完成
     */
    public onNativeOpenFiles(paths: string[]): void {
        const file = paths[0];
        if (!file || this.access['openFiles'].includes(file)) {
            return;
        }
        this.access['openFiles'].push(file);
        this._continueOpenFiles();
    }

    /**
     * --- 检测桌面程序更新 ---
     * @param automatic 是否为启动时自动检测
     * @returns 无
     */
    public async checkUpdates(automatic: boolean = false): Promise<void> {
        if (this.checkingUpdate || this.closing) {
            return;
        }
        this.checkingUpdate = true;
        if (!automatic) {
            this.updateStatus = 'Checking for updates…';
        }
        try {
            if (!clickgo.isNative()) {
                if (!automatic) {
                    await clickgo.form.dialog(this, 'Update checks are available in the desktop app.');
                }
                return;
            }
            const result = await clickgo.native.checkUpdates(this);
            if (!clickgo.form.get(this.formId) || this.closing) {
                return;
            }
            if (!result) {
                if (!automatic) {
                    await clickgo.form.dialog(this, 'Unable to check for updates. Please try again later.');
                }
                return;
            }
            if (automatic && (result.status !== 'available') && (result.status !== 'downloaded')) {
                return;
            }
            let message: string;
            switch (result.status) {
                case 'available': {
                    const action = await clickgo.form.dialog(this, {
                        'title': 'Update Available',
                        'content': clickgo.tool.escapeHTML(`Version ${result.version ?? result.currentVersion} is available. Current version: ${result.currentVersion}. Download it now?`),
                        'buttons': ['Later', 'Download'],
                    });
                    if ((action !== 'Download') || !clickgo.form.get(this.formId)) {
                        return;
                    }
                    this.updateStatus = 'Downloading update…';
                    const download = await clickgo.native.downloadUpdate(this);
                    this.updateStatus = '';
                    if (!clickgo.form.get(this.formId)) {
                        return;
                    }
                    if (!download || download.status !== 'downloaded') {
                        await clickgo.form.dialog(this, 'Unable to download the update. Please check your connection and try again later.');
                        return;
                    }
                    await this._installDownloadedUpdate();
                    return;
                }
                case 'downloaded': {
                    await this._installDownloadedUpdate();
                    return;
                }
                case 'up-to-date': {
                    message = `You are using the latest version (${result.currentVersion}).`;
                    break;
                }
                case 'disabled': {
                    message = 'Update checks are available in the installed desktop app. They are disabled in development and portable builds.';
                    break;
                }
                default: {
                    message = 'Unable to check for updates. Please check your connection and try again later.';
                }
            }
            await clickgo.form.dialog(this, { 'title': 'Check for Updates', 'content': clickgo.tool.escapeHTML(message) });
        }
        catch {
            if (!automatic) {
                await clickgo.form.dialog(this, 'Unable to check for updates. Please try again later.');
            }
        }
        finally {
            this.updateStatus = this.installingUpdate ? 'Restarting to install update…' : '';
            this.checkingUpdate = this.installingUpdate;
        }
    }

    /**
     * --- 用户确认并保存文档后安装已下载的更新 ---
     * @returns 无，取消和保存失败时保留已下载的包
     */
    private async _installDownloadedUpdate(): Promise<void> {
        const action = await clickgo.form.dialog(this, {
            'title': 'Update Ready',
            'content': 'The update has been downloaded. Restart and install it now?',
            'buttons': ['Later', 'Restart and Install'],
        });
        if ((action !== 'Restart and Install') || !clickgo.form.get(this.formId) || this.closing) {
            return;
        }
        if (this.nosave && (this.text || this.file)) {
            const save = await clickgo.form.dialog(this, {
                'title': 'Unsaved Changes',
                'content': 'Save your document before installing the update.',
                'buttons': ['Cancel', 'Save'],
            });
            if ((save !== 'Save') || !await this.save()) {
                return;
            }
        }
        if (!clickgo.form.get(this.formId) || (this.nosave && (this.text || this.file)) || this._saving || this.closing) {
            return;
        }
        this.installingUpdate = true;
        this.updateStatus = 'Restarting to install update…';
        try {
            const result = await clickgo.native.installUpdate(this);
            if (!result || result.status !== 'restarting') {
                await this._updateInstallFailed();
            }
        }
        catch {
            await this._updateInstallFailed();
        }
    }

    /**
     * --- 安装启动失败时恢复编辑；事件与调用返回共用，避免重复提示 ---
     * @returns 无
     */
    private async _updateInstallFailed(): Promise<void> {
        if (!this.installingUpdate) {
            return;
        }
        this.installingUpdate = false;
        this.checkingUpdate = false;
        this.updateStatus = '';
        if (clickgo.form.get(this.formId)) {
            await clickgo.form.dialog(this, 'Unable to start the update installer. Your document is safe; please try again later.');
        }
    }

    public async onMin(): Promise<void> {
        await clickgo.native.min(this);
    }

    /**
     * --- 正文实际变化时才递增修订号并标记未保存 ---
     * @returns 更新编辑状态，内容未变时无操作
     */
    public onInput(): void {
        if (this.text === this._observedText) {
            return;
        }
        this._observedText = this.text;
        ++this.revision;
        this.nosave = true;
    }

    /**
     * --- 代理编辑更新与输入控件一致的未保存状态 ---
     * @param start UTF-16 起始偏移
     * @param end UTF-16 结束偏移，不包含该位置
     * @param text 替换文本
     * @returns 更新内容与选区
     */
    public editDocument(start: number, end: number, text: string): void {
        const next = this.text.slice(0, start) + text + this.text.slice(end);
        if (next !== this.text) {
            this.text = next;
            this.onInput();
        }
        this.selectionStart = start + text.length;
        this.selectionEnd = this.selectionStart;
    }

    /**
     * --- 菜单和快捷键进入共享的新建命令 ---
     * @returns 命令结果
     */
    public toNew(): Promise<clickgo.command.TResult> {
        return clickgo.command.execute(this, 'document.new', { 'expectedRevision': this.revision });
    }

    /**
     * --- 确认未保存内容后新建文档 ---
     * @param signal 代理取消信号
     * @returns 是否完成新建
     */
    public async newDocument(signal?: AbortSignal): Promise<boolean> {
        if (this.commandDisabledReason !== true || signal?.aborted) {
            return false;
        }
        this.openingFiles = true;
        try {
            if (!await this._confirmOpenFile('creating a new document', signal) || signal?.aborted) {
                return false;
            }
            this.nosave = false;
            this.file = '';
            this.text = '';
            this._observedText = '';
            this.selectionStart = 0;
            this.selectionEnd = 0;
            this.title = 'New file - ClickGo Notepad';
            ++this.revision;
            return true;
        }
        finally {
            this.openingFiles = false;
            this._continueOpenFiles();
        }
    }

    /**
     * --- 菜单和快捷键进入共享的打开命令 ---
     * @returns 命令结果
     */
    public open(): Promise<clickgo.command.TResult> {
        return clickgo.command.execute(this, 'document.open', { 'expectedRevision': this.revision });
    }

    /**
     * --- 打开给定路径；省略路径时让用户选择 ---
     * @param path 不含 /storage/ 的绝对路径
     * @param signal 代理取消信号
     * @returns 是否完成打开
     */
    public async openDocument(path?: string, signal?: AbortSignal): Promise<boolean> {
        if (this.commandDisabledReason !== true || signal?.aborted) {
            return false;
        }
        this.openingFiles = true;
        try {
            if (!path) {
                const paths = await clickgo.native.open({ 'filters': fileFilters });
                path = paths?.[0];
            }
            if (!path || signal?.aborted) {
                return false;
            }
            return await this._openFile(path, signal);
        }
        finally {
            this.openingFiles = false;
            this._continueOpenFiles();
        }
    }

    /**
     * --- 读取 Native 在启动、文件关联或拖入时交给应用的文件 ---
     * @returns 无
     */
    private async _openPendingFiles(): Promise<void> {
        if (this.commandDisabledReason !== true) {
            return;
        }
        const file = this.access['openFiles'].shift();
        if (!file) {
            return;
        }
        this.openingFiles = true;
        try {
            await this._openFile(file);
        }
        finally {
            this.openingFiles = false;
            this._continueOpenFiles();
        }
    }

    /**
     * --- 菜单和快捷键进入共享的保存命令 ---
     * @returns 命令结果
     */
    public saveCommand(): Promise<clickgo.command.TResult> {
        return clickgo.command.execute(this, 'document.save', { 'expectedRevision': this.revision });
    }

    /**
     * --- 菜单进入共享的另存为命令 ---
     * @returns 命令结果
     */
    public saveAs(): Promise<clickgo.command.TResult> {
        return clickgo.command.execute(this, 'document.saveAs', { 'expectedRevision': this.revision });
    }

    /**
     * --- 保存当前文档，未命名时让用户选择路径 ---
     * @param signal 代理取消信号
     * @returns 是否保存了当前内容，取消或失败为 false
     */
    public async save(signal?: AbortSignal): Promise<boolean> {
        if (this._saving || this.installingUpdate || signal?.aborted) {
            return false;
        }
        if (!this.nosave && this.file) {
            return true;
        }
        this._saving = true;
        const revision = this.revision;
        try {
            const path = this.file || await clickgo.native.save({ 'filters': fileFilters });
            if (!path || signal?.aborted || revision !== this.revision) {
                return false;
            }
            return await this._writeDocument(path, signal);
        }
        finally {
            this._saving = false;
            this._continueOpenFiles();
        }
    }

    /**
     * --- 另存为给定路径，省略路径时让用户选择 ---
     * @param path 不含 /storage/ 的绝对路径
     * @param signal 代理取消信号
     * @returns 是否完成保存，取消或失败为 false
     */
    public async saveDocumentAs(path?: string, signal?: AbortSignal): Promise<boolean> {
        if (this.commandDisabledReason !== true || signal?.aborted) {
            return false;
        }
        this._saving = true;
        const revision = this.revision;
        try {
            path ??= await clickgo.native.save({ 'filters': fileFilters }) || undefined;
            if (!path || signal?.aborted || revision !== this.revision) {
                return false;
            }
            return await this._writeDocument(path, signal);
        }
        finally {
            this._saving = false;
            this._continueOpenFiles();
        }
    }

    /**
     * --- 两种保存入口共用写入，成功后才提交文件身份 ---
     * @param path 不含 /storage/ 的目标路径
     * @param signal 代理取消信号
     * @returns 当前内容是否已保存
     */
    private async _writeDocument(path: string, signal?: AbortSignal): Promise<boolean> {
        const text = this.text;
        if (signal?.aborted) {
            return false;
        }
        try {
            const saved = await clickgo.fs.putContent(this, `/storage${path}`, text, { 'encoding': 'utf8' });
            if (!saved) {
                await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
                return false;
            }
        }
        catch {
            // --- 存储异常保留原文档状态，允许用户重试 ---
            await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
            return false;
        }
        if (this.file !== path) {
            ++this.revision;
        }
        this.file = path;
        this.title = `${path.slice(path.lastIndexOf('/') + 1)} - ClickGo Notepad`;
        // --- 已发生的写入不回滚，写入期间新增的编辑仍保留未保存状态 ---
        this.nosave = this.text !== text;
        return !this.nosave;
    }

    /**
     * --- 展示框架生成的网页、MCP 和 CLI 接入说明 ---
     * @returns 说明窗体关闭后完成
     */
    public async aiAccess(): Promise<void> {
        if (this.commandDisabledReason !== true) {
            return;
        }
        this.loading = true;
        const area = clickgo.core.getAvailArea();
        const form = await clickgo.form.create(this, aiFrm, {
            'width': Math.min(640, area.width - 20),
            'height': Math.min(500, area.height - 20),
        });
        this.loading = false;
        await form.showDialog();
    }

    /**
     * --- 通过与代理共用的入口切换换行 ---
     * @param event 菜单操作事件
     * @returns 更新显示
     */
    public async toggleWordWrap(event: clickgo.control.IMenulistItemCheckEvent): Promise<void> {
        event.preventDefault();
        await clickgo.command.execute(this, 'editor.wordWrap', { 'enabled': !this.wordWrap });
    }

    public onClose(event: clickgo.control.IFormCloseEvent): void {
        // --- 更新安装前已经完成保存检查，不能阻断更新器退出 ---
        if (this.installingUpdate) {
            return;
        }
        event.preventDefault();
        this.exit().catch(() => {});
    }

    public async exit(): Promise<void> {
        if (this.installingUpdate || this.closing || this._saving || this.openingFiles) {
            return;
        }
        this.closing = true;
        let closed = false;
        try {
            if (this.nosave && (this.text || this.file)) {
                const answer = await clickgo.form.confirm(this, {
                    'content': 'Save changes before closing? Choose No to discard changes.',
                    'cancel': true,
                });
                if ((answer === 0) || ((answer === true) && !(await this.save()))) {
                    return;
                }
            }
            this.close();
            closed = true;
        }
        finally {
            if (!closed) {
                this.closing = false;
            }
        }
    }

    public async about(): Promise<void> {
        await clickgo.form.dialog(this, 'ClickGo Notepad 2.0.0');
    }

    /**
     * --- 在不阻塞当前交互的情况下继续处理 Native 文件队列 ---
     * @returns 无
     */
    private _continueOpenFiles(): void {
        if (!clickgo.isNative()) {
            return;
        }
        this._openPendingFiles().catch((): void => {
            return;
        });
    }

    /**
     * --- 确认替换当前文档，避免文件关联或拖入覆盖未保存内容 ---
     * @param operation 替换文档的操作
     * @param signal 代理取消信号
     * @returns 是否可继续替换文档
     */
    private async _confirmOpenFile(operation = 'opening another file', signal?: AbortSignal): Promise<boolean> {
        if (!this.nosave || (!this.text && !this.file)) {
            return true;
        }
        const action = await clickgo.form.dialog(this, {
            'title': 'Unsaved Changes',
            'content': `Save changes before ${operation}?`,
            'buttons': ['Cancel', 'Discard', 'Save'],
        });
        if (signal?.aborted) {
            return false;
        }
        if (action === 'Save') {
            return this.save(signal);
        }
        return action === 'Discard';
    }

    /**
     * --- 读取指定文件并替换当前文档 ---
     * @param file 不含 /storage/ 的文件路径
     * @param signal 代理取消信号
     * @returns 是否已完成打开
     */
    private async _openFile(file: string, signal?: AbortSignal): Promise<boolean> {
        if (this.installingUpdate || this.closing || signal?.aborted) {
            return false;
        }
        if (!await this._confirmOpenFile('opening another file', signal) || signal?.aborted) {
            return false;
        }
        const content = await clickgo.fs.getContent(this, '/storage' + file, {
            'encoding': 'utf8',
        });
        if (content === null) {
            await clickgo.form.dialog(this, 'Unable to open the document. Please check that the file is still available.');
            return false;
        }
        if (this.installingUpdate || this.closing || signal?.aborted) {
            return false;
        }
        ++this.revision;
        this.nosave = false;
        this.file = file;
        this.text = content;
        this._observedText = content;
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
        return true;
    }

}
