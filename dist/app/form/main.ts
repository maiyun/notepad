import * as clickgo from 'clickgo';
import type { IUpdateResult } from '../../update';

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

    /** --- 当前是否未保存 --- */
    public nosave = true;

    /** --- 文件地址 --- */
    public file: string = '';

    /** --- 文本内容 --- */
    public text: string = '';

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
    private _openingFiles = false;

    /** --- 避免重复关闭确认，确认期间锁住文档内容 --- */
    public closing = false;

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
        return this.nosave ? 'Unsaved' : 'Saved';
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
        if (!clickgo.isNative()) {
            return;
        }
        clickgo.native.on(this, 'notepad-open-files', (): void => this._continueOpenFiles());
        this._continueOpenFiles();
        this.checkUpdates(true).catch((): void => {
            return;
        });
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
            const result: IUpdateResult | undefined = await clickgo.native.invoke('notepad-check-updates');
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
                    const download: IUpdateResult | undefined = await clickgo.native.invoke('notepad-download-update');
                    this.updateStatus = '';
                    if (!clickgo.form.get(this.formId)) {
                        return;
                    }
                    if (download?.status !== 'downloaded') {
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
            let result: IUpdateResult | undefined = await clickgo.native.invoke('notepad-install-update');
            // --- 安装可能异步失败，应用仍在运行时恢复编辑和重试入口 ---
            while ((result?.status === 'restarting') && clickgo.form.get(this.formId)) {
                await clickgo.tool.sleep(1000);
                result = await clickgo.native.invoke('notepad-update-state');
            }
            if (clickgo.form.get(this.formId)) {
                await clickgo.form.dialog(this, 'Unable to start the update installer. Your document is safe; please try again later.');
            }
        }
        catch {
            if (clickgo.form.get(this.formId)) {
                await clickgo.form.dialog(this, 'Unable to start the update installer. Please try again later.');
            }
        }
        finally {
            this.installingUpdate = false;
        }
    }

    public async onMin(): Promise<void> {
        await clickgo.native.min(this);
    }

    public onInput(): void {
        if (this.nosave) {
            return;
        }
        this.nosave = true;
    }

    public toNew(): void {
        if (this.installingUpdate || this.closing) {
            return;
        }
        this.nosave = true;
        this.file = '';
        this.text = '';
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.title = 'New file - ClickGo Notepad';
    }

    public async open(): Promise<void> {
        if (this._openingFiles || this._saving || this.installingUpdate || this.closing) {
            return;
        }
        this._openingFiles = true;
        try {
            const paths = await clickgo.native.open({
                'filters': fileFilters,
            });
            if (!paths) {
                return;
            }
            await this._openFile(paths[0]);
        }
        finally {
            this._openingFiles = false;
            this._continueOpenFiles();
        }
    }

    /**
     * --- 读取 Native 在启动、文件关联或拖入时交给应用的文件 ---
     * @returns 无
     */
    private async _openPendingFiles(): Promise<void> {
        if (this._openingFiles || this._saving || this.installingUpdate || this.closing) {
            return;
        }
        this._openingFiles = true;
        try {
            const paths: string[] | undefined = await clickgo.native.invoke('notepad-take-open-files');
            if (!paths?.length) {
                return;
            }
            if (!await this._openFile(paths[0])) {
                return;
            }
        }
        finally {
            this._openingFiles = false;
        }
        this._continueOpenFiles();
    }

    public async save(): Promise<boolean> {
        if (this._saving || this.installingUpdate) {
            return false;
        }
        if (!this.nosave) {
            return true;
        }
        this._saving = true;
        try {
            if (!this.file) {
                const path = await clickgo.native.save({
                    'filters': fileFilters,
                });
                if (!path) {
                    return false;
                }
                this.file = path;
                this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
            }
            const file = this.file;
            const text = this.text;
            const saved = await clickgo.fs.putContent(this, '/storage' + file, text, {
                'encoding': 'utf8',
            });
            if (!saved) {
                await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
                return false;
            }
            // --- 写入期间的新增编辑不能被标记成已保存 ---
            if ((this.file === file) && (this.text === text)) {
                this.nosave = false;
            }
            return !this.nosave;
        }
        catch {
            await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
            return false;
        }
        finally {
            this._saving = false;
            this._continueOpenFiles();
        }
    }

    public async saveAs(): Promise<void> {
        if (this._saving || this.installingUpdate || this.closing) {
            return;
        }
        this._saving = true;
        try {
            const path = await clickgo.native.save({
                'filters': fileFilters,
            });
            if (!path) {
                return;
            }
            this.file = path;
            this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
            this.nosave = true;
            const file = this.file;
            const text = this.text;
            const saved = await clickgo.fs.putContent(this, '/storage' + file, text, {
                'encoding': 'utf8',
            });
            if (!saved) {
                await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
                return;
            }
            if ((this.file === file) && (this.text === text)) {
                this.nosave = false;
            }
        }
        catch {
            await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
        }
        finally {
            this._saving = false;
            this._continueOpenFiles();
        }
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
        if (this.installingUpdate || this.closing || this._saving) {
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
        this._openPendingFiles().catch((): void => {
            return;
        });
    }

    /**
     * --- 确认替换当前文档，避免文件关联或拖入覆盖未保存内容 ---
     * @returns 是否可继续打开文件
     */
    private async _confirmOpenFile(): Promise<boolean> {
        if (!this.nosave || (!this.text && !this.file)) {
            return true;
        }
        const action = await clickgo.form.dialog(this, {
            'title': 'Unsaved Changes',
            'content': 'Save changes before opening another file?',
            'buttons': ['Cancel', 'Discard', 'Save'],
        });
        if (action === 'Save') {
            return this.save();
        }
        return action === 'Discard';
    }

    /**
     * --- 读取指定文件并替换当前文档 ---
     * @param file 不含 /storage/ 的文件路径
     * @returns 是否已完成打开
     */
    private async _openFile(file: string): Promise<boolean> {
        if (this.installingUpdate || this.closing || !await this._confirmOpenFile()) {
            return false;
        }
        const content = await clickgo.fs.getContent(this, '/storage' + file, {
            'encoding': 'utf8',
        });
        if (content === null) {
            await clickgo.form.dialog(this, 'Unable to open the document. Please check that the file is still available.');
            return false;
        }
        if (this.installingUpdate || this.closing) {
            return false;
        }
        this.nosave = false;
        this.file = file;
        this.text = content;
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
        return true;
    }

}
