import * as clickgo from 'clickgo';
class Boot extends clickgo.AbstractBoot {
    async main() {
        const block = document.getElementById('block');
        const text = document.getElementById('text');
        let first = true;
        clickgo.theme.setMain('oklch(.78 .13 175)');
        await clickgo.theme.setGlobal('/clickgo/theme/light');
        const taskId = await clickgo.task.run(this._sysId, 'app.cga', {
            'notify': false,
            perProgress: (per) => {
                if (first) {
                    first = false;
                    block.style.transitionDuration = '.5s';
                }
                block.style.width = (per * 100).toString() + '%';
            },
            initProgress: (loaded, total, _type, msg) => {
                text.textContent = `[${loaded}/${total}] ${msg}`;
            },
            'permissions': ['root'],
        });
        if (typeof taskId !== 'string') {
            text.textContent = `Load failed (${taskId}).`;
            return;
        }
        document.getElementById('main')?.remove();
    }
    onError(taskId, formId, error, info) {
        const text = document.getElementById('text');
        if (!text) {
            return;
        }
        console.log(taskId, formId, error, info);
    }
}
await clickgo.launcher(new Boot());
