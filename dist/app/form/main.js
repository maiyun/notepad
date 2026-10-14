import * as clickgo from 'clickgo';
import aiFrm from './ai/ai';
import * as lCommand from '../lib/command';
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
    title = 'New file - ClickGo Notepad';
    access = { 'openFiles': [] };
    nosave = false;
    file = '';
    text = '';
    _observedText = '';
    selectionStart = 0;
    selectionEnd = 0;
    wordWrap = true;
    checkingUpdate = false;
    updateStatus = '';
    installingUpdate = false;
    _saving = false;
    openingFiles = false;
    revision = 0;
    closing = false;
    get commandDisabledReason() {
        if (this.installingUpdate || this.closing) {
            return 'The document is closing or an update is being installed.';
        }
        if (this._saving || this.openingFiles || this.loading) {
            return 'A document operation is in progress.';
        }
        return true;
    }
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
        if (this.nosave) {
            return 'Unsaved';
        }
        return this.file ? 'Saved' : 'Ready';
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
        lCommand.register(this);
        if (!clickgo.isNative()) {
            return;
        }
        clickgo.native.onUpdateState(this, (state) => {
            if (state.status === 'downloading' && this.checkingUpdate) {
                this.updateStatus = state.progress ? `Downloading update… ${Math.floor(state.progress.percent)}%` : 'Downloading update…';
            }
            if (state.errorCode === 'install-failed') {
                void this._updateInstallFailed();
            }
        });
        this._continueOpenFiles();
        this.checkUpdates(true).catch(() => {
            return;
        });
    }
    onNativeOpenFiles(paths) {
        const file = paths[0];
        if (!file || this.access['openFiles'].includes(file)) {
            return;
        }
        this.access['openFiles'].push(file);
        this._continueOpenFiles();
    }
    async checkUpdates(automatic = false) {
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
    async _installDownloadedUpdate() {
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
    async _updateInstallFailed() {
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
    async onMin() {
        await clickgo.native.min(this);
    }
    onInput() {
        if (this.text === this._observedText) {
            return;
        }
        this._observedText = this.text;
        ++this.revision;
        this.nosave = true;
    }
    editDocument(start, end, text) {
        const next = this.text.slice(0, start) + text + this.text.slice(end);
        if (next !== this.text) {
            this.text = next;
            this.onInput();
        }
        this.selectionStart = start + text.length;
        this.selectionEnd = this.selectionStart;
    }
    toNew() {
        return clickgo.command.execute(this, 'document.new', { 'expectedRevision': this.revision });
    }
    async newDocument(signal) {
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
    open() {
        return clickgo.command.execute(this, 'document.open', { 'expectedRevision': this.revision });
    }
    async openDocument(path, signal) {
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
    async _openPendingFiles() {
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
    saveCommand() {
        return clickgo.command.execute(this, 'document.save', { 'expectedRevision': this.revision });
    }
    saveAs() {
        return clickgo.command.execute(this, 'document.saveAs', { 'expectedRevision': this.revision });
    }
    async save(signal) {
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
    async saveDocumentAs(path, signal) {
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
    async _writeDocument(path, signal) {
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
            await clickgo.form.dialog(this, 'Unable to save the document. Please try again.');
            return false;
        }
        if (this.file !== path) {
            ++this.revision;
        }
        this.file = path;
        this.title = `${path.slice(path.lastIndexOf('/') + 1)} - ClickGo Notepad`;
        this.nosave = this.text !== text;
        return !this.nosave;
    }
    async aiAccess() {
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
    async toggleWordWrap(event) {
        event.preventDefault();
        await clickgo.command.execute(this, 'editor.wordWrap', { 'enabled': !this.wordWrap });
    }
    onClose(event) {
        if (this.installingUpdate) {
            return;
        }
        event.preventDefault();
        this.exit().catch(() => { });
    }
    async exit() {
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
    async about() {
        await clickgo.form.dialog(this, 'ClickGo Notepad 2.0.0');
    }
    _continueOpenFiles() {
        if (!clickgo.isNative()) {
            return;
        }
        this._openPendingFiles().catch(() => {
            return;
        });
    }
    async _confirmOpenFile(operation = 'opening another file', signal) {
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
    async _openFile(file, signal) {
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
