import * as native from 'clickgo-native';
import * as lUpdate from './update.js';

// --- 仅执行 ---
// --- clickgo --run ./dist/index --mirror cn ---
// --- 编译 ---
// --- clickgo --native --platform linux --mirror cn ---

class Boot extends native.AbstractBoot {

    /** --- 等待 ClickGo 窗体取走的文件 --- */
    private _openFiles: string[] = [];

    /**
     * --- 接收 Native 转交的文件，页面尚未加载完成时先暂存 ---
     * @param paths 不含 /storage/ 的文件路径
     * @returns 无
     */
    public onOpenFiles(paths: string[]): void {
        const file = paths[0];
        if (!file || this._openFiles.includes(file)) {
            return;
        }
        // --- Notepad 是单文档应用，一次系统请求只接收首个文件 ---
        this._openFiles.push(file);
        void this.emit('notepad-open-files');
    }

    public main(): void {
        // --- 检测逻辑留在主进程，页面不能指定更新地址或安装文件 ---
        this.on('notepad-check-updates', (): Promise<lUpdate.IUpdateResult> => lUpdate.checkUpdates());
        this.on('notepad-download-update', (): Promise<lUpdate.IUpdateResult> => lUpdate.downloadUpdate());
        this.on('notepad-install-update', (): lUpdate.IUpdateResult => lUpdate.installUpdate());
        this.on('notepad-update-state', (): lUpdate.IUpdateResult => lUpdate.getUpdateState());
        this.on('notepad-take-open-files', (): string[] => this._openFiles.splice(0, 1));
        const options = {
            'frame': false,
            'icon': native.path(import.meta.url, '../doc/logo.png'),
            'background': 'hsl(167, 62%, 54%)',
        };
        this.run(native.path(import.meta.url, './index.html'), options);
    }

}

native.launcher(new Boot(), {
    'openFiles': true,
    'singleInstance': true,
});
