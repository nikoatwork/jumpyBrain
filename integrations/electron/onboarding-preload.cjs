const { contextBridge, ipcRenderer } = require('electron');
// Fixed setup actions. Only remote setup accepts bounded address/key fields;
// validation, credential storage and network access remain in the main process.
contextBridge.exposeInMainWorld('desktopSetup', {
  status: () => ipcRenderer.invoke('desktop-setup:status'),
  choose: () => ipcRenderer.invoke('desktop-setup:choose'),
  open: () => ipcRenderer.invoke('desktop-setup:open'),
  continue: () => ipcRenderer.invoke('desktop-setup:continue'),
  remote: (url, key) => ipcRenderer.invoke('desktop-setup:remote', { url, key }),
});
