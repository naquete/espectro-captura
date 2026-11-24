// Espectro Captura: imagem da placa no <video> (mudo) e o som por um caminho próprio (Web Audio): atraso, equalizador,
// modo noturno, balanço, mono e volume de 0 a 200%. Ajustes de imagem por filtro na tela (a placa manda sempre igual).
// Gravação (print, replay e vídeo) fica em gravacao.js, que usa window.EC daqui.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var I = window.ECIdioma, t = I.t;
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
  // Qualidades: a lista inteira aparece sempre (pedido do João, 22/11/2026: quem tem a placa sabe o que ela aguenta);
  // se a placa não fizer a combinação escolhida, ela entrega a mais próxima e o app avisa o que chegou
  var QUALIDADES = {
    '2160p60': [3840, 2160, 60, '4K 60 fps'], '2160p30': [3840, 2160, 30, '4K 30 fps'],
    '1440p120': [2560, 1440, 120, '1440p 120 fps'], '1440p60': [2560, 1440, 60, '1440p 60 fps'], '1440p30': [2560, 1440, 30, '1440p 30 fps'],
    '1080p240': [1920, 1080, 240, '1080p 240 fps'], '1080p120': [1920, 1080, 120, '1080p 120 fps'], '1080p60': [1920, 1080, 60, '1080p 60 fps'], '1080p30': [1920, 1080, 30, '1080p 30 fps'],
    '720p60': [1280, 720, 60, '720p 60 fps'],
  };
  function preencherQualidades() {
    var sel = $('sel-qualidade'); sel.textContent = '';
    Object.keys(QUALIDADES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = QUALIDADES[k][3]; sel.appendChild(o); });
    sel.value = QUALIDADES[pref.qualidade] ? pref.qualidade : '1080p60';
  }

  // ---------------------------------------------------------------- preferências
  var PADRAO = {
    video: '', audio: '', saida: '', qualidade: '1080p60', encaixe: 'contain', proporcao: 'original', zoom: 100, mostrarFps: false,
    volume: 100, mudo: false, idioma: '',
    imagem: { estilo: 'normal', brilho: 100, contraste: 100, saturacao: 100, matiz: 0, hdr: false, espelhar: false, nitidez: 0, retro: false, crt: false },
    som: { atraso: 0, eq: 'normal', grave: 0, medio: 0, agudo: 0, noturno: false, balanco: 0, mono: false, estabilidade: 'equilibrado', amplitude: 100 },
    gravar: { replay: false, duracao: 30 },
    stream: { ligado: false, saida: '' },
    janela: { topo: false, telaCheia: false, windows: false, atalhosGlobais: true },
    perfis: {},
  };
  var pref = JSON.parse(JSON.stringify(PADRAO));
  try {
    var salvo = JSON.parse(localStorage.getItem('captura') || '{}');
    Object.keys(salvo).forEach(function (k) {
      pref[k] = PADRAO[k] && typeof PADRAO[k] === 'object' && !Array.isArray(PADRAO[k]) ? Object.assign({}, PADRAO[k], salvo[k] || {}) : salvo[k];
    });
  } catch (e) { /* começa do padrão */ }
  function guardar() { try { localStorage.setItem('captura', JSON.stringify(pref)); } catch (e) { /* sem armazenamento */ } }

  pref.idioma = I.definir(pref.idioma || I.inicial());
  if (window.espectro && window.espectro.idioma) window.espectro.idioma(pref.idioma);

  function mostrarOsd(texto) {
    osd.textContent = texto; osd.hidden = false;
    clearTimeout(mostrarOsd.t); mostrarOsd.t = setTimeout(function () { osd.hidden = true; }, texto.length > 24 ? 3500 : 1300);
  }

  // ---------------------------------------------------------------- som: placa -> atraso -> grave/médio/agudo -> noturno -> balanço -> mono -> volume
  var ctx = null, fonte = null, no = null;
  // estabilidade do som: buffer maior = um pouco mais de atraso, mas sem estalos quando o PC está ocupado
  var LATENCIAS = { minimo: 'interactive', equilibrado: 0.03, estavel: 0.08 };
  function montarCaminhoDoSom() {
    ctx = new AudioContext({ latencyHint: LATENCIAS[pref.som.estabilidade] || LATENCIAS.equilibrado, sampleRate: 48000 });
    no = {
      atraso: ctx.createDelay(1),
      grave: ctx.createBiquadFilter(), medio: ctx.createBiquadFilter(), agudo: ctx.createBiquadFilter(),
      noturno: ctx.createDynamicsCompressor(), reforco: ctx.createGain(),
      balanco: ctx.createStereoPanner(), mono: ctx.createGain(), volume: ctx.createGain(),
      // ampliar estéreo (meio e lados): E' = a*E + b*D e D' = b*E + a*D, com a = (1+k)/2 e b = (1-k)/2
      divide: ctx.createChannelSplitter(2), junta: ctx.createChannelMerger(2),
      ee: ctx.createGain(), ed: ctx.createGain(), de: ctx.createGain(), dd: ctx.createGain(),
    };
    no.grave.type = 'lowshelf'; no.grave.frequency.value = 200;
    no.medio.type = 'peaking'; no.medio.frequency.value = 1500; no.medio.Q.value = 0.9;
    no.agudo.type = 'highshelf'; no.agudo.frequency.value = 4500;
    no.atraso.connect(no.grave); no.grave.connect(no.medio); no.medio.connect(no.agudo); no.agudo.connect(no.noturno);
    no.noturno.connect(no.reforco); no.reforco.connect(no.balanco);
    no.balanco.connect(no.divide);
    no.divide.connect(no.ee, 0); no.divide.connect(no.de, 0); no.divide.connect(no.ed, 1); no.divide.connect(no.dd, 1);
    no.ee.connect(no.junta, 0, 0); no.ed.connect(no.junta, 0, 0); no.de.connect(no.junta, 0, 1); no.dd.connect(no.junta, 0, 1);
    no.junta.connect(no.mono); no.mono.connect(no.volume);
    no.volume.connect(ctx.destination);
  }
  var EQ = { normal: [0, 0, 0], passos: [-4, 2, 7], grave: [7, 0, -1], voz: [-3, 5, 2] };
  function aplicarSom() {
    var s = pref.som;
    $('som-atraso').value = String(s.atraso); $('out-atraso').textContent = s.atraso + ' ms';
    ['grave', 'medio', 'agudo'].forEach(function (k) { $('som-' + k).value = String(s[k]); $('out-' + k).textContent = (s[k] > 0 ? '+' : '') + s[k] + ' dB'; });
    $('som-eq').value = EQ[s.eq] ? s.eq : 'personalizado';
    $('som-noturno').checked = Boolean(s.noturno); $('som-mono').checked = Boolean(s.mono);
    $('som-estabilidade').value = LATENCIAS[s.estabilidade] ? s.estabilidade : 'equilibrado';
    $('som-amplitude').value = String(s.amplitude || 100); $('out-amplitude').textContent = (s.amplitude || 100) + '%';
    $('som-balanco').value = String(s.balanco); $('out-balanco').textContent = s.balanco === 0 ? '0' : (s.balanco < 0 ? 'E ' : 'D ') + Math.abs(s.balanco);
    if (!no) return;
    var agora = ctx.currentTime;
    no.atraso.delayTime.setTargetAtTime(s.atraso / 1000, agora, 0.02);
    no.grave.gain.setTargetAtTime(s.grave, agora, 0.02); no.medio.gain.setTargetAtTime(s.medio, agora, 0.02); no.agudo.gain.setTargetAtTime(s.agudo, agora, 0.02);
    // modo noturno: comprime os picos (explosões) e sobe o resto (falas); desligado, o compressor fica neutro
    no.noturno.threshold.value = s.noturno ? -32 : 0; no.noturno.ratio.value = s.noturno ? 8 : 1;
    no.noturno.knee.value = s.noturno ? 12 : 0; no.noturno.attack.value = 0.004; no.noturno.release.value = 0.25;
    no.reforco.gain.setTargetAtTime(s.noturno ? 2.2 : 1, agora, 0.05);
    no.balanco.pan.setTargetAtTime(s.balanco / 100, agora, 0.02);
    var k = (Number(s.amplitude) || 100) / 100, a = (1 + k) / 2, b = (1 - k) / 2;
    no.ee.gain.setTargetAtTime(a, agora, 0.02); no.dd.gain.setTargetAtTime(a, agora, 0.02);
    no.ed.gain.setTargetAtTime(b, agora, 0.02); no.de.gain.setTargetAtTime(b, agora, 0.02);
    // mono: junta os dois canais num só e o Chrome espalha de volta para os dois lados
    no.mono.channelCount = s.mono ? 1 : 2; no.mono.channelCountMode = s.mono ? 'explicit' : 'max'; no.mono.channelInterpretation = 'speakers';
    // a stream acompanha só o atraso (sincronia com a imagem)
    if (stream && stream.atraso) stream.atraso.delayTime.setTargetAtTime(s.atraso / 1000, stream.ctx.currentTime, 0.02);
  }
  function aplicarVolume() {
    var v = pref.mudo ? 0 : pref.volume / 100;
    if (no) no.volume.gain.setTargetAtTime(v, ctx.currentTime, 0.015); // sem estalo
    faixa.value = String(pref.volume);
    numero.textContent = pref.volume + '%';
    document.body.classList.toggle('mudo', pref.mudo || pref.volume === 0);
  }
  function mudarVolume(v, avisar) {
    pref.volume = Math.max(0, Math.min(200, Math.round(v)));
    if (pref.volume > 0) pref.mudo = false;
    aplicarVolume(); guardar();
    if (avisar) mostrarOsd(t('Volume {0}%', pref.volume));
  }
  function alternarMudo() {
    pref.mudo = !pref.mudo; aplicarVolume(); guardar();
    mostrarOsd(pref.mudo ? t('Mudo') : t('Volume {0}%', pref.volume));
  }
  [['som-atraso', 'atraso'], ['som-balanco', 'balanco'], ['som-amplitude', 'amplitude']].forEach(function (p) {
    $(p[0]).addEventListener('input', function (e) { pref.som[p[1]] = Number(e.target.value); aplicarSom(); guardar(); });
  });
  ['grave', 'medio', 'agudo'].forEach(function (k) {
    $('som-' + k).addEventListener('input', function (e) { pref.som[k] = Number(e.target.value); pref.som.eq = 'personalizado'; aplicarSom(); guardar(); });
  });
  $('som-eq').addEventListener('change', function (e) {
    var v = EQ[e.target.value]; if (!v) return;
    pref.som.eq = e.target.value; pref.som.grave = v[0]; pref.som.medio = v[1]; pref.som.agudo = v[2]; aplicarSom(); guardar();
  });
  $('som-noturno').addEventListener('change', function (e) { pref.som.noturno = e.target.checked; aplicarSom(); guardar(); });
  // trocar a estabilidade recria o caminho do som (o tamanho do buffer só vale ao criar)
  $('som-estabilidade').addEventListener('change', function (e) {
    pref.som.estabilidade = e.target.value; guardar();
    if (ctx) { try { ctx.close(); } catch (x) { /* já fechado */ } ctx = null; no = null; fonte = null; }
    abrir();
  });
  $('som-mono').addEventListener('change', function (e) { pref.som.mono = e.target.checked; aplicarSom(); guardar(); });
  $('som-padrao').addEventListener('click', function () { pref.som = JSON.parse(JSON.stringify(PADRAO.som)); aplicarSom(); guardar(); mostrarOsd(t('Som padrão')); });

  // ---------------------------------------------------------------- placa
  var streamVideo = null, streamAudio = null;
  function parar() {
    if (window.ECGravar) window.ECGravar.placaFechando();
    [streamVideo, streamAudio].forEach(function (s) { if (s) s.getTracks().forEach(function (x) { x.stop(); }); });
    streamVideo = streamAudio = null;
    if (fonte) { try { fonte.disconnect(); } catch (e) { /* já solto */ } fonte = null; }
    pararStream();
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
  function escolherVideo(lista, salvoId) {
    var s = lista.find(function (d) { return d.deviceId === salvoId; });
    if (s) return s;
    return lista.slice().sort(function (a, b) { return pontos(b.label) - pontos(a.label); })[0] || null;
  }
  // som: o salvo; senão o de nome parecido com a imagem escolhida; senão um com nome de placa; senão nenhum
  // (melhor sem som do que pegar o microfone da pessoa)
  function escolherAudio(lista, salvoId, cam) {
    var s = lista.find(function (d) { return d.deviceId === salvoId; });
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
      var op = document.createElement('option'); op.value = d.deviceId; op.textContent = d.label || t('Dispositivo {0}', i + 1);
      if (atual && d.deviceId === atual) op.selected = true; sel.appendChild(op);
    });
  }

  var infoPlaca = '';
  async function abrir() {
    parar();
    mensagem(t('Abrindo a placa de captura...'));
    try {
      // a primeira chamada libera os nomes dos dispositivos
      if (!(await listar()).video.some(function (d) { return d.label; })) {
        var tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tmp.getTracks().forEach(function (x) { x.stop(); });
      }
      var d = await listar();
      var primeiraVez = !pref.video;
      var cam = escolherVideo(d.video, pref.video), mic = escolherAudio(d.audio, pref.audio, cam);
      if (!cam) { mensagem(t('Não achei nenhuma placa de captura. Confira o cabo USB da placa e se ela está ligada.'), true); return; }
      var q = QUALIDADES[pref.qualidade] || QUALIDADES['1080p60'];
      streamVideo = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId }, width: { ideal: q[0] }, height: { ideal: q[1] }, frameRate: { ideal: q[2] } },
      });
      video.srcObject = streamVideo;
      if (mic) {
        // sem cancelamento de eco, redução de ruído nem ganho automático: o som do jogo como ele é
        streamAudio = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: mic.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000, latency: 0 },
        });
        if (!ctx) montarCaminhoDoSom();
        fonte = ctx.createMediaStreamSource(streamAudio); fonte.connect(no.atraso);
        if (ctx.state === 'suspended') await ctx.resume();
        await aplicarSaida();
      }
      pref.video = cam.deviceId; pref.audio = mic ? mic.deviceId : ''; guardar();
      aplicarVolume(); aplicarSom();
      var trilha = streamVideo.getVideoTracks()[0].getSettings();
      // a placa informa o máximo de resolução e de fps separados; se a combinação pedida não existir, ela entrega a
      // mais próxima, e o app avisa o que chegou de verdade
      if (trilha.height && (trilha.height < q[1] || (trilha.frameRate && Math.round(trilha.frameRate) < q[2] - 1))) {
        setTimeout(function () { mostrarOsd(t('A placa entregou {0}p a {1} fps', trilha.height, Math.round(trilha.frameRate || 0))); }, 300);
      }
      infoPlaca = (cam.label || t('Placa')) + ' · ' + trilha.width + 'x' + trilha.height + (trilha.frameRate ? ' · ' + Math.round(trilha.frameRate) + ' fps' : '') + (mic ? '' : ' · ' + t('sem som'));
      $('info').textContent = infoPlaca;
      preencher($('sel-video'), d.video, cam.deviceId, t('Nenhuma placa encontrada'));
      preencher($('sel-audio'), d.audio, mic && mic.deviceId, t('Nenhuma entrada de som'));
      var saidas = [{ deviceId: '', label: t('Padrão do Windows') }].concat(d.saida.filter(function (x) { return x.deviceId !== 'default' && x.deviceId !== 'communications'; }));
      preencher($('sel-saida'), saidas, pref.saida, t('Padrão do Windows'));
      // saída da stream: se ainda não foi escolhida, sugere o cabo virtual (VB-Cable) quando ele existe
      if (!pref.stream.saida) {
        var cabo = saidas.find(function (x) { return /cable input|vb-audio|voicemeeter input/i.test(x.label || ''); });
        if (cabo) { pref.stream.saida = cabo.deviceId; guardar(); }
      }
      preencher($('stream-saida'), saidas, pref.stream.saida, t('Padrão do Windows'));
      if (mic) await aplicarStream();
      preencherQualidades();
      mensagem('');
      semSinal.reiniciar();
      if (window.ECGravar) window.ECGravar.placaAberta();
      // primeira vez com mais de uma câmera, ou sem achar o som da placa: abre os Ajustes para a pessoa conferir
      if ((primeiraVez && d.video.length > 1) || !mic) {
        abrirPainel('placa');
        mostrarOsd(!mic ? t('Escolha o som da sua placa em Ajustes') : t('Confira se esta é a sua placa'));
      }
    } catch (e) {
      var msg = e && e.name === 'NotReadableError'
        ? t('A placa está sendo usada por outro programa (o app da própria placa ou o OBS?). Feche o outro e tente de novo.')
        : t('Não consegui abrir a placa: {0}', e && e.message ? e.message : e);
      mensagem(msg, true);
    }
  }
  async function aplicarSaida() {
    if (ctx && typeof ctx.setSinkId === 'function') { try { await ctx.setSinkId(pref.saida || ''); } catch (e) { /* fica na saída padrão */ } }
    avisoStream();
  }

  // ---------------------------------------------------------------- som para a stream (pedido do João, 23/11/2026)
  // Um segundo caminho, com contexto próprio, direto da placa: só o atraso (sincronia com a imagem), sem volume, mudo,
  // equalizador, mono nem balanço. Vai para outra saída (ex.: o VB-Cable), e o OBS pega de lá sempre a 100%.
  var stream = { ctx: null, fonte: null, atraso: null };
  function pararStream() {
    if (stream.ctx) { try { stream.ctx.close(); } catch (e) { /* já fechado */ } }
    stream = { ctx: null, fonte: null, atraso: null };
  }
  async function aplicarStream() {
    var s = pref.stream;
    $('stream-ligado').checked = Boolean(s.ligado);
    $('stream-saida').disabled = !s.ligado;
    if (!s.ligado || !streamAudio || !streamAudio.getAudioTracks().length) { pararStream(); avisoStream(); return; }
    if (!stream.ctx) {
      stream.ctx = new AudioContext({ latencyHint: LATENCIAS[pref.som.estabilidade] || LATENCIAS.equilibrado, sampleRate: 48000 });
      stream.fonte = stream.ctx.createMediaStreamSource(streamAudio);
      stream.atraso = stream.ctx.createDelay(1);
      stream.fonte.connect(stream.atraso); stream.atraso.connect(stream.ctx.destination);
    }
    stream.atraso.delayTime.setTargetAtTime(pref.som.atraso / 1000, stream.ctx.currentTime, 0.02);
    if (typeof stream.ctx.setSinkId === 'function') {
      try { await stream.ctx.setSinkId(s.saida || ''); } catch (e) { mostrarOsd(t('Não consegui usar a saída da stream escolhida')); }
    }
    if (stream.ctx.state === 'suspended') { try { await stream.ctx.resume(); } catch (e) { /* tenta de novo no próximo clique */ } }
    avisoStream();
  }
  function avisoStream() {
    var aviso = $('stream-aviso');
    var mesma = pref.stream.ligado && (pref.stream.saida || '') === (pref.saida || '');
    aviso.hidden = !mesma;
    aviso.textContent = mesma ? t('A saída da stream é a mesma do fone: o som vai tocar duas vezes. Escolha outra, como o "CABLE Input".') : '';
  }

  // ---------------------------------------------------------------- imagem: filtro, nitidez, retrô, TV de tubo
  var ESTILOS = {
    normal: { brilho: 100, contraste: 100, saturacao: 100, matiz: 0, hdr: false },
    vivido: { brilho: 103, contraste: 112, saturacao: 140, matiz: 0, hdr: false },
    cinema: { brilho: 95, contraste: 118, saturacao: 85, matiz: 0, hdr: false },
    quente: { brilho: 102, contraste: 104, saturacao: 112, matiz: -8, hdr: false },
    frio: { brilho: 100, contraste: 104, saturacao: 105, matiz: 10, hdr: false },
    pb: { brilho: 100, contraste: 115, saturacao: 0, matiz: 0, hdr: false },
    'hdr-lavado': { brilho: 92, contraste: 128, saturacao: 135, matiz: 0, hdr: true },
  };
  var CAMPOS_IMG = [['brilho', '%'], ['contraste', '%'], ['saturacao', '%'], ['matiz', '°']];
  function filtroDaImagem(comNitidez) {
    var i = pref.imagem;
    var partes = [];
    if (comNitidez && Number(i.nitidez) > 0) partes.push('url(#nitidez' + Number(i.nitidez) + ')');
    if (i.brilho !== 100) partes.push('brightness(' + i.brilho / 100 + ')');
    if (i.contraste !== 100) partes.push('contrast(' + i.contraste / 100 + ')');
    if (i.saturacao !== 100) partes.push('saturate(' + i.saturacao / 100 + ')');
    if (i.matiz !== 0) partes.push('hue-rotate(' + i.matiz + 'deg)');
    // realce HDR: curva mais forte nos tons médios e cor mais cheia, por cima dos ajustes da pessoa
    if (i.hdr) partes.push('contrast(1.12) saturate(1.18) brightness(0.97)');
    return partes.join(' ');
  }
  function aplicarImagem() {
    var i = pref.imagem;
    video.style.filter = filtroDaImagem(true);
    video.classList.toggle('retro', Boolean(i.retro));
    $('crt').hidden = !i.crt;
    CAMPOS_IMG.forEach(function (c) { $('img-' + c[0]).value = String(i[c[0]]); $('out-' + c[0]).textContent = i[c[0]] + c[1]; });
    $('img-hdr').checked = Boolean(i.hdr); $('img-espelhar').checked = Boolean(i.espelhar);
    $('img-retro').checked = Boolean(i.retro); $('img-crt').checked = Boolean(i.crt); $('img-nitidez').value = String(i.nitidez || 0);
    $('img-estilo').value = ESTILOS[i.estilo] ? i.estilo : 'personalizado';
    aplicarEnquadramento();
  }
  CAMPOS_IMG.forEach(function (c) {
    $('img-' + c[0]).addEventListener('input', function (e) { pref.imagem[c[0]] = Number(e.target.value); pref.imagem.estilo = 'personalizado'; aplicarImagem(); guardar(); });
  });
  $('img-estilo').addEventListener('change', function (e) {
    var est = ESTILOS[e.target.value]; if (!est) return;
    Object.assign(pref.imagem, est, { estilo: e.target.value }); aplicarImagem(); guardar();
  });
  $('img-hdr').addEventListener('change', function (e) { pref.imagem.hdr = e.target.checked; pref.imagem.estilo = 'personalizado'; aplicarImagem(); guardar(); mostrarOsd(e.target.checked ? t('Realce HDR ligado') : t('Realce HDR desligado')); });
  ['espelhar', 'retro', 'crt'].forEach(function (k) { $('img-' + k).addEventListener('change', function (e) { pref.imagem[k] = e.target.checked; aplicarImagem(); guardar(); }); });
  $('img-nitidez').addEventListener('change', function (e) { pref.imagem.nitidez = Number(e.target.value); aplicarImagem(); guardar(); });
  $('img-padrao').addEventListener('click', function () { pref.imagem = JSON.parse(JSON.stringify(PADRAO.imagem)); aplicarImagem(); guardar(); mostrarOsd(t('Imagem padrão')); });

  // ---------------------------------------------------------------- enquadramento: encaixe, proporção, zoom e arrastar
  var pan = { x: 0, y: 0 };
  var PROPORCOES = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9 };
  function aplicarEnquadramento() {
    var W = window.innerWidth, H = window.innerHeight, p = pref.proporcao, z = pref.zoom / 100;
    var w = W, h = H;
    if (PROPORCOES[p]) { var r = PROPORCOES[p]; if (W / H > r) { w = H * r; } else { h = W / r; } }
    video.style.width = w + 'px'; video.style.height = h + 'px';
    video.style.left = (W - w) / 2 + 'px'; video.style.top = (H - h) / 2 + 'px';
    video.style.objectFit = PROPORCOES[p] || p === 'esticar' ? 'fill' : '';
    video.classList.toggle('cover', p === 'original' && pref.encaixe === 'cover');
    // arrastar só até a borda da imagem ampliada
    var limX = (w * z - w) / 2, limY = (h * z - h) / 2;
    pan.x = Math.max(-limX, Math.min(limX, pan.x)); pan.y = Math.max(-limY, Math.min(limY, pan.y));
    var espelho = pref.imagem.espelhar ? ' scaleX(-1)' : '';
    video.style.transform = (z !== 1 ? 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + z + ')' : '') + espelho;
    document.body.classList.toggle('arrastavel', z > 1);
    $('sel-proporcao').value = p; $('sel-encaixe').value = pref.encaixe;
    $('zoom').value = String(pref.zoom); $('out-zoom').textContent = pref.zoom + '%';
  }
  window.addEventListener('resize', aplicarEnquadramento);
  $('sel-encaixe').addEventListener('change', function (e) { pref.encaixe = e.target.value; guardar(); aplicarEnquadramento(); });
  $('sel-proporcao').addEventListener('change', function (e) { pref.proporcao = e.target.value; guardar(); aplicarEnquadramento(); });
  $('zoom').addEventListener('input', function (e) { pref.zoom = Number(e.target.value); if (pref.zoom === 100) { pan.x = 0; pan.y = 0; } guardar(); aplicarEnquadramento(); });
  var arraste = null;
  $('palco').addEventListener('mousedown', function (e) {
    if (pref.zoom <= 100 || e.button !== 0) return;
    arraste = { x: e.clientX - pan.x, y: e.clientY - pan.y }; document.body.classList.add('arrastando');
  });
  window.addEventListener('mousemove', function (e) { if (!arraste) return; pan.x = e.clientX - arraste.x; pan.y = e.clientY - arraste.y; aplicarEnquadramento(); });
  window.addEventListener('mouseup', function () { arraste = null; document.body.classList.remove('arrastando'); });

  // ---------------------------------------------------------------- FPS de verdade (quadros que chegam da placa)
  var fpsLigado = false;
  function contarFps() {
    if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;
    var quadros = 0, inicio = performance.now();
    (function quadro() {
      if (!fpsLigado) return;
      quadros++;
      var agora = performance.now();
      if (agora - inicio >= 1000) { $('fps').textContent = Math.round(quadros * 1000 / (agora - inicio)) + ' FPS'; quadros = 0; inicio = agora; }
      video.requestVideoFrameCallback(quadro);
    })();
  }
  function aplicarFps() {
    $('mostrar-fps').checked = Boolean(pref.mostrarFps);
    $('fps').hidden = !pref.mostrarFps;
    if (pref.mostrarFps && !fpsLigado) { fpsLigado = true; $('fps').textContent = '... FPS'; contarFps(); }
    if (!pref.mostrarFps) fpsLigado = false;
  }
  $('mostrar-fps').addEventListener('change', function (e) { pref.mostrarFps = e.target.checked; guardar(); aplicarFps(); });

  // ---------------------------------------------------------------- sem sinal: imagem toda preta por alguns segundos
  var semSinal = (function () {
    // A tela de perfis do PS5 escurecida por inatividade chega a brilho máximo 13 de 255 e disparava o aviso
    // (medido no print de 23/11/2026). Agora: 320x180 sem suavizar (o texto fino não some na média) e só é
    // "sem sinal" se NENHUM ponto passar de 6, por 10 s seguidos. Sem sinal de verdade, a placa entrega preto puro.
    var L = 320, A = 180;
    var tela = document.createElement('canvas'); tela.width = L; tela.height = A;
    var c2 = tela.getContext('2d', { willReadFrequently: true });
    c2.imageSmoothingEnabled = false;
    var escuros = 0;
    setInterval(function () {
      var trilhaV = streamVideo && streamVideo.getVideoTracks()[0];
      if (!trilhaV || trilhaV.readyState !== 'live' || video.readyState < 2) { $('sem-sinal').hidden = true; return; }
      try {
        c2.drawImage(video, 0, 0, L, A);
        var px = c2.getImageData(0, 0, L, A).data, soma = 0, maximo = 0, n = px.length / 4;
        for (var i = 0; i < px.length; i += 4) { var l = (px[i] + px[i + 1] + px[i + 2]) / 3; soma += l; if (l > maximo) maximo = l; }
        escuros = soma / n < 2 && maximo <= 6 ? escuros + 1 : 0;
      } catch (e) { escuros = 0; }
      $('sem-sinal').hidden = !(escuros >= 10 || trilhaV.muted);
    }, 1000);
    return { reiniciar: function () { escuros = 0; $('sem-sinal').hidden = true; } };
  })();

  // ---------------------------------------------------------------- janela, Windows e atalhos com outra janela na frente
  function aplicarJanela(inicio) {
    var j = pref.janela;
    $('jan-topo').checked = Boolean(j.topo); $('jan-tela-cheia').checked = Boolean(j.telaCheia);
    $('jan-windows').checked = Boolean(j.windows); $('atalhos-globais').checked = Boolean(j.atalhosGlobais);
    if (window.espectro && window.espectro.janela) {
      window.espectro.janela({ topo: Boolean(j.topo), telaCheia: inicio && j.telaCheia ? true : undefined, windows: Boolean(j.windows), atalhosGlobais: Boolean(j.atalhosGlobais) });
    }
  }
  [['jan-topo', 'topo'], ['jan-tela-cheia', 'telaCheia'], ['jan-windows', 'windows'], ['atalhos-globais', 'atalhosGlobais']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (e) { pref.janela[p[1]] = e.target.checked; guardar(); aplicarJanela(false); });
  });
  $('sel-idioma').addEventListener('change', function (e) {
    pref.idioma = I.definir(e.target.value); guardar();
    if (window.espectro && window.espectro.idioma) window.espectro.idioma(pref.idioma);
    preencherQualidades(); aplicarSom(); aplicarPerfis();
    if (infoPlaca) abrir();
    if (window.espectro) window.espectro.versao().then(function (v) { $('versao').textContent = t('Versão {0}', v); });
  });

  // ---------------------------------------------------------------- perfis (imagem, som, qualidade e enquadramento)
  function retrato() {
    return JSON.parse(JSON.stringify({ imagem: pref.imagem, som: pref.som, qualidade: pref.qualidade, encaixe: pref.encaixe, proporcao: pref.proporcao, zoom: pref.zoom }));
  }
  function aplicarPerfis() {
    var sel = $('perfil-lista'); sel.textContent = '';
    var nomes = Object.keys(pref.perfis || {}).sort();
    if (!nomes.length) { var o = document.createElement('option'); o.value = ''; o.textContent = t('Nenhum perfil salvo'); sel.appendChild(o); }
    nomes.forEach(function (n) { var op = document.createElement('option'); op.value = n; op.textContent = n; sel.appendChild(op); });
  }
  $('perfil-salvar').addEventListener('click', function () {
    var nome = $('perfil-nome').value.trim().slice(0, 40);
    if (!nome) { mostrarOsd(t('Dê um nome ao perfil')); return; }
    pref.perfis[nome] = retrato(); guardar(); aplicarPerfis(); $('perfil-lista').value = nome; $('perfil-nome').value = '';
    mostrarOsd(t('Perfil "{0}" salvo', nome));
  });
  $('perfil-usar').addEventListener('click', function () {
    var nome = $('perfil-lista').value, p = pref.perfis[nome]; if (!p) return;
    var trocouQualidade = p.qualidade && p.qualidade !== pref.qualidade;
    pref.imagem = Object.assign({}, PADRAO.imagem, p.imagem); pref.som = Object.assign({}, PADRAO.som, p.som);
    ['qualidade', 'encaixe', 'proporcao', 'zoom'].forEach(function (k) { if (p[k] !== undefined) pref[k] = p[k]; });
    guardar(); aplicarImagem(); aplicarSom(); aplicarEnquadramento();
    if (trocouQualidade) abrir();
    mostrarOsd(t('Perfil "{0}" aplicado', nome));
  });
  $('perfil-apagar').addEventListener('click', function () {
    var nome = $('perfil-lista').value; if (!pref.perfis[nome]) return;
    delete pref.perfis[nome]; guardar(); aplicarPerfis(); mostrarOsd(t('Perfil apagado'));
  });

  // ---------------------------------------------------------------- ajustes (abas) e controles da barra
  function abrirPainel(aba) {
    $('relato').hidden = true; $('painel').hidden = false;
    if (aba) mostrarAba(aba);
  }
  function mostrarAba(aba) {
    document.querySelectorAll('.aba').forEach(function (b) { b.classList.toggle('ativa', b.dataset.aba === aba); });
    document.querySelectorAll('.sec-aba').forEach(function (s) { s.hidden = s.dataset.sec !== aba; });
  }
  document.querySelectorAll('.aba').forEach(function (b) { b.addEventListener('click', function () { mostrarAba(b.dataset.aba); }); });
  faixa.addEventListener('input', function () { mudarVolume(Number(faixa.value), false); });
  $('mudo').addEventListener('click', alternarMudo);
  $('tela-cheia').addEventListener('click', alternarTelaCheia);
  $('ajustes').addEventListener('click', function () { if ($('painel').hidden) abrirPainel(); else $('painel').hidden = true; });
  $('fechar-painel').addEventListener('click', function () { $('painel').hidden = true; });
  $('mensagem-acao').addEventListener('click', abrir);
  $('sel-video').addEventListener('change', function (e) { pref.video = e.target.value; guardar(); abrir(); });
  $('sel-audio').addEventListener('change', function (e) { pref.audio = e.target.value; guardar(); abrir(); });
  $('sel-saida').addEventListener('change', function (e) { pref.saida = e.target.value; guardar(); aplicarSaida(); });
  $('stream-ligado').addEventListener('change', function (e) {
    pref.stream.ligado = e.target.checked; guardar(); aplicarStream();
    mostrarOsd(e.target.checked ? t('Som para a stream ligado') : t('Som para a stream desligado'));
  });
  $('stream-saida').addEventListener('change', function (e) { pref.stream.saida = e.target.value; guardar(); aplicarStream(); });
  $('stream-ligado').checked = Boolean(pref.stream.ligado); $('stream-saida').disabled = !pref.stream.ligado;
  $('sel-qualidade').addEventListener('change', function (e) { pref.qualidade = e.target.value; guardar(); abrir(); });
  video.addEventListener('dblclick', alternarTelaCheia);
  // tela cheia pela própria janela do programa (o pedido de tela cheia da página o Electron pode ignorar)
  function alternarTelaCheia() {
    if (window.espectro && window.espectro.telaCheia) { window.espectro.telaCheia(); return; }
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () {});
  }
  function gravacao(acao) { if (window.ECGravar) window.ECGravar[acao](); }
  $('b-print').addEventListener('click', function () { gravacao('print'); });
  $('b-replay').addEventListener('click', function () { gravacao('salvarReplay'); });
  $('b-gravar').addEventListener('click', function () { gravacao('alternarGravacao'); });
  $('rep-ligado').addEventListener('change', function (e) { pref.gravar.replay = e.target.checked; guardar(); if (window.ECGravar) window.ECGravar.configurarReplay(); mostrarOsd(e.target.checked ? t('Replay ligado') : t('Replay desligado')); });
  $('rep-duracao').addEventListener('change', function (e) { pref.gravar.duracao = Number(e.target.value); guardar(); if (window.ECGravar) window.ECGravar.configurarReplay(); });
  $('abrir-prints').addEventListener('click', function () { if (window.espectro) window.espectro.abrirPasta('imagens'); });
  $('abrir-videos').addEventListener('click', function () { if (window.espectro) window.espectro.abrirPasta('videos'); });

  // ---------------------------------------------------------------- fale com a Espectro (sugestão ou problema)
  $('abrir-relato').addEventListener('click', function () { $('painel').hidden = true; $('relato').hidden = false; $('relato-estado').textContent = ''; $('relato-mensagem').focus(); });
  $('relato-fechar').addEventListener('click', function () { $('relato').hidden = true; });
  $('relato-enviar').addEventListener('click', function () {
    var estado = $('relato-estado'), botao = $('relato-enviar');
    var msg = $('relato-mensagem').value.trim();
    if (msg.length < 5) { estado.textContent = t('Escreva um pouco mais na mensagem.'); return; }
    if (!window.espectro || !window.espectro.enviarRelato) { estado.textContent = t('Envio indisponível nesta versão.'); return; }
    botao.disabled = true; estado.textContent = t('Enviando...');
    window.espectro.enviarRelato({
      tipo: $('relato-tipo').value, mensagem: msg, nome: $('relato-nome').value.trim(), email: $('relato-email').value.trim(),
      detalhes: $('relato-tecnico').checked ? 'Em uso: ' + (infoPlaca || 'placa não aberta') + ' · qualidade ' + pref.qualidade + ' · volume ' + pref.volume + '% · idioma ' + pref.idioma : '',
    }).then(function (r) {
      botao.disabled = false;
      if (r && r.ok) { estado.textContent = t('Enviado. Obrigado! A equipe da Espectro vai ler.'); $('relato-mensagem').value = ''; }
      else estado.textContent = (r && r.erro) || t('Não deu para enviar agora. Confira a internet e tente de novo.');
    });
  });

  // ---------------------------------------------------------------- atualização (só com clique)
  var botaoAtualizar = $('atualizar'), estadoAtualizacao = $('estado-atualizacao');
  function mostrarAtualizacao(e) {
    var textos = {
      'procurando': t('Procurando atualização...'),
      'em-dia': t('Você está na versão mais nova.'),
      'disponivel': t('Versão {0} disponível.', e.versao),
      'baixando': t('Baixando a atualização... {0}%', e.porcento || 0),
      'pronta': t('Atualização baixada. Clique em "Reiniciar e instalar".'),
      'erro': t('Não deu para procurar atualização agora (sem internet?).'),
    };
    estadoAtualizacao.textContent = textos[e.fase] || '';
    // o mesmo botão na barra de baixo e dentro dos Ajustes
    [botaoAtualizar, $('atualizar-painel')].forEach(function (b) {
      b.hidden = !(e.fase === 'disponivel' || e.fase === 'pronta');
      b.textContent = e.fase === 'pronta' ? t('Reiniciar e instalar') : t('Atualizar para {0}', e.versao);
      b.dataset.fase = e.fase;
    });
    if (e.fase === 'disponivel') mostrarOsd(t('Atualização disponível: versão {0}', e.versao));
  }
  if (window.espectro) {
    window.espectro.versao().then(function (v) { $('versao').textContent = t('Versão {0}', v); });
    window.espectro.aoAtualizacao(mostrarAtualizacao);
    $('procurar-atualizacao').addEventListener('click', function () { mostrarAtualizacao({ fase: 'procurando' }); window.espectro.procurarAtualizacao(); });
    [botaoAtualizar, $('atualizar-painel')].forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.fase === 'pronta') window.espectro.instalarAtualizacao();
        else { mostrarAtualizacao({ fase: 'baixando', porcento: 0 }); botaoAtualizar.hidden = true; $('atualizar-painel').hidden = true; window.espectro.baixarAtualizacao(); }
      });
    });
    // atalhos que chegam com outra janela na frente (Ctrl+Alt+tecla) e do ícone perto do relógio
    if (window.espectro.aoAtalho) window.espectro.aoAtalho(executarAtalho);
  }

  function executarAtalho(nome) {
    if (nome === 'mudo') alternarMudo();
    else if (nome === 'mais') mudarVolume(pref.volume + 5, true);
    else if (nome === 'menos') mudarVolume(pref.volume - 5, true);
    else if (nome === 'print') gravacao('print');
    else if (nome === 'replay') gravacao('salvarReplay');
    else if (nome === 'gravar') gravacao('alternarGravacao');
    else if (nome === 'tela-cheia') alternarTelaCheia();
  }
  document.addEventListener('keydown', function (e) {
    if (tourAberto()) {
      if (e.key === 'Escape') fecharTour();
      else if (e.key === 'ArrowRight') { $('tour-proximo').click(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { if (tour.passo > 0) mostrarPasso(tour.passo - 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
      return;
    }
    // digitando no formulário: as letras não podem virar atalho
    if (e.target && /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var k = e.key.toLowerCase();
    if (k === 'm') executarAtalho('mudo');
    else if (e.key === 'ArrowUp') { executarAtalho('mais'); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { executarAtalho('menos'); e.preventDefault(); }
    else if (k === 'f') executarAtalho('tela-cheia');
    else if (k === 'p') executarAtalho('print');
    else if (k === 'r') executarAtalho('replay');
    else if (k === 'g') executarAtalho('gravar');
    else if (e.key === 'Escape') { $('painel').hidden = true; $('relato').hidden = true; }
  });
  window.addEventListener('wheel', function (e) {
    if (!$('painel').hidden || !$('relato').hidden || tourAberto()) return;
    mudarVolume(pref.volume + (e.deltaY < 0 ? 5 : -5), true);
  }, { passive: true });

  // barra e cursor somem depois de 2,5 s parado (menos com o mouse em cima da barra ou com os ajustes abertos)
  var ocioso;
  function acordar() {
    document.body.classList.remove('ocioso');
    clearTimeout(ocioso);
    ocioso = setTimeout(function () { if (!barra.matches(':hover') && $('painel').hidden && $('relato').hidden && $('tour').hidden) document.body.classList.add('ocioso'); }, 2500);
  }
  ['mousemove', 'mousedown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, acordar); });
  acordar();

  // placa ligada ou desligada com o app aberto: tenta de novo sozinho
  navigator.mediaDevices.addEventListener('devicechange', function () {
    clearTimeout(abrir.t); abrir.t = setTimeout(function () { if (!streamVideo || streamVideo.getVideoTracks()[0].readyState === 'ended') abrir(); }, 800);
  });

  // ---------------------------------------------------------------- tutorial (primeira vez e Ajustes > Programa)
  var PASSOS = [
    { titulo: 'Bem-vindo ao Espectro Captura', texto: 'Aqui você vê e ouve o seu console pela placa de captura, com volume próprio e sem precisar do OBS. Em um minuto eu mostro o principal. Antes de jogar, feche o programa da placa e o OBS: só um programa usa a placa por vez.' },
    { alvos: ['mudo', 'volume', 'volume-num'], titulo: 'Volume do jogo', texto: 'Mude o volume só da placa, sem mexer no resto do Windows. Também funciona com as setas para cima e para baixo e com a roda do mouse. A tecla M deixa no mudo.' },
    { alvos: ['b-print', 'b-replay', 'b-gravar'], titulo: 'Print, replay e gravação', texto: 'P tira um print, G começa e para a gravação em vídeo e R salva os últimos segundos do jogo. O replay precisa estar ligado em Ajustes > Gravar.' },
    { alvos: ['ajustes'], titulo: 'Ajustes', texto: 'Em Placa você escolhe a placa e a qualidade. Em Imagem deixa a cor e a nitidez do seu jeito. Em Som ajusta o atraso, o equalizador e o estéreo. Em Programa ficam o idioma, os perfis de cada jogo e a atualização.' },
    { alvos: ['tela-cheia'], titulo: 'Tela cheia', texto: 'Clique aqui, aperte F ou dê dois cliques na imagem. A barra some sozinha quando o mouse fica parado; é só mexer que ela volta.' },
    { titulo: 'Tudo pronto', texto: 'Bom jogo! Para ver este tutorial de novo, abra Ajustes > Programa > Ver o tutorial.' },
  ];
  var tour = { passo: 0 };
  function tourAberto() { return !$('tour').hidden; }
  function posicionarTour() {
    var p = PASSOS[tour.passo], foco = $('tour-foco'), cartao = $('tour-cartao');
    var rets = (p.alvos || []).map(function (id) { return $(id).getBoundingClientRect(); }).filter(function (r) { return r.width > 0; });
    if (!rets.length) {
      foco.hidden = true; $('tour-fundo').hidden = false;
      cartao.classList.add('meio'); cartao.style.bottom = '';
      return;
    }
    var esq = Math.min.apply(null, rets.map(function (r) { return r.left; })), topo = Math.min.apply(null, rets.map(function (r) { return r.top; }));
    var dir = Math.max.apply(null, rets.map(function (r) { return r.right; })), baixo = Math.max.apply(null, rets.map(function (r) { return r.bottom; }));
    var m = 6;
    foco.style.left = (esq - m) + 'px'; foco.style.top = (topo - m) + 'px';
    foco.style.width = (dir - esq + m * 2) + 'px'; foco.style.height = (baixo - topo + m * 2) + 'px';
    foco.hidden = false; $('tour-fundo').hidden = true;
    cartao.classList.remove('meio');
    cartao.style.bottom = Math.max(16, window.innerHeight - topo + 22) + 'px';
  }
  function mostrarPasso(n) {
    tour.passo = Math.max(0, Math.min(PASSOS.length - 1, n));
    var p = PASSOS[tour.passo], ultimo = tour.passo === PASSOS.length - 1, cartao = $('tour-cartao');
    var espera = cartao.dataset.visto ? 140 : 0;
    cartao.dataset.visto = '1';
    cartao.classList.add('trocando');
    setTimeout(function () {
      $('tour-passo').textContent = t('Passo {0} de {1}', tour.passo + 1, PASSOS.length);
      $('tour-titulo').textContent = t(p.titulo);
      $('tour-texto').textContent = t(p.texto);
      $('tour-pontos').innerHTML = PASSOS.map(function (_x, i) { return '<i' + (i === tour.passo ? ' class="ativo"' : '') + '></i>'; }).join('');
      $('tour-voltar').hidden = tour.passo === 0;
      $('tour-pular').hidden = ultimo;
      $('tour-proximo').textContent = tour.passo === 0 ? t('Começar') : ultimo ? t('Concluir') : t('Próximo');
      posicionarTour();
      cartao.classList.remove('trocando');
      $('tour-proximo').focus();
    }, espera);
  }
  function abrirTour() {
    $('painel').hidden = true; $('relato').hidden = true;
    document.body.classList.remove('ocioso');
    $('tour').hidden = false; $('tour-cartao').dataset.visto = '';
    mostrarPasso(0);
  }
  function fecharTour() {
    $('tour').hidden = true;
    if (!pref.tutorialVisto) { pref.tutorialVisto = true; guardar(); }
    acordar();
  }
  $('tour-proximo').addEventListener('click', function () { if (tour.passo === PASSOS.length - 1) fecharTour(); else mostrarPasso(tour.passo + 1); });
  $('tour-voltar').addEventListener('click', function () { mostrarPasso(tour.passo - 1); });
  $('tour-pular').addEventListener('click', fecharTour);
  $('ver-tutorial').addEventListener('click', abrirTour);
  $('ver-codigo').addEventListener('click', function () { if (window.espectro && window.espectro.abrirCodigo) window.espectro.abrirCodigo(); });
  window.addEventListener('resize', function () { if (tourAberto()) posicionarTour(); });

  // ponte para gravacao.js (print, replay e vídeo)
  window.EC = {
    t: t, pref: pref, guardar: guardar, osd: mostrarOsd, video: video,
    trilhaVideo: function () { return streamVideo && streamVideo.getVideoTracks()[0]; },
    trilhaAudio: function () { return streamAudio && streamAudio.getAudioTracks()[0]; },
    estadoStream: function () { return stream.ctx ? { estado: stream.ctx.state, saida: stream.ctx.sinkId, atrasoMs: Math.round(stream.atraso.delayTime.value * 1000) } : null; },
    filtro: function () { return filtroDaImagem(false); },
    tutorial: abrirTour,
  };

  $('sel-idioma').value = pref.idioma;
  $('rep-ligado').checked = Boolean(pref.gravar.replay); $('rep-duracao').value = String(pref.gravar.duracao);
  aplicarVolume(); aplicarSom(); aplicarImagem(); aplicarFps(); aplicarPerfis();
  aplicarJanela(true);
  abrir();
  if (!pref.tutorialVisto) setTimeout(abrirTour, 600);
})();
