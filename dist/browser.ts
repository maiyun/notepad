import * as clickgo from 'clickgo';

const box = document.getElementById('box')!;
box.addEventListener('mouseenter', function() {
    if (!navigator.userAgent.includes('immersion/1')) {
        return;
    }
    clickgo.native.invoke('cg-mouse-ignore', clickgo.native.getToken(), false) as any;
});
box.addEventListener('mouseleave', function() {
    if (!navigator.userAgent.includes('immersion/1')) {
        return;
    }
    clickgo.native.invoke('cg-mouse-ignore', clickgo.native.getToken(), true) as any;
});

class Boot extends clickgo.AbstractBoot {

    public async main(): Promise<void> {
        const block = document.getElementById('block')!;
        let first = true;
        const taskId = await clickgo.task.run('app/', {
            'notify': false,
            'progress': (loaded, total) => {
                if (first) {
                    first = false;
                    block.style.transitionDuration = '.5s';
                }
                block.style.width = ((loaded + 1) / (total + 1) * 100).toString() + '%';
            },
            'permissions': ['root'],
        });
        console.log('taskId', taskId);
        document.getElementById('main')?.remove();
    }

    public onError(taskId: number, formId: number, error: Error, info: string): void {
        console.log(taskId, formId, error, info);
    }

}

clickgo.launcher(new Boot());