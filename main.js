// Espectro Captura: janela que mostra e toca a placa de captura com controle de volume.
// Só abre a página local do app; nada é carregado da internet.
const { app, BrowserWindow, session, Menu, ipcMain, dialog, crashReporter, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');

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
    type: 'warning', title: 'Espectro Captura', noLink: true,
    message: 'O Espectro Captura teve um problema e precisou recomeçar.',
    detail: 'Quer mandar um aviso para a Espectro Soluções? Vão só a versão do programa, a versão do Windows e o motivo técnico. Nenhuma imagem nem som vão junto.',
    buttons: ['Enviar aviso', 'Não enviar'], defaultId: 0, cancelId: 1,
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
// sempre por cima e abrir em tela cheia (preferências guardadas na própria tela do programa)
ipcMain.handle('janela', (e, o) => {
  const j = BrowserWindow.fromWebContents(e.sender);
  if (!j || !o) return;
  j.setAlwaysOnTop(Boolean(o.topo), 'floating');
  if (o.telaCheia === true && !TESTE) j.setFullScreen(true);
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
      // ESPECTRO_CAPTURA_TESTE_RELATO=1: abre o formulário de relato (para o print) e envia um relato de teste de verdade
      if (process.env.ESPECTRO_CAPTURA_TESTE_RELATO) {
        await janela.webContents.executeJavaScript("document.getElementById('abrir-relato').click(); document.getElementById('relato-mensagem').value = 'Teste automático do envio de relatos pelo programa (pode apagar).'; document.getElementById('relato-tipo').value = 'outro'; document.getElementById('relato-enviar').click()");
        await new Promise((ok) => setTimeout(ok, 4000));
        console.log('relato: ' + await janela.webContents.executeJavaScript("document.getElementById('relato-estado').textContent"));
      }
      // ESPECTRO_CAPTURA_TESTE_IMAGEM=hdr-lavado: abre os Ajustes, aplica o estilo e mostra o filtro da imagem
      const ti = process.env.ESPECTRO_CAPTURA_TESTE_IMAGEM;
      if (ti) {
        await janela.webContents.executeJavaScript(`(() => { document.getElementById('painel').hidden = false; const s = document.getElementById('img-estilo'); s.value = ${JSON.stringify(ti)}; s.dispatchEvent(new Event('change')); document.getElementById('img-hdr').scrollIntoView(); })()`);
        await new Promise((ok) => setTimeout(ok, 800));
        console.log('imagem: ' + await janela.webContents.executeJavaScript("JSON.stringify({ filtro: document.getElementById('video').style.filter, brilho: document.getElementById('out-brilho').textContent, hdr: document.getElementById('img-hdr').checked })"));
      }
      const img = await janela.webContents.capturePage();
      require('node:fs').writeFileSync(TESTE, img.toPNG());
      const estado = await janela.webContents.executeJavaScript("({ info: document.getElementById('info').textContent, aviso: document.getElementById('mensagem').hidden ? '' : document.getElementById('mensagem-texto').textContent, largura: document.getElementById('video').videoWidth })");
      console.log(JSON.stringify(estado));
      app.quit();
    }, 7000);
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

app.on('window-all-closed', () => app.quit());
