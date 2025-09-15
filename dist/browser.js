import * as clickgo from 'clickgo';
class Boot extends clickgo.AbstractBoot {
    async main() {
        const block = document.getElementById('block');
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
            'permissions': ['root'],
        });
        console.log('taskId', taskId);
        document.getElementById('main')?.remove();
    }
    onError(taskId, formId, error, info) {
        console.log(taskId, formId, error, info);
    }
}
clickgo.launcher(new Boot());
