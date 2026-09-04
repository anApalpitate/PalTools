const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('paltoolsAgent', {
  listProfiles: () => ipcRenderer.invoke('paltools-agent:list-profiles'),
  saveProfile: (profile, apiKey) => ipcRenderer.invoke('paltools-agent:save-profile', profile, apiKey),
  removeProfile: (profileId) => ipcRenderer.invoke('paltools-agent:remove-profile', profileId),
  setDefaultProfile: (profileId) => ipcRenderer.invoke('paltools-agent:set-default-profile', profileId),
  complete: (profileId, request, requestId) => ipcRenderer.invoke('paltools-agent:complete', profileId, request, requestId),
  cancel: (requestId) => ipcRenderer.invoke('paltools-agent:cancel', requestId),
  subscribe: (listener) => {
    const handler = (_event, requestId, streamEvent) => listener(requestId, streamEvent)
    ipcRenderer.on('paltools-agent:stream-event', handler)
    return () => ipcRenderer.removeListener('paltools-agent:stream-event', handler)
  },
})
