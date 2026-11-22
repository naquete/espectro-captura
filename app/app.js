// Espectro Captura: imagem da placa no <video> (mudo) e o som passando por um ganho próprio (Web Audio),
// com volume de 0 a 200%, mudo, escolha de saída e as escolhas guardadas para a próxima vez.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), barra = $('barra'), osd = $('osd');
  var faixa = $('volume'), numero = $('volume-num');
  var PLACA = /elgato|hd60|game capture|4k60|4k x|cam link|capture/i;
  var QUALIDADES = { '1080p60': [1920, 1080, 60], '1080p30': [1920, 1080, 30], '720p60': [1280, 720, 60], '2160p30': [3840, 2160, 30] };

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
    clearTimeout(mostrarOsd.t); mostrarOsd.t = setTimeout(function () { osd.hidden = true; }, 1100);
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
  function escolher(lista, salvo) {
    return lista.find(function (d) { return d.deviceId === salvo; })
      || lista.find(function (d) { return PLACA.test(d.label); })
      || lista[0] || null;
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
      var cam = escolher(d.video, pref.video), mic = escolher(d.audio, pref.audio);
      if (!cam) { mensagem('Não achei nenhuma placa de captura. Confira o cabo USB da Elgato e se ela está ligada.', true); return; }
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
      $('info').textContent = (cam.label || 'Placa') + ' · ' + trilha.width + 'x' + trilha.height + (trilha.frameRate ? ' · ' + Math.round(trilha.frameRate) + ' fps' : '') + (mic ? '' : ' · sem som');
      preencher($('sel-video'), d.video, cam.deviceId, 'Nenhuma placa encontrada');
      preencher($('sel-audio'), d.audio, mic && mic.deviceId, 'Nenhuma entrada de som');
      preencher($('sel-saida'), [{ deviceId: '', label: 'Padrão do Windows' }].concat(d.saida.filter(function (x) { return x.deviceId !== 'default' && x.deviceId !== 'communications'; })), pref.saida, 'Padrão do Windows');
      $('sel-qualidade').value = pref.qualidade; $('sel-encaixe').value = pref.encaixe;
      mensagem('');
    } catch (e) {
      var msg = e && e.name === 'NotReadableError'
        ? 'A placa está sendo usada por outro programa (o app da Elgato ou o OBS?). Feche o outro e tente de novo.'
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
