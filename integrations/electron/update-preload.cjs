const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('jumpyBrainUpdates', {
  state: () => ipcRenderer.invoke('jumpybrain:update:state'),
  check: () => ipcRenderer.invoke('jumpybrain:update:check'),
  install: () => ipcRenderer.invoke('jumpybrain:update:install'),
  restart: () => ipcRenderer.invoke('jumpybrain:update:restart'),
  subscribe: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('jumpybrain:update:state-changed', listener);
    return () => ipcRenderer.removeListener('jumpybrain:update:state-changed', listener);
  },
});
