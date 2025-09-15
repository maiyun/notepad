import * as native from 'clickgo-native';

// --- 仅执行 ---
// --- clickgo --run ./dist/index ---
// --- 编译 ---
// --- clickgo --native --mirror cn ---

class Boot extends native.AbstractBoot {

    public main(): void {
        this.run(native.path(import.meta.url, './index.html'), {
            'frame': false,
            'background': 'hsl(167, 62%, 54%)',
        });
    }

}

native.launcher(new Boot());
