'use strict';
/* Tells the page it runs inside the desktop program. The page gets no Node access. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tdDesktop', {
  isDesktop: true,
  open: () => ipcRenderer.invoke('td:open'),
  version: () => ipcRenderer.invoke('td:version')
});
