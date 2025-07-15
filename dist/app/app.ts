import * as clickgo from 'clickgo';
import mainFrm from './form/main';

export default class extends clickgo.core.AbstractApp {

    public async main(): Promise<void> {
        this.run(await clickgo.form.create(mainFrm));
    }

}
