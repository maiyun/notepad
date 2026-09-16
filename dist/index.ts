import * as native from 'clickgo-native';
import * as lUpdate from './update.js';

// --- 仅执行 ---
// --- clickgo --run ./dist/index ---
// --- 编译 ---
// --- clickgo --native --mirror cn ---

class Boot extends native.AbstractBoot {

    public main(): void {
        // --- 检测逻辑留在主进程，页面不能指定更新地址或安装文件 ---
        this.on('notepad-check-updates', (): Promise<lUpdate.IUpdateResult> => lUpdate.checkUpdates());
        this.on('notepad-download-update', (): Promise<lUpdate.IUpdateResult> => lUpdate.downloadUpdate());
        this.on('notepad-install-update', (): lUpdate.IUpdateResult => lUpdate.installUpdate());
        this.on('notepad-update-state', (): lUpdate.IUpdateResult => lUpdate.getUpdateState());
        this.run(native.path(import.meta.url, './index.html'), {
            'frame': false,
            'background': 'hsl(167, 62%, 54%)',
        });
    }

}

native.launcher(new Boot());
