const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  googleAuth: () => ipcRenderer.invoke('google-auth')
}); 