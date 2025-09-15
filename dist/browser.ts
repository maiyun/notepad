import * as clickgo from 'clickgo';

// --- 打包 APP ---
// --- clickgo -a ./dist/app
// --- 打包启动文件 ---
// --- clickgo -b ./dist/browser -g https://cdn.jsdelivr.net/npm/clickgo@4.0.7/dist/index.js ---

class Boot extends clickgo.AbstractBoot {

    public async main(): Promise<void> {
        const block = document.getElementById('block')!;
        let first = true;
        // --- 主题要先加载，防止应用出来了，还是原始主题 ---
        clickgo.theme.setMain('oklch(.78 .13 175)');
        await clickgo.theme.setGlobal('/clickgo/theme/light');
        /** --- 加载应用 --- */
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
        //*/
    }

    public onError(taskId: string, formId: string, error: Error, info: string): void {
        console.log(taskId, formId, error, info);
    }

}

clickgo.launcher(new Boot());