import * as native from 'clickgo-native';
import * as path from 'path';

class Boot extends native.AbstractBoot {

    public main(): void {
        this.run(path.join(__dirname, '/index.html'));
    }

}

native.launcher(new Boot());
