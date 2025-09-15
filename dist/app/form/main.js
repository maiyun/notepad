import * as clickgo from 'clickgo';
export default class extends clickgo.form.AbstractForm {
    constructor() {
        super(...arguments);
        this.title = 'New file - ClickGo Notepad';
        this.nosave = true;
        this.file = '';
        this.text = '';
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
        this.nosave = true;
        this.file = '';
        this.text = '';
        this.title = 'New file - ClickGo Notepad';
    }
    async open() {
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
        if (!content) {
            return;
        }
        this.nosave = false;
        this.file = paths[0];
        this.text = content;
        this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
    }
    async save() {
        if (!this.nosave) {
            return;
        }
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
                return;
            }
            this.file = path;
            this.title = this.file.slice(this.file.lastIndexOf('/') + 1) + ' - ClickGo Notepad';
        }
        await clickgo.fs.putContent(this, '/storage' + this.file, this.text, {
            'encoding': 'utf8',
        });
        this.nosave = false;
    }
    async saveAs() {
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
        await clickgo.fs.putContent(this, '/storage' + this.file, this.text, {
            'encoding': 'utf8',
        });
        this.nosave = false;
    }
    exit() {
        this.close();
    }
    async about() {
        await clickgo.form.dialog(this, 'ClickGo Notepad 1.0.0');
    }
}
