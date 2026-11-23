// Espectro Captura: janela que mostra e toca a placa de captura com controle de volume.
// Só abre a página local do app; nada é carregado da internet.
const { app, BrowserWindow, session, Menu, ipcMain } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

// Atualização SÓ quando a pessoa clica: o app procura (sem baixar) e mostra o botão; baixa e instala por clique.
// Os arquivos ficam em https://espectrosolucoes.com.br/atualizacoes/espectro-captura/ (latest.yml + instalador).
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
let janelaPrincipal = null;
function avisarAtualizacao(estado) { if (janelaPrincipal && !janelaPrincipal.isDestroyed()) janelaPrincipal.webContents.send('atualizacao', estado); }
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
ipcMain.handle('atualizacao:instalar', () => autoUpdater.quitAndInstall(false, true));
ipcMain.handle('tela-cheia', (e) => {
  const j = BrowserWindow.fromWebContents(e.sender);
  if (j) j.setFullScreen(!j.isFullScreen());
});

// Áudio e vídeo começam sem precisar de clique (é o próprio app, não um site)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Teste sem janela (ESPECTRO_CAPTURA_TESTE=<arquivo.png>): abre escondido, tira um print e fecha.
const TESTE = process.env.ESPECTRO_CAPTURA_TESTE || '';

function criarJanela() {
  const janela = new BrowserWindow({
    show: !TESTE,
    width: 1280,
    height: 760,
    minWidth: 480,
    minHeight: 300,
    backgroundColor: '#000000',
    title: 'Espectro Captura',
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
  // Esc sai da tela cheia
  janela.webContents.on('before-input-event', (_e, entrada) => {
    if (entrada.type === 'keyDown' && entrada.key === 'Escape' && janela.isFullScreen()) janela.setFullScreen(false);
  });
  if (TESTE) {
    setTimeout(async () => {
      // ESPECTRO_CAPTURA_TESTE_QUALIDADE=2160p30: troca a qualidade pelos Ajustes e espera reabrir
      const q = process.env.ESPECTRO_CAPTURA_TESTE_QUALIDADE;
      if (q) {
        const opcoes = await janela.webContents.executeJavaScript("[...document.querySelectorAll('#sel-qualidade option')].map(o => o.value).join(',')");
        console.log('opcoes: ' + opcoes);
        await janela.webContents.executeJavaScript(`(() => { const s = document.getElementById('sel-qualidade'); s.value = ${JSON.stringify(q)}; s.dispatchEvent(new Event('change')); })()`);
        await new Promise((ok) => setTimeout(ok, 5000));
      }
      if (process.env.ESPECTRO_CAPTURA_TESTE_TELACHEIA) {
        await janela.webContents.executeJavaScript("document.getElementById('tela-cheia').click()");
        await new Promise((ok) => setTimeout(ok, 1500));
        console.log('tela cheia depois do clique: ' + janela.isFullScreen());
        await janela.webContents.executeJavaScript("document.getElementById('tela-cheia').click()");
        await new Promise((ok) => setTimeout(ok, 1500));
        console.log('tela cheia depois do segundo clique: ' + janela.isFullScreen());
        console.log('versao na tela: ' + await janela.webContents.executeJavaScript("document.getElementById('versao').textContent"));
      }
      // ESPECTRO_CAPTURA_TESTE_ATUALIZACAO=1 (ou =<url de um servidor de teste>): procura atualização e mostra o estado
      const ta = process.env.ESPECTRO_CAPTURA_TESTE_ATUALIZACAO;
      if (ta) {
        if (/^https?:/.test(ta)) autoUpdater.setFeedURL({ provider: 'generic', url: ta });
        await procurar();
        await new Promise((ok) => setTimeout(ok, 2500));
        const est = await janela.webContents.executeJavaScript("({ estado: document.getElementById('estado-atualizacao').textContent, botao: document.getElementById('atualizar').hidden ? '(sem botão)' : document.getElementById('atualizar').textContent })");
        console.log('atualizacao: ' + JSON.stringify(est));
      }
      const img = await janela.webContents.capturePage();
      require('node:fs').writeFileSync(TESTE, img.toPNG());
      const estado = await janela.webContents.executeJavaScript("({ info: document.getElementById('info').textContent, aviso: document.getElementById('mensagem').hidden ? '' : document.getElementById('mensagem-texto').textContent, largura: document.getElementById('video').videoWidth })");
      console.log(JSON.stringify(estado));
      app.quit();
    }, 7000);
  }
  // Nenhum link abre outra janela nem navega para fora do app
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (e) => e.preventDefault());
  // F11 alterna tela cheia também pelo processo principal (funciona mesmo com foco no vídeo)
  janela.webContents.on('before-input-event', (_e, entrada) => {
    if (entrada.type === 'keyDown' && entrada.key === 'F11') janela.setFullScreen(!janela.isFullScreen());
  });
}

app.whenReady().then(() => {
  // Câmera e microfone (a placa de captura) só para a página do próprio app
  const ehLocal = (url) => String(url || '').startsWith('file://');
  // (a tela cheia também precisa estar liberada aqui; antes ela era recusada e o botão não fazia nada)
  const liberadas = new Set(['media', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((wc, permissao, ok) => ok(liberadas.has(permissao) && ehLocal(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, permissao) => liberadas.has(permissao) && ehLocal(wc ? wc.getURL() : ''));
  criarJanela();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on('window-all-closed', () => app.quit());
