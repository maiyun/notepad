import * as clickgo from 'clickgo';

export default class extends clickgo.form.AbstractForm {

    /** --- 根据宿主可用区域创建，Native 子窗体不能超出实体窗口 --- */
    public width = 460;

    public height = 340;

    /** --- 默认说明不读取或包含连接凭据 --- */
    public guide = '';

    public webMcpStatus = '';

    /** --- 只有用户显式选择后才展示 HTTP 连接设置 --- */
    public connection = '';

    public native = clickgo.isNative();

    /**
     * --- 读取当前接入能力和框架生成的说明 ---
     * @param data 宿主可用的窗体尺寸
     * @returns 更新说明
     */
    public async onMounted(data: { 'width': number; 'height': number; }): Promise<void> {
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

    /**
     * --- 显示全页面的 WebMCP 状态，旧浏览器仍可使用 JavaScript 接口 ---
     * @param status 框架广播的浏览器状态
     * @returns 更新状态文本
     */
    public onWebMcpStatusChanged(status: clickgo.command.TWebMcpStatus): void {
        this.webMcpStatus = status === 'ready' ? 'WebMCP is available.' : 'WebMCP is not supported. The JavaScript command API is available.';
    }

    /**
     * --- 用户主动读取当前 HTTP 连接配置，不写日志或公开命令 ---
     * @returns 显示可复制的连接配置
     */
    public async showConnection(): Promise<void> {
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
