import * as clickgo from 'clickgo';
export default class extends clickgo.form.AbstractForm {
    encodings = [
        { 'value': 'utf-8', 'label': 'UTF-8' },
        { 'value': 'utf-16le', 'label': 'UTF-16 LE' },
        { 'value': 'utf-16be', 'label': 'UTF-16 BE' },
        { 'value': 'gb18030', 'label': 'GB18030' },
    ];
    encoding = ['utf-8'];
    bom = false;
    mode = 'manage';
    reopen = false;
    result = null;
    get buttons() {
        if (this.mode === 'open') {
            return ['Cancel', 'Open'];
        }
        return this.reopen ? ['Cancel', 'Reopen', 'Convert'] : ['Cancel', 'Convert'];
    }
    onMounted(data) {
        this.encoding = [data.encoding];
        this.bom = data.bom;
        this.mode = data.mode;
        this.reopen = data.reopen;
    }
    select(button) {
        if (button !== 'Cancel') {
            const encoding = this.encoding[0];
            if (!encoding) {
                return;
            }
            let action = 'convert';
            if (button === 'Open') {
                action = 'open';
            }
            else if (button === 'Reopen') {
                action = 'reopen';
            }
            this.result = {
                'action': action,
                'encoding': encoding,
                'bom': encoding === 'gb18030' ? false : this.bom,
            };
        }
        this.close();
    }
}
