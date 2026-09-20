import * as native from 'clickgo-native';
import * as lUpdate from './update.js';
class Boot extends native.AbstractBoot {
    _openFiles = [];
    onOpenFiles(paths) {
        const file = paths[0];
        if (!file || this._openFiles.includes(file)) {
            return;
        }
        this._openFiles.push(file);
        void this.emit('notepad-open-files');
    }
    main() {
        this.on('notepad-check-updates', () => lUpdate.checkUpdates());
        this.on('notepad-download-update', () => lUpdate.downloadUpdate());
        this.on('notepad-install-update', () => lUpdate.installUpdate());
        this.on('notepad-update-state', () => lUpdate.getUpdateState());
        this.on('notepad-take-open-files', () => this._openFiles.splice(0, 1));
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
