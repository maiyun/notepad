import * as clickgo from 'clickgo';
export default class extends clickgo.form.AbstractForm {
    title = 'New file - ClickGo Notepad';
    nosave = true;
    file = '';
    text = '';
    selectionStart = 0;
    selectionEnd = 0;
    wordWrap = true;
    checkingUpdate = false;
    updateStatus = '';
    installingUpdate = false;
    _saving = false;
    get characterCount() {
        return Array.from(this.text).length;
    }
    get lineCount() {
        return this.text.split(/\r\n|\r|\n/).length;
    }
    get selectionCount() {
        const start = Math.max(0, Math.min(this.selectionStart, this.selectionEnd, this.text.length));
        const end = Math.max(0, Math.min(Math.max(this.selectionStart, this.selectionEnd), this.text.length));
        return Array.from(this.text.slice(start, end)).length;
    }
    get cursorLine() {
        return this._cursorParts.length;
    }
    get cursorColumn() {
        return Array.from(this._cursorParts[this._cursorParts.length - 1] ?? '').length + 1;
    }
    get lineEnding() {
        if (this.text.includes('\r\n')) {
            return 'CRLF';
        }
        if (this.text.includes('\r')) {
            return 'CR';
        }
        return 'LF';
    }
    get documentStatus() {
        if (this.updateStatus) {
            return this.updateStatus;
        }
        if (this._saving) {
            return 'Saving…';
        }
        return this.nosave ? 'Unsaved' : 'Saved';
    }
    get documentStatusType() {
        if (this.updateStatus) {
            return 'cg';
        }
        return this.nosave ? 'warning' : 'primary';
    }
    get _cursorParts() {
        const offset = Math.max(0, Math.min(this.selectionEnd, this.text.length));
        return this.text.slice(0, offset).split(/\r\n|\r|\n/);
    }
    onMounted() {
        if (clickgo.isNative()) {
            this.checkUpdates(true).catch(() => {
                return;
            });
        }
    }
    async checkUpdates(automatic = false) {
        if (this.checkingUpdate) {
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
            const result = await clickgo.native.invoke('notepad-check-updates');
            if (!clickgo.form.get(this.formId)) {
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
            let message;
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
                    const download = await clickgo.native.invoke('notepad-download-update');
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
    async _installDownloadedUpdate() {
        const action = await clickgo.form.dialog(this, {
            'title': 'Update Ready',
            'content': 'The update has been downloaded. Restart and install it now?',
            'buttons': ['Later', 'Restart and Install'],
        });
        if ((action !== 'Restart and Install') || !clickgo.form.get(this.formId)) {
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
        if (!clickgo.form.get(this.formId) || (this.nosave && (this.text || this.file)) || this._saving) {
            return;
        }
        this.installingUpdate = true;
        this.updateStatus = 'Restarting to install update…';
        try {
            let result = await clickgo.native.invoke('notepad-install-update');
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
    async onMin() {
        await clickgo.native.min(this);
    }
    onInput() {
        if (this.nosave) {
            return;
        }
        this.nosave = true;
    }
    toNew() {
        if (this.installingUpdate) {
            return;
        }
        this.nosave = true;
        this.file = '';
        this.text = '';
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.title = 'New file - ClickGo Notepad';
    }
    async open() {
        if (this.installingUpdate) {
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
        if ((content === null) || this.installingUpdate) {
            return;
        }
        this.nosave = false;
        this.file = paths[0];
        this.text = content;
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
    }
    async save() {
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
    async saveAs() {
        if (this._saving || this.installingUpdate) {
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
    exit() {
        if (this.installingUpdate) {
            return;
        }
        this.close();
    }
    async about() {
        await clickgo.form.dialog(this, 'ClickGo Notepad 1.0.0');
    }
}
