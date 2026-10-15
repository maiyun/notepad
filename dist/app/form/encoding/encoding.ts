import * as clickgo from 'clickgo';

/** --- 编码选择结果；重新打开不改变源文件，转换仅更新待保存编码 --- */
export interface IEncodingChoice extends clickgo.tool.ITextEncoding {
    'action': 'open' | 'reopen' | 'convert';
}

export default class extends clickgo.form.AbstractForm {

    public encodings = [
        { 'value': 'utf-8', 'label': 'UTF-8' },
        { 'value': 'utf-16le', 'label': 'UTF-16 LE' },
        { 'value': 'utf-16be', 'label': 'UTF-16 BE' },
        { 'value': 'gb18030', 'label': 'GB18030' },
    ];

    public encoding: clickgo.tool.TTextEncoding[] = ['utf-8'];

    public bom = false;

    public mode: 'open' | 'manage' = 'manage';

    public reopen = false;

    public result: IEncodingChoice | null = null;

    /** --- 打开时确认解码，管理时区分重新读取和更改保存编码 --- */
    public get buttons(): string[] {
        if (this.mode === 'open') {
            return ['Cancel', 'Open'];
        }
        return this.reopen ? ['Cancel', 'Reopen', 'Convert'] : ['Cancel', 'Convert'];
    }

    /**
     * --- 初始化本次编码选择 ---
     * @param data 当前编码、BOM、选择用途及是否有可重新打开的文件
     * @returns 初始化完成
     */
    public onMounted(data: clickgo.tool.ITextEncoding & { 'mode': 'open' | 'manage'; 'reopen': boolean; }): void {
        this.encoding = [data.encoding];
        this.bom = data.bom;
        this.mode = data.mode;
        this.reopen = data.reopen;
    }

    /**
     * --- 返回显式的编码操作，取消不产生结果 ---
     * @param button 用户选择的动作
     * @returns 关闭选择窗体
     */
    public select(button: string): void {
        if (button !== 'Cancel') {
            const encoding = this.encoding[0];
            if (!encoding) {
                return;
            }
            let action: IEncodingChoice['action'] = 'convert';
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
