// Ponte mínima entre a página e o programa: tela cheia e atualização (só quando a pessoa clica).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('espectro', {
  telaCheia: () => ipcRenderer.invoke('tela-cheia'),
  versao: () => ipcRenderer.invoke('versao'),
  procurarAtualizacao: () => ipcRenderer.invoke('atualizacao:procurar'),
  baixarAtualizacao: () => ipcRenderer.invoke('atualizacao:baixar'),
  instalarAtualizacao: () => ipcRenderer.invoke('atualizacao:instalar'),
  aoAtualizacao: (fn) => { ipcRenderer.on('atualizacao', (_e, estado) => fn(estado)); },
});
