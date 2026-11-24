// Ponte mínima entre a página e o programa: tela cheia, janela, arquivos (prints e vídeos), atualização (só com
// clique), relatos e atalhos que chegam com outra janela na frente.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('espectro', {
  telaCheia: () => ipcRenderer.invoke('tela-cheia'),
  janela: (opcoes) => ipcRenderer.invoke('janela', opcoes),
  idioma: (codigo) => ipcRenderer.invoke('idioma', codigo),
  versao: () => ipcRenderer.invoke('versao'),
  procurarAtualizacao: () => ipcRenderer.invoke('atualizacao:procurar'),
  baixarAtualizacao: () => ipcRenderer.invoke('atualizacao:baixar'),
  instalarAtualizacao: () => ipcRenderer.invoke('atualizacao:instalar'),
  aoAtualizacao: (fn) => { ipcRenderer.on('atualizacao', (_e, estado) => fn(estado)); },
  enviarRelato: (relato) => ipcRenderer.invoke('relato:enviar', relato),
  salvarArquivo: (pedido) => ipcRenderer.invoke('arquivo:salvar', pedido),
  abrirPasta: (pasta) => ipcRenderer.invoke('arquivo:abrir-pasta', pasta),
  gravacaoAbrir: (nome) => ipcRenderer.invoke('gravacao:abrir', nome),
  gravacaoEscrever: (id, posicao, dados) => ipcRenderer.invoke('gravacao:escrever', id, posicao, dados),
  gravacaoFechar: (id, manter) => ipcRenderer.invoke('gravacao:fechar', id, manter),
  aoAtalho: (fn) => { ipcRenderer.on('atalho', (_e, nome) => fn(nome)); },
  aoFecharPedido: (fn) => { ipcRenderer.on('fechar-pedido', () => fn()); },
  podeFechar: () => ipcRenderer.invoke('pode-fechar'),
  abrirCodigo: () => ipcRenderer.invoke('abrir-codigo'),
  // complementos baixados à parte (Suavizar movimento)
  complementoEstado: (id) => ipcRenderer.invoke('complemento:estado', id),
  complementoBaixar: (id) => ipcRenderer.invoke('complemento:baixar', id),
  complementoRemover: (id) => ipcRenderer.invoke('complemento:remover', id),
  aoComplemento: (fn) => { ipcRenderer.on('complemento', (_e, estado) => fn(estado)); },
});
