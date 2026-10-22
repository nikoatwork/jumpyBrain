const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jumpyBrainUpdate', Object.freeze({ action: name => ipcRenderer.invoke('jumpybrain:update', name) }));
