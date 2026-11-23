// Espectro Captura: janela que mostra e toca a placa de captura com controle de volume.
// Só abre a página local do app; a internet é usada só para procurar atualização e mandar relato (com consentimento).
const { app, BrowserWindow, session, Menu, ipcMain, dialog, crashReporter, net, shell, globalShortcut, Tray, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');

// Teste sem janela (ESPECTRO_CAPTURA_TESTE=<arquivo.png>): abre escondido, roda o roteiro de teste, tira um print e fecha.
const TESTE = process.env.ESPECTRO_CAPTURA_TESTE || '';
if (TESTE) {
  // testes nunca mexem nas preferências de quem usa o programa nem tocam som nas caixas dela
  app.setPath('userData', path.join(os.tmpdir(), 'espectro-captura-teste'));
  app.commandLine.appendSwitch('mute-audio');
  // ESPECTRO_CAPTURA_TESTE_FALSO=1: câmera e microfone falsos do Chromium (testa gravação e som sem a placa)
  if (process.env.ESPECTRO_CAPTURA_TESTE_FALSO) {
    app.commandLine.appendSwitch('use-fake-device-for-media-stream');
    app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  }
}

// Um programa aberto por vez (com "abrir junto com o Windows" e o ícone perto do relógio, evita duas janelas brigando
// pela placa): abrir de novo só traz a janela da frente.
if (!TESTE && !app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => mostrarJanela());

// ---------------------------------------------------------------- idioma dos avisos do programa
let idioma = 'pt';
const TXT = {
  pt: { titulo: 'O Espectro Captura teve um problema e precisou recomeçar.', detalhe: 'Quer mandar um aviso para a Espectro Soluções? Vão só a versão do programa, a versão do Windows e o motivo técnico. Nenhuma imagem nem som vão junto.', enviar: 'Enviar aviso', naoEnviar: 'Não enviar', mostrar: 'Mostrar a janela', mudo: 'Mudo / com som', print: 'Print', replay: 'Salvar o replay', gravar: 'Gravar ou parar', sair: 'Sair' },
  en: { titulo: 'Espectro Captura had a problem and had to restart.', detalhe: 'Send a report to Espectro Soluções? Only the app version, the Windows version and the technical reason are sent. No picture or sound.', enviar: 'Send report', naoEnviar: 'Don\'t send', mostrar: 'Show window', mudo: 'Mute / unmute', print: 'Screenshot', replay: 'Save replay', gravar: 'Record or stop', sair: 'Quit' },
  es: { titulo: 'Espectro Captura tuvo un problema y tuvo que reiniciarse.', detalhe: '¿Quieres enviar un aviso a Espectro Soluções? Solo van la versión del programa, la versión de Windows y el motivo técnico. Ninguna imagen ni sonido.', enviar: 'Enviar aviso', naoEnviar: 'No enviar', mostrar: 'Mostrar la ventana', mudo: 'Silencio / con sonido', print: 'Captura', replay: 'Guardar repetición', gravar: 'Grabar o detener', sair: 'Salir' },
};
const tx = (k) => (TXT[idioma] || TXT.pt)[k];

// ---------------------------------------------------------------- relatos (travamento, problema, sugestão)
// Vão para a Espectro Soluções SÓ quando a pessoa aceita ou clica em enviar. Chegam em Contatos do site.
const URL_RELATO = 'https://app.espectrosolucoes.com.br/api/captura/relato';
// Travamento do programa inteiro: o Windows não deixa perguntar na hora, então o Electron guarda um arquivo
// .dmp local (nada é enviado) e, na próxima abertura, o app pergunta se pode mandar o aviso.
crashReporter.start({ uploadToServer: false, compress: true });
const sistema = () => `Windows ${os.release()} ${os.arch()}`;
const arquivoPendente = () => path.join(app.getPath('userData'), 'relato-pendente.json');
async function enviarRelato(relato) {
  const corpo = { versao: app.getVersion(), sistema: sistema(), ...relato };
  const r = await net.fetch(URL_RELATO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `O envio falhou (${r.status}).`);
  return true;
}
// pergunta se pode mandar o relato de um travamento; se não der para enviar agora, guarda para a próxima abertura
async function perguntarTravamento(janela, detalhes) {
  const { response } = await dialog.showMessageBox(janela && !janela.isDestroyed() ? janela : undefined, {
    type: 'warning', title: 'Espectro Captura', noLink: true, message: tx('titulo'), detail: tx('detalhe'),
    buttons: [tx('enviar'), tx('naoEnviar')], defaultId: 0, cancelId: 1,
  });
  if (response !== 0) return;
  try { await enviarRelato({ tipo: 'travamento', detalhes }); }
  catch { try { fs.writeFileSync(arquivoPendente(), JSON.stringify({ tipo: 'travamento', detalhes })); } catch { /* sem disco */ } }
}
function dumpsNovos() {
  try {
    const pasta = app.getPath('crashDumps');
    const marca = path.join(app.getPath('userData'), 'dumps-vistos.txt');
    const vistos = new Set(fs.existsSync(marca) ? fs.readFileSync(marca, 'utf8').split('\n') : []);
    const todos = [];
    (function andar(p) { for (const n of fs.readdirSync(p, { withFileTypes: true })) { const c = path.join(p, n.name); if (n.isDirectory()) andar(c); else if (n.name.endsWith('.dmp')) todos.push(c); } })(pasta);
    const novos = todos.filter((c) => !vistos.has(c));
    fs.writeFileSync(marca, todos.join('\n'));
    return novos.map((c) => `${path.basename(c)} (${fs.statSync(c).mtime.toISOString()})`);
  } catch { return []; }
}
ipcMain.handle('relato:enviar', async (_e, relato) => {
  const tipo = ['sugestao', 'problema', 'outro'].includes(relato && relato.tipo) ? relato.tipo : 'outro';
  const limpo = (v, n) => String(v || '').slice(0, n);
  try {
    await enviarRelato({ tipo, mensagem: limpo(relato.mensagem, 3000), nome: limpo(relato.nome, 120), email: limpo(relato.email, 160), detalhes: limpo(relato.detalhes, 2000) });
    return { ok: true };
  } catch (e) { return { ok: false, erro: e.message || 'Não deu para enviar agora.' }; }
});

// ---------------------------------------------------------------- atualização SÓ quando a pessoa clica
// O app procura (sem baixar) e mostra o botão; baixa e instala por clique.
// Os arquivos ficam em https://espectrosolucoes.com.br/atualizacoes/espectro-captura/ (latest.yml + instalador).
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
let janelaPrincipal = null;
function enviarParaTela(canal, dado) { if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send(canal, dado); }
const avisarAtualizacao = (estado) => enviarParaTela('atualizacao', estado);
autoUpdater.on('update-available', (i) => avisarAtualizacao({ fase: 'disponivel', versao: i.version }));
autoUpdater.on('update-not-available', () => avisarAtualizacao({ fase: 'em-dia' }));
autoUpdater.on('download-progress', (p) => avisarAtualizacao({ fase: 'baixando', porcento: Math.round(p.percent || 0) }));
autoUpdater.on('update-downloaded', (i) => avisarAtualizacao({ fase: 'pronta', versao: i.version }));
autoUpdater.on('error', () => avisarAtualizacao({ fase: 'erro' }));
async function procurar() {
  if (!app.isPackaged) { avisarAtualizacao({ fase: 'em-dia' }); return; } // rodando do código: não há o que atualizar
  try { await autoUpdater.checkForUpdates(); } catch { avisarAtualizacao({ fase: 'erro' }); }
}
ipcMain.handle('versao', () => app.getVersion());
ipcMain.handle('atualizacao:procurar', () => procurar());
ipcMain.handle('atualizacao:baixar', () => autoUpdater.downloadUpdate().catch(() => avisarAtualizacao({ fase: 'erro' })));
ipcMain.handle('atualizacao:instalar', () => { fecharDeVez = true; autoUpdater.quitAndInstall(false, true); });

// ---------------------------------------------------------------- janela, Windows, atalhos com outra janela na frente
ipcMain.handle('tela-cheia', (e) => {
  const j = BrowserWindow.fromWebContents(e.sender);
  if (j) j.setFullScreen(!j.isFullScreen());
});
const ATALHOS = { 'Control+Alt+Up': 'mais', 'Control+Alt+Down': 'menos', 'Control+Alt+M': 'mudo', 'Control+Alt+P': 'print', 'Control+Alt+R': 'replay', 'Control+Alt+G': 'gravar' };
function atalhosGlobais(ligar) {
  globalShortcut.unregisterAll();
  if (!ligar || TESTE) return;
  for (const [tecla, nome] of Object.entries(ATALHOS)) { try { globalShortcut.register(tecla, () => enviarParaTela('atalho', nome)); } catch { /* outra app já usa */ } }
}
ipcMain.handle('janela', (e, o) => {
  const j = BrowserWindow.fromWebContents(e.sender);
  if (!j || !o) return;
  j.setAlwaysOnTop(Boolean(o.topo), 'floating');
  if (o.telaCheia === true && !TESTE) j.setFullScreen(true);
  if (typeof o.windows === 'boolean' && app.isPackaged && !TESTE) app.setLoginItemSettings({ openAtLogin: o.windows });
  if (typeof o.atalhosGlobais === 'boolean') atalhosGlobais(o.atalhosGlobais);
});
ipcMain.handle('idioma', (_e, codigo) => { idioma = ['pt', 'en', 'es'].includes(codigo) ? codigo : 'pt'; montarBandeja(); });

// ---------------------------------------------------------------- arquivos: prints (Imagens) e vídeos (Vídeos)
const pastaDe = (qual) => (TESTE
  ? path.join(os.tmpdir(), 'espectro-captura-teste', qual === 'imagens' ? 'imagens' : 'videos') // testes não sujam as pastas da pessoa
  : path.join(app.getPath(qual === 'imagens' ? 'pictures' : 'videos'), 'Espectro Captura'));
// nome vem da tela: só letras, números, espaço, hífen e ponto, sem pasta no meio
const nomeSeguro = (nome, ext) => { const n = path.basename(String(nome || '')).replace(/[^\w .-]/g, '').slice(0, 80); return n.toLowerCase().endsWith('.' + ext) ? n : `arquivo.${ext}`; };
ipcMain.handle('arquivo:salvar', async (_e, p) => {
  try {
    const pasta = pastaDe(p && p.pasta);
    fs.mkdirSync(pasta, { recursive: true });
    const destino = path.join(pasta, nomeSeguro(p.nome, p.pasta === 'imagens' ? 'png' : 'mp4'));
    await fs.promises.writeFile(destino, Buffer.from(p.dados));
    return { ok: true, caminho: destino };
  } catch (e) { return { ok: false, erro: e.message }; }
});
ipcMain.handle('arquivo:abrir-pasta', (_e, qual) => { const p = pastaDe(qual); fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); });
// gravação de vídeo: o MP4 vai sendo escrito no disco aos pedaços (posição e bytes), sem guardar tudo na memória
const gravacoes = new Map();
let proximaGravacao = 1;
ipcMain.handle('gravacao:abrir', (_e, nome) => {
  try {
    const pasta = pastaDe('videos'); fs.mkdirSync(pasta, { recursive: true });
    const caminho = path.join(pasta, nomeSeguro(nome, 'mp4'));
    const id = proximaGravacao++;
    gravacoes.set(id, { fd: fs.openSync(caminho, 'w'), caminho });
    return { ok: true, id };
  } catch (e) { return { ok: false, erro: e.message }; }
});
ipcMain.handle('gravacao:escrever', (_e, id, posicao, dados) => {
  const g = gravacoes.get(id); if (!g) return false;
  const b = Buffer.from(dados);
  fs.writeSync(g.fd, b, 0, b.length, posicao);
  return true;
});
ipcMain.handle('gravacao:fechar', (_e, id, manter) => {
  const g = gravacoes.get(id); if (!g) return false;
  gravacoes.delete(id);
  try { fs.closeSync(g.fd); } catch { /* já fechado */ }
  if (!manter) { try { fs.unlinkSync(g.caminho); } catch { /* nada */ } }
  return true;
});

// ---------------------------------------------------------------- ícone perto do relógio
let bandeja = null;
function mostrarJanela() { if (janelaPrincipal && !janelaPrincipal.isDestroyed()) { if (janelaPrincipal.isMinimized()) janelaPrincipal.restore(); janelaPrincipal.show(); janelaPrincipal.focus(); } }
function montarBandeja() {
  if (TESTE || !app.isReady()) return;
  if (!bandeja) {
    bandeja = new Tray(nativeImage.createFromPath(path.join(__dirname, 'app', 'icone.png')).resize({ width: 16, height: 16 }));
    bandeja.setToolTip('Espectro Captura');
    bandeja.on('click', mostrarJanela);
  }
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: tx('mostrar'), click: mostrarJanela },
    { type: 'separator' },
    { label: tx('mudo'), click: () => enviarParaTela('atalho', 'mudo') },
    { label: tx('print'), click: () => enviarParaTela('atalho', 'print') },
    { label: tx('replay'), click: () => enviarParaTela('atalho', 'replay') },
    { label: tx('gravar'), click: () => enviarParaTela('atalho', 'gravar') },
    { type: 'separator' },
    { label: tx('sair'), click: () => app.quit() },
  ]));
}

// Áudio e vídeo começam sem precisar de clique (é o próprio app, não um site)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// fechar com gravação em andamento: a tela termina o arquivo antes (senão o MP4 fica sem o índice e não abre)
let fecharDeVez = false;
ipcMain.handle('pode-fechar', () => { fecharDeVez = true; if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.close(); });

function criarJanela() {
  const janela = new BrowserWindow({
    show: !TESTE,
    width: 1280,
    height: 760,
    minWidth: 480,
    minHeight: 300,
    backgroundColor: '#000000',
    title: 'Espectro Captura',
    icon: path.join(__dirname, 'app', 'icone.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // não diminui o ritmo quando a janela perde o foco
    },
  });
  Menu.setApplicationMenu(null);
  janelaPrincipal = janela;
  janela.loadFile(path.join(__dirname, 'app', 'index.html'));
  // ao abrir, só PROCURA se tem versão nova (não baixa nada sem o clique da pessoa)
  if (!TESTE) janela.webContents.once('did-finish-load', () => setTimeout(procurar, 4000));
  janela.on('close', (e) => {
    if (fecharDeVez || TESTE || gravacoes.size === 0) return;
    e.preventDefault();
    enviarParaTela('fechar-pedido');
    setTimeout(() => { fecharDeVez = true; if (!janela.isDestroyed()) janela.close(); }, 8000); // não trava se a tela não responder
  });
  // F11 alterna tela cheia pelo processo principal (funciona mesmo com foco no vídeo); Esc sai da tela cheia
  janela.webContents.on('before-input-event', (_e, entrada) => {
    if (entrada.type !== 'keyDown') return;
    if (entrada.key === 'F11') janela.setFullScreen(!janela.isFullScreen());
    if (entrada.key === 'Escape' && janela.isFullScreen()) janela.setFullScreen(false);
  });
  if (TESTE) {
    setTimeout(async () => {
      // ESPECTRO_CAPTURA_TESTE_ROTEIRO=<arquivo.js>: corpo de uma função assíncrona rodada na tela; o retorno vai para o log
      const roteiro = process.env.ESPECTRO_CAPTURA_TESTE_ROTEIRO;
      if (roteiro) {
        try { console.log('roteiro: ' + await janela.webContents.executeJavaScript(`(async () => { ${fs.readFileSync(roteiro, 'utf8')} })()`)); }
        catch (e) { console.log('roteiro falhou: ' + e.message); }
      }
      const img = await janela.webContents.capturePage();
      fs.writeFileSync(TESTE, img.toPNG());
      const estado = await janela.webContents.executeJavaScript("({ info: document.getElementById('info').textContent, aviso: document.getElementById('mensagem').hidden ? '' : document.getElementById('mensagem-texto').textContent, largura: document.getElementById('video').videoWidth })");
      console.log(JSON.stringify(estado));
      app.quit();
    }, 6000);
  }
  // A tela do programa caiu (falta de memória, falha do vídeo...): recarrega e pergunta se pode avisar
  janela.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason === 'clean-exit') return;
    const detalhes = `A tela do programa parou: ${d.reason} (código ${d.exitCode}).`;
    if (!janela.isDestroyed()) janela.reload();
    if (!TESTE) perguntarTravamento(janela, detalhes);
  });
  // Nenhum link abre outra janela nem navega para fora do app
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  // Câmera e microfone (a placa de captura) e tela cheia só para a página do próprio app
  const ehLocal = (url) => String(url || '').startsWith('file://');
  const liberadas = new Set(['media', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, permissao, ok) => ok(liberadas.has(permissao) && ehLocal(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, permissao) => liberadas.has(permissao) && ehLocal(wc ? wc.getURL() : ''));
  criarJanela();
  montarBandeja();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
  // O programa fechou de repente da última vez (arquivo .dmp novo) ou um aviso ficou sem enviar: pergunta agora
  if (!TESTE) {
    setTimeout(async () => {
      let pendente = null;
      try { pendente = JSON.parse(fs.readFileSync(arquivoPendente(), 'utf8')); fs.unlinkSync(arquivoPendente()); } catch { /* nada pendente */ }
      const dumps = dumpsNovos();
      const partes = [pendente && pendente.detalhes, dumps.length ? `O programa fechou de repente (${dumps.length} registro(s) de travamento: ${dumps.slice(0, 3).join(', ')}).` : ''].filter(Boolean);
      if (partes.length) await perguntarTravamento(janelaPrincipal, partes.join('\n'));
    }, 2500);
  }
});

// Componente de vídeo ou de som do Chromium caiu (a janela continua aberta): também oferece avisar
app.on('child-process-gone', (_e, d) => {
  if (TESTE || d.reason === 'clean-exit' || d.reason === 'killed') return;
  perguntarTravamento(janelaPrincipal, `Um componente do programa parou: ${d.type} ${d.name || ''} ${d.reason} (código ${d.exitCode}).`);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
