const { contextBridge, ipcRenderer } = require('electron');
// Fixed messages only. No caller-provided paths, commands, URLs, or credentials.
contextBridge.exposeInMainWorld('desktopSetup', {
  status: () => ipcRenderer.invoke('desktop-setup:status'),
  choose: () => ipcRenderer.invoke('desktop-setup:choose'),
  open: () => ipcRenderer.invoke('desktop-setup:open'),
  continue: () => ipcRenderer.invoke('desktop-setup:continue'),
});
