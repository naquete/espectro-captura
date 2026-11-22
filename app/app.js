// Espectro Captura: imagem da placa no <video> (mudo) e o som passando por um ganho próprio (Web Audio),
// com volume de 0 a 200%, mudo, escolha de saída e as escolhas guardadas para a próxima vez.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), barra = $('barra'), osd = $('osd');
  var faixa = $('volume'), numero = $('volume-num');
  // Placas de captura conhecidas (qualquer marca) e o que costuma ser webcam, para não abrir a câmera por engano
  var PLACA = /capture|captura|elgato|hd60|cam link|avermedia|live gamer|gc5|razer ripsaw|ripsaw|magewell|blackmagic|decklink|intensity|hauppauge|hd pvr|ugreen|genki|shadowcast|evga|xr1|mirabox|j5create|startech|epiphan|yuan|nzxt signal|signal hd|hdmi|usb video|usb3\.?0? video|ms2109|ms2130|uvc capture|video capture/i;
  var WEBCAM = /webcam|integrated|integrada|facetime|hd camera|hd webcam|front|frontal|rear|traseira|c9[0-9]{2}|brio|kiyo|ir camera|virtual|obs virtual|droidcam|iriun|snap camera/i;
  function pontos(label) { var l = String(label || ''); return (PLACA.test(l) ? 2 : 0) - (WEBCAM.test(l) ? 3 : 0); }
  // palavras do nome da imagem que aparecem no nome do som (ex.: "USB3.0 Capture" e "Digital Audio (USB3.0 Capture)")
  function parecido(a, b) {
    var pa = String(a || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (p) { return p.length > 2 && !/^(usb|video|audio|digital|interface|device|the|and)$/.test(p); });
    var lb = String(b || '').toLowerCase();
    return pa.filter(function (p) { return lb.indexOf(p) >= 0; }).length;
  }
  // Qualidades possíveis; a lista mostrada é filtrada pelo que a placa conectada diz que aceita
  var QUALIDADES = {
    '2160p60': [3840, 2160, 60, '4K a 60 fps'], '2160p30': [3840, 2160, 30, '4K a 30 fps'],
    '1440p120': [2560, 1440, 120, '1440p a 120 fps'], '1440p60': [2560, 1440, 60, '1440p a 60 fps'], '1440p30': [2560, 1440, 30, '1440p a 30 fps'],
    '1080p240': [1920, 1080, 240, '1080p a 240 fps'], '1080p120': [1920, 1080, 120, '1080p a 120 fps'], '1080p60': [1920, 1080, 60, '1080p a 60 fps'], '1080p30': [1920, 1080, 30, '1080p a 30 fps'],
    '720p60': [1280, 720, 60, '720p a 60 fps'],
  };
  function preencherQualidades(trilha) {
    var cap = trilha && trilha.getCapabilities ? trilha.getCapabilities() : {};
    var maxL = cap.width && cap.width.max || 3840, maxA = cap.height && cap.height.max || 2160, maxF = cap.frameRate && cap.frameRate.max || 60;
    var sel = $('sel-qualidade'); sel.textContent = '';
    Object.keys(QUALIDADES).forEach(function (k) {
      var q = QUALIDADES[k];
      if (q[0] > maxL || q[1] > maxA || q[2] > Math.round(maxF)) return;
      var o = document.createElement('option'); o.value = k; o.textContent = q[3]; sel.appendChild(o);
    });
    if (!sel.querySelector('option[value="' + pref.qualidade + '"]')) {
      var o = document.createElement('option'); o.value = pref.qualidade; o.textContent = (QUALIDADES[pref.qualidade] || [0, 0, 0, pref.qualidade])[3]; sel.appendChild(o);
    }
    sel.value = pref.qualidade;
  }

  // ---------------------------------------------------------------- preferências
  var pref = { video: '', audio: '', saida: '', qualidade: '1080p60', encaixe: 'contain', volume: 100, mudo: false };
  try { Object.assign(pref, JSON.parse(localStorage.getItem('captura') || '{}')); } catch (e) { /* começa do padrão */ }
  function guardar() { try { localStorage.setItem('captura', JSON.stringify(pref)); } catch (e) { /* sem armazenamento */ } }

  // ---------------------------------------------------------------- som
  var ctx = null, ganho = null, fonte = null;
  function aplicarVolume() {
    var v = pref.mudo ? 0 : pref.volume / 100;
    if (ganho) ganho.gain.setTargetAtTime(v, ctx.currentTime, 0.015); // sem estalo
    faixa.value = String(pref.volume);
    numero.textContent = pref.volume + '%';
    document.body.classList.toggle('mudo', pref.mudo || pref.volume === 0);
  }
  function mostrarOsd(texto) {
    osd.textContent = texto; osd.hidden = false;
    clearTimeout(mostrarOsd.t); mostrarOsd.t = setTimeout(function () { osd.hidden = true; }, texto.length > 20 ? 3500 : 1100);
  }
  function mudarVolume(v, avisar) {
    pref.volume = Math.max(0, Math.min(200, Math.round(v)));
    if (pref.volume > 0) pref.mudo = false;
    aplicarVolume(); guardar();
    if (avisar) mostrarOsd('Volume ' + pref.volume + '%');
  }
  function alternarMudo() {
    pref.mudo = !pref.mudo; aplicarVolume(); guardar();
    mostrarOsd(pref.mudo ? 'Mudo' : 'Volume ' + pref.volume + '%');
  }

  // ---------------------------------------------------------------- placa
  var streamVideo = null, streamAudio = null;
  function parar() {
    [streamVideo, streamAudio].forEach(function (s) { if (s) s.getTracks().forEach(function (t) { t.stop(); }); });
    streamVideo = streamAudio = null;
    if (fonte) { try { fonte.disconnect(); } catch (e) { /* já solto */ } fonte = null; }
  }
  function mensagem(texto, comBotao) {
    $('mensagem').hidden = !texto; $('mensagem-texto').textContent = texto || '';
    $('mensagem-acao').hidden = !comBotao;
  }
  async function listar() {
    var todos = await navigator.mediaDevices.enumerateDevices();
    return {
      video: todos.filter(function (d) { return d.kind === 'videoinput'; }),
      audio: todos.filter(function (d) { return d.kind === 'audioinput'; }),
      saida: todos.filter(function (d) { return d.kind === 'audiooutput'; }),
    };
  }
  // imagem: a salva; senão a de melhor nota (placa conhecida e não webcam); senão a primeira
  function escolherVideo(lista, salvo) {
    var s = lista.find(function (d) { return d.deviceId === salvo; });
    if (s) return s;
    return lista.slice().sort(function (a, b) { return pontos(b.label) - pontos(a.label); })[0] || null;
  }
  // som: o salvo; senão o de nome parecido com a imagem escolhida; senão um com nome de placa; senão nenhum
  // (melhor sem som do que pegar o microfone da pessoa)
  function escolherAudio(lista, salvo, cam) {
    var s = lista.find(function (d) { return d.deviceId === salvo; });
    if (s) return s;
    var melhor = lista.map(function (d) { return { d: d, n: parecido(cam && cam.label, d.label) * 3 + pontos(d.label) }; })
      .filter(function (x) { return x.d.deviceId !== 'default' && x.d.deviceId !== 'communications'; })
      .sort(function (a, b) { return b.n - a.n; })[0];
    return melhor && melhor.n > 0 ? melhor.d : null;
  }
  function preencher(sel, lista, atual, vazio) {
    sel.textContent = '';
    if (!lista.length) { var o = document.createElement('option'); o.textContent = vazio; sel.appendChild(o); return; }
    lista.forEach(function (d, i) {
      var o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || ('Dispositivo ' + (i + 1));
      if (atual && d.deviceId === atual) o.selected = true; sel.appendChild(o);
    });
  }

  async function abrir() {
    parar();
    mensagem('Abrindo a placa de captura...');
    try {
      // a primeira chamada libera os nomes dos dispositivos
      if (!(await listar()).video.some(function (d) { return d.label; })) {
        var t = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        t.getTracks().forEach(function (x) { x.stop(); });
      }
      var d = await listar();
      var primeiraVez = !pref.video;
      var cam = escolherVideo(d.video, pref.video), mic = escolherAudio(d.audio, pref.audio, cam);
      if (!cam) { mensagem('Não achei nenhuma placa de captura. Confira o cabo USB da placa e se ela está ligada.', true); return; }
      var q = QUALIDADES[pref.qualidade] || QUALIDADES['1080p60'];
      streamVideo = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId }, width: { ideal: q[0] }, height: { ideal: q[1] }, frameRate: { ideal: q[2] } },
      });
      video.srcObject = streamVideo;
      video.className = pref.encaixe === 'cover' ? 'cover' : '';
      if (mic) {
        // sem cancelamento de eco, redução de ruído nem ganho automático: o som do jogo como ele é
        streamAudio = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: mic.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000, latency: 0 },
        });
        if (!ctx) { ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 }); ganho = ctx.createGain(); ganho.connect(ctx.destination); }
        fonte = ctx.createMediaStreamSource(streamAudio); fonte.connect(ganho);
        if (ctx.state === 'suspended') await ctx.resume();
        await aplicarSaida();
      }
      pref.video = cam.deviceId; pref.audio = mic ? mic.deviceId : ''; guardar();
      aplicarVolume();
      var trilha = streamVideo.getVideoTracks()[0].getSettings();
      // a placa informa o máximo de resolução e de fps separados; se a combinação pedida não existir, ela entrega a
      // mais próxima, e o app avisa o que chegou de verdade
      if (trilha.height && (trilha.height < q[1] || (trilha.frameRate && Math.round(trilha.frameRate) < q[2] - 1))) {
        setTimeout(function () { mostrarOsd('A placa entregou ' + trilha.height + 'p a ' + Math.round(trilha.frameRate || 0) + ' fps'); }, 300);
      }
      $('info').textContent = (cam.label || 'Placa') + ' · ' + trilha.width + 'x' + trilha.height + (trilha.frameRate ? ' · ' + Math.round(trilha.frameRate) + ' fps' : '') + (mic ? '' : ' · sem som');
      preencher($('sel-video'), d.video, cam.deviceId, 'Nenhuma placa encontrada');
      preencher($('sel-audio'), d.audio, mic && mic.deviceId, 'Nenhuma entrada de som');
      preencher($('sel-saida'), [{ deviceId: '', label: 'Padrão do Windows' }].concat(d.saida.filter(function (x) { return x.deviceId !== 'default' && x.deviceId !== 'communications'; })), pref.saida, 'Padrão do Windows');
      preencherQualidades(streamVideo.getVideoTracks()[0]); $('sel-encaixe').value = pref.encaixe;
      mensagem('');
      // primeira vez com mais de uma câmera, ou sem achar o som da placa: abre os Ajustes para a pessoa conferir
      if ((primeiraVez && d.video.length > 1) || !mic) {
        $('painel').hidden = false;
        mostrarOsd(!mic ? 'Escolha o som da sua placa em Ajustes' : 'Confira se esta é a sua placa');
      }
    } catch (e) {
      var msg = e && e.name === 'NotReadableError'
        ? 'A placa está sendo usada por outro programa (o app da própria placa ou o OBS?). Feche o outro e tente de novo.'
        : 'Não consegui abrir a placa: ' + (e && e.message ? e.message : e);
      mensagem(msg, true);
    }
  }
  async function aplicarSaida() {
    if (ctx && typeof ctx.setSinkId === 'function') { try { await ctx.setSinkId(pref.saida || ''); } catch (e) { /* fica na saída padrão */ } }
  }

  // ---------------------------------------------------------------- controles
  faixa.addEventListener('input', function () { mudarVolume(Number(faixa.value), false); });
  $('mudo').addEventListener('click', alternarMudo);
  $('tela-cheia').addEventListener('click', alternarTelaCheia);
  $('ajustes').addEventListener('click', function () { $('painel').hidden = !$('painel').hidden; });
  $('fechar-painel').addEventListener('click', function () { $('painel').hidden = true; });
  $('mensagem-acao').addEventListener('click', abrir);
  $('sel-video').addEventListener('change', function (e) { pref.video = e.target.value; guardar(); abrir(); });
  $('sel-audio').addEventListener('change', function (e) { pref.audio = e.target.value; guardar(); abrir(); });
  $('sel-saida').addEventListener('change', function (e) { pref.saida = e.target.value; guardar(); aplicarSaida(); });
  $('sel-qualidade').addEventListener('change', function (e) { pref.qualidade = e.target.value; guardar(); abrir(); });
  $('sel-encaixe').addEventListener('change', function (e) { pref.encaixe = e.target.value; guardar(); video.className = pref.encaixe === 'cover' ? 'cover' : ''; });
  video.addEventListener('dblclick', alternarTelaCheia);
  function alternarTelaCheia() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {}); }

  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'SELECT') return;
    if (e.key === 'm' || e.key === 'M') alternarMudo();
    else if (e.key === 'ArrowUp') { mudarVolume(pref.volume + 5, true); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { mudarVolume(pref.volume - 5, true); e.preventDefault(); }
    else if (e.key === 'f' || e.key === 'F') alternarTelaCheia();
    else if (e.key === 'Escape') $('painel').hidden = true;
  });
  window.addEventListener('wheel', function (e) {
    if (!$('painel').hidden) return;
    mudarVolume(pref.volume + (e.deltaY < 0 ? 5 : -5), true);
  }, { passive: true });

  // barra e cursor somem depois de 2,5 s parado (menos com o mouse em cima da barra ou com os ajustes abertos)
  var ocioso;
  function acordar() {
    document.body.classList.remove('ocioso');
    clearTimeout(ocioso);
    ocioso = setTimeout(function () { if (!barra.matches(':hover') && $('painel').hidden) document.body.classList.add('ocioso'); }, 2500);
  }
  ['mousemove', 'mousedown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, acordar); });
  acordar();

  // placa ligada ou desligada com o app aberto: tenta de novo sozinho
  navigator.mediaDevices.addEventListener('devicechange', function () {
    clearTimeout(abrir.t); abrir.t = setTimeout(function () { if (!streamVideo || streamVideo.getVideoTracks()[0].readyState === 'ended') abrir(); }, 800);
  });

  aplicarVolume();
  abrir();
})();
