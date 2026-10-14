import * as native from 'clickgo-native';
class Boot extends native.AbstractBoot {
    async main() {
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
