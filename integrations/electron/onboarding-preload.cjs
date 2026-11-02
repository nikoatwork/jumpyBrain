const { contextBridge, ipcRenderer } = require('electron');
// Fixed setup actions accept a bounded display name or remote address/key fields;
// validation, credential storage and network access remain in the main process.
contextBridge.exposeInMainWorld('desktopSetup', {
  identity: (name) => ipcRenderer.invoke('desktop-setup:identity', { name }),
  status: () => ipcRenderer.invoke('desktop-setup:status'),
  choose: () => ipcRenderer.invoke('desktop-setup:choose'),
  open: () => ipcRenderer.invoke('desktop-setup:open'),
  continue: () => ipcRenderer.invoke('desktop-setup:continue'),
  remote: (url, key) => ipcRenderer.invoke('desktop-setup:remote', { url, key }),
});
