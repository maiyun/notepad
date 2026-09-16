import * as clickgo from 'clickgo';
import mainFrm from './form/main';

// --- 编译 cga ---
// --- clickgo --app ./dist/app ---

export default class extends clickgo.core.AbstractApp {

    public async main(): Promise<void> {
        await this.run(await clickgo.form.create(this, mainFrm));
    }

}
