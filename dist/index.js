import * as native from 'clickgo-native';
class Boot extends native.AbstractBoot {
    main() {
        this.run(native.path(import.meta.url, './index.html'), {
            'frame': false,
            'background': 'hsl(167, 62%, 54%)',
        });
    }
}
native.launcher(new Boot());
