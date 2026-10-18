const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['backup:log', 'restore:log', 'history:changed', 'job:state', 'scheduler:reloaded', 'navigate'];

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (event, cb) => {
    if (!EVENTS.includes(event)) return () => {};
    const handler = (_e, data) => cb(data);
    ipcRenderer.on(event, handler);
    return () => ipcRenderer.removeListener(event, handler);
  }
});
