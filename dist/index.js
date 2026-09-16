import * as native from 'clickgo-native';
import * as lUpdate from './update.js';
class Boot extends native.AbstractBoot {
    main() {
        this.on('notepad-check-updates', () => lUpdate.checkUpdates());
        this.on('notepad-download-update', () => lUpdate.downloadUpdate());
        this.on('notepad-install-update', () => lUpdate.installUpdate());
        this.on('notepad-update-state', () => lUpdate.getUpdateState());
        this.run(native.path(import.meta.url, './index.html'), {
            'frame': false,
            'background': 'hsl(167, 62%, 54%)',
        });
    }
}
native.launcher(new Boot());
