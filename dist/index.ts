import * as native from 'clickgo-native';

class Boot extends native.AbstractBoot {

    public main(): void {
        this.run('./index.html');
    }

}

native.launcher(new Boot());
