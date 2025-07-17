import * as clickgo from 'clickgo';

export default class extends clickgo.form.AbstractForm {

    public title = 'New file - ClickGo Notepad';

    /** --- 当前是否未保存 --- */
    public nosave = true;
    
    /** --- 文件地址 --- */
    public file: string = '';

    /** --- 文本内容 --- */
    public text: string = '';

    public async onMin(): Promise<void> {
        await clickgo.native.min();
    }

    public onInput() {
        if (this.nosave) {
            return;
        }
        this.nosave = true;
    }

    public toNew() {
        this.nosave = true;
        this.file = '';
        this.text = '';
        this.title = 'New file - ClickGo Notepad';
    }

    public async open() {
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
        const content = await clickgo.fs.getContent('/storage' + paths[0], {
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

    public async save() {
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
        await clickgo.fs.putContent('/storage' + this.file, this.text, {
            'encoding': 'utf8',
        });
        this.nosave = false;
    }

    public async saveAs() {
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
        await clickgo.fs.putContent('/storage' + this.file, this.text, {
            'encoding': 'utf8',
        });
        this.nosave = false;
    }

    public exit() {
        this.close();
    }

    public async about() {
        await clickgo.form.dialog('ClickGo Notepad 0.0.2');
    }

}
