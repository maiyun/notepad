import * as clickgo from 'clickgo';
import type { IUpdateResult } from '../../update';

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
        if (clickgo.isNative()) {
            this.checkUpdates(true).catch((): void => {
                return;
            });
        }
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
        if (this.installingUpdate || this.closing) {
            return;
        }
        const paths = await clickgo.native.open({
            'filters': [
                {
                    'name': 'Text Files',
                    'accept': ['txt']
                }
            ]
        });
        if (!paths) {
            return;
        }
        const content = await clickgo.fs.getContent(this, '/storage' + paths[0], {
            'encoding': 'utf8',
        });
        if ((content === null) || this.installingUpdate || this.closing) {
            return;
        }
        this.nosave = false;
        this.file = paths[0];
        this.text = content;
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
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
                    'filters': [
                        {
                            'name': 'Text Files',
                            'accept': ['txt']
                        }
                    ]
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
        }
    }

    public async saveAs(): Promise<void> {
        if (this._saving || this.installingUpdate || this.closing) {
            return;
        }
        this._saving = true;
        try {
            const path = await clickgo.native.save({
                'filters': [
                    {
                        'name': 'Text Files',
                        'accept': ['txt']
                    }
                ]
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

}
