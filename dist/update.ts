import electronUpdater from 'electron-updater';
import * as native from 'clickgo-native';

/** --- 传给 ClickGo 页面的更新状态，不包含安装文件路径 --- */
export interface IUpdateResult {
    'status': 'available' | 'up-to-date' | 'disabled' | 'error' | 'downloading' | 'downloaded' | 'restarting';
    'currentVersion': string;
    'version'?: string;
}

const { autoUpdater } = electronUpdater;

// --- 下载和安装均需用户主动确认 ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

/** --- 合并同时发起的更新检测 --- */
let checking: Promise<IUpdateResult> | undefined;

/** --- 合并同时发起的下载，检测期间不允许改变下载目标 --- */
let downloading: Promise<IUpdateResult> | undefined;

/** --- 当前会话已检测和验证的更新状态 --- */
let state: IUpdateResult = { 'status': 'disabled', 'currentVersion': native.getAppVersion() };

/** --- 只有下载成功的版本才能安装，安装失败后仍可重试 --- */
let downloadedVersion: string | undefined;

autoUpdater.on('error', (error: Error): void => {
    autoUpdater.logger?.error(error);
    if (state.status === 'restarting') {
        state = { ...state, 'status': 'error' };
    }
});

/**
 * --- 读取主进程中的更新状态 ---
 * @returns 更新状态副本
 */
export function getUpdateState(): IUpdateResult {
    return { ...state };
}

/**
 * --- 在本地主进程检测桌面程序的新版本 ---
 * @returns 检测结果，开发运行和 Windows 便携版不发起请求
 */
export function checkUpdates(): Promise<IUpdateResult> {
    const currentVersion = native.getAppVersion();
    if (!native.isPackaged() || process.env.PORTABLE_EXECUTABLE_FILE) {
        return Promise.resolve({ 'status': 'disabled', 'currentVersion': currentVersion });
    }
    if (downloading || downloadedVersion) {
        if (downloadedVersion && (state.status === 'error')) {
            state = { ...state, 'status': 'downloaded' };
        }
        return Promise.resolve(getUpdateState());
    }
    if (checking) {
        return checking;
    }
    checking = (async (): Promise<IUpdateResult> => {
        try {
            const result = await autoUpdater.checkForUpdates();
            if (!result) {
                state = { 'status': 'disabled', 'currentVersion': currentVersion };
                return { 'status': 'disabled', 'currentVersion': currentVersion };
            }
            state = {
                'status': result.isUpdateAvailable ? 'available' : 'up-to-date',
                'currentVersion': currentVersion,
                'version': result.updateInfo.version,
            };
            return getUpdateState();
        }
        catch (error: unknown) {
            autoUpdater.logger?.error(error);
            state = { 'status': 'error', 'currentVersion': currentVersion };
            return getUpdateState();
        }
    })().finally((): void => {
        checking = undefined;
    });
    return checking;
}

/**
 * --- 下载检测所得的更新，由 updater 校验包内容 ---
 * @returns 下载结果，页面不能指定 URL 或安装文件
 */
export function downloadUpdate(): Promise<IUpdateResult> {
    if (!native.isPackaged() || process.env.PORTABLE_EXECUTABLE_FILE) {
        return Promise.resolve({ 'status': 'disabled', 'currentVersion': native.getAppVersion() });
    }
    if (downloading) {
        return downloading;
    }
    if (downloadedVersion) {
        if (state.status !== 'restarting') {
            state = { ...state, 'status': 'downloaded' };
        }
        return Promise.resolve(getUpdateState());
    }
    if (checking || (state.status !== 'available') || !state.version) {
        return Promise.resolve({ ...state, 'status': 'error' });
    }
    state = { ...state, 'status': 'downloading' };
    downloading = (async (): Promise<IUpdateResult> => {
        try {
            const files = await autoUpdater.downloadUpdate();
            if (!files.length) {
                throw new Error('The update did not produce an installation file.');
            }
            downloadedVersion = state.version;
            state = { ...state, 'status': 'downloaded' };
        }
        catch (error: unknown) {
            autoUpdater.logger?.error(error);
            state = { ...state, 'status': 'error' };
        }
        return getUpdateState();
    })().finally((): void => {
        downloading = undefined;
    });
    return downloading;
}

/**
 * --- 安装已经下载和校验的版本，调用方须先完成文档保存 ---
 * @returns 安装启动状态，拒绝未下载和重复安装
 */
export function installUpdate(): IUpdateResult {
    if (!native.isPackaged() || process.env.PORTABLE_EXECUTABLE_FILE) {
        return { 'status': 'disabled', 'currentVersion': native.getAppVersion() };
    }
    if (!downloadedVersion || downloading || checking) {
        return { ...state, 'status': 'error' };
    }
    if (state.status === 'restarting') {
        return getUpdateState();
    }
    state = { ...state, 'status': 'restarting' };
    try {
        autoUpdater.quitAndInstall(false, true);
    }
    catch (error: unknown) {
        autoUpdater.logger?.error(error);
        state = { ...state, 'status': 'error' };
    }
    return getUpdateState();
}
