const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aniimo', {
  get: () => ipcRenderer.invoke('get'),
  resolve: (answer) => ipcRenderer.invoke('resolve', answer),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  addName: (name) => ipcRenderer.invoke('add-name', name),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  importFiles: () => ipcRenderer.invoke('import-files'),
  setFriend: (friend) => ipcRenderer.invoke('set-friend', friend),
  removeFriend: (uid) => ipcRenderer.invoke('remove-friend', uid),
  setUid: (uid) => ipcRenderer.invoke('set-uid', uid),
  onUpdate: (fn) => ipcRenderer.on('update', (_e, data) => fn(data)),
});
