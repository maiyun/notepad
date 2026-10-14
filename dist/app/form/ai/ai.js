import * as clickgo from 'clickgo';
export default class extends clickgo.form.AbstractForm {
    width = 460;
    height = 340;
    guide = '';
    webMcpStatus = '';
    connection = '';
    native = clickgo.isNative();
    async onMounted(data) {
        this.width = data.width;
        this.height = data.height;
        const guide = await clickgo.command.getAgentGuide(this);
        if (guide === false || guide === null) {
            return;
        }
        this.guide = guide;
        const info = await clickgo.command.getAgentInfo(this);
        if (info === false || info === null) {
            return;
        }
        this.onWebMcpStatusChanged(info.webMcp.status);
    }
    onWebMcpStatusChanged(status) {
        this.webMcpStatus = status === 'ready' ? 'WebMCP is available.' : 'WebMCP is not supported. The JavaScript command API is available.';
    }
    async showConnection() {
        if (this.loading) {
            return;
        }
        this.loading = true;
        const info = await clickgo.native.getMcpInfo(this);
        this.loading = false;
        if (info === false) {
            this.connection = 'Permission to read connection settings was denied.';
            return;
        }
        if (info === null) {
            this.connection = 'Local MCP is unavailable. Restart Notepad to try again.';
            return;
        }
        this.connection = JSON.stringify({
            'url': info.url, 'headers': { 'Authorization': `Bearer ${info.token}` },
        }, null, 2);
    }
}
