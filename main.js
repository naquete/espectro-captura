// Espectro Captura: janela que mostra e toca a placa de captura com controle de volume.
// Só abre a página local do app; nada é carregado da internet.
const { app, BrowserWindow, session, Menu } = require('electron');
const path = require('node:path');

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
  janela.loadFile(path.join(__dirname, 'app', 'index.html'));
  if (TESTE) {
    setTimeout(async () => {
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
  session.defaultSession.setPermissionRequestHandler((wc, permissao, ok) => ok(permissao === 'media' && ehLocal(wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, permissao) => permissao === 'media' && ehLocal(wc ? wc.getURL() : ''));
  criarJanela();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on('window-all-closed', () => app.quit());
