import electronUpdater from 'electron-updater';
import * as native from 'clickgo-native';
const { autoUpdater } = electronUpdater;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
let checking;
let downloading;
let state = { 'status': 'disabled', 'currentVersion': native.getAppVersion() };
let downloadedVersion;
autoUpdater.on('error', (error) => {
    autoUpdater.logger?.error(error);
    if (state.status === 'restarting') {
        state = { ...state, 'status': 'error' };
    }
});
export function getUpdateState() {
    return { ...state };
}
export function checkUpdates() {
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
    checking = (async () => {
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
        catch (error) {
            autoUpdater.logger?.error(error);
            state = { 'status': 'error', 'currentVersion': currentVersion };
            return getUpdateState();
        }
    })().finally(() => {
        checking = undefined;
    });
    return checking;
}
export function downloadUpdate() {
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
    downloading = (async () => {
        try {
            const files = await autoUpdater.downloadUpdate();
            if (!files.length) {
                throw new Error('The update did not produce an installation file.');
            }
            downloadedVersion = state.version;
            state = { ...state, 'status': 'downloaded' };
        }
        catch (error) {
            autoUpdater.logger?.error(error);
            state = { ...state, 'status': 'error' };
        }
        return getUpdateState();
    })().finally(() => {
        downloading = undefined;
    });
    return downloading;
}
export function installUpdate() {
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
    catch (error) {
        autoUpdater.logger?.error(error);
        state = { ...state, 'status': 'error' };
    }
    return getUpdateState();
}
