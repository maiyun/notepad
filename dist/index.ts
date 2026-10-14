import * as native from 'clickgo-native';

// --- 仅执行 ---
// --- clickgo --run ./dist/index --mirror cn ---
// --- 编译 ---
// --- clickgo --native --platform linux --mirror cn ---

class Boot extends native.AbstractBoot {

    /**
     * --- 创建桌面窗口并开放当前应用的公开命令 ---
     * @returns 初始化完成
     */
    public async main(): Promise<void> {
        const options = {
            'frame': false,
            'icon': native.path(import.meta.url, '../doc/logo.png'),
            'background': 'hsl(167, 62%, 54%)',
        };
        this.run(native.path(import.meta.url, './index.html'), options);
        if (await native.startMcp({ 'id': 'clickgo-notepad' }) === false) {
            this.dialog({ 'type': 'warning', 'message': 'AI access is unavailable. Restart Notepad to try again.' });
        }
    }

}

native.launcher(new Boot(), {
    'openFiles': true,
    'singleInstance': true,
    'commandAutoStart': true,
    'updates': true,
});
