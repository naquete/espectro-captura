// Gravação do Espectro Captura: print (P), replay dos últimos segundos (R) e vídeo (G).
// Um "motor" só codifica a placa (vídeo H.264 pela placa de vídeo do PC e som AAC ou Opus, via WebCodecs). Os pacotes
// prontos vão para a memória do replay (só os últimos segundos) e, gravando, direto para o arquivo MP4 no disco.
// O arquivo é montado pelo Mediabunny (MPL-2.0, cópia sem mudança em vendor/).
import { Output, Mp4OutputFormat, BufferTarget, StreamTarget, EncodedVideoPacketSource, EncodedAudioPacketSource, EncodedPacket } from './vendor/mediabunny.min.mjs';

const EC = window.EC;
const t = EC.t;
const $ = (id) => document.getElementById(id);
const api = window.espectro || {};

let motor = null;               // codificadores rodando
let buffer = [];                // pacotes do replay: { tipo, pacote, chave, ts (s) }
let configs = { video: null, audio: null };
let codecAudio = null;          // 'aac' ou 'opus'
let ultimoTsVideo = 0;
let forcarChave = false;
let gravacao = null;            // gravação de vídeo em andamento
let relogio = null;

const nomeArquivo = (prefixo, ext) => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${prefixo} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`;
};

// ---------------------------------------------------------------- codificação
async function configVideo(w, h, fps) {
  const bitrate = h >= 2000 ? 40e6 : h >= 1400 ? 24e6 : h >= 1000 ? (fps > 40 ? 14e6 : 10e6) : 8e6;
  for (const codec of ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4D4028']) {
    const c = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' } };
    try { const s = await VideoEncoder.isConfigSupported(c); if (s.supported) return s.config; } catch { /* tenta o próximo */ }
  }
  return null;
}
async function configAudio(sampleRate, canais) {
  for (const [codec, nome] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const c = { codec, sampleRate, numberOfChannels: Math.min(2, canais), bitrate: 160000 };
    try { const s = await AudioEncoder.isConfigSupported(c); if (s.supported) return { config: s.config, nome }; } catch { /* tenta o próximo */ }
  }
  return null;
}

function receber(tipo, chunk, meta) {
  if (meta && meta.decoderConfig) configs[tipo] = meta.decoderConfig;
  const item = { tipo, pacote: EncodedPacket.fromEncodedChunk(chunk), chave: chunk.type === 'key', ts: chunk.timestamp / 1e6 };
  if (tipo === 'video') ultimoTsVideo = item.ts;
  if (EC.pref.gravar.replay) {
    buffer.push(item);
    const limite = (EC.pref.gravar.duracao || 30) + 6;
    while (buffer.length && ultimoTsVideo - buffer[0].ts > limite) buffer.shift();
  }
  if (gravacao) alimentarGravacao(item);
}

async function ligarMotor() {
  if (motor) return true;
  const tv = EC.trilhaVideo();
  if (!tv || tv.readyState !== 'live') { EC.osd(t('Abra a placa antes')); return false; }
  const s = tv.getSettings(), fps = Math.round(s.frameRate || 60);
  const vcfg = await configVideo(s.width, s.height, fps);
  if (!vcfg) { EC.osd(t('Este PC não consegue codificar vídeo para gravar')); return false; }
  const m = { parado: false, fps, trilhas: [], leitores: [] };
  m.venc = new VideoEncoder({ output: (c, meta) => receber('video', c, meta), error: () => desligarMotor() });
  m.venc.configure(vcfg);
  const vt = tv.clone(); m.trilhas.push(vt);
  const vr = new MediaStreamTrackProcessor({ track: vt }).readable.getReader(); m.leitores.push(vr);
  let ultimaChave = -Infinity;
  (async () => {
    while (!m.parado) {
      let r; try { r = await vr.read(); } catch { break; }
      const quadro = r.value; if (r.done || !quadro) break;
      // atrasou (PC ocupado): pula o quadro em vez de acumular atraso
      if (m.venc.state !== 'configured' || m.venc.encodeQueueSize > 8) { quadro.close(); continue; }
      const chave = forcarChave || quadro.timestamp - ultimaChave >= 2e6; // quadro-chave a cada 2 s (o replay começa nele)
      if (chave) { ultimaChave = quadro.timestamp; forcarChave = false; }
      try { m.venc.encode(quadro, { keyFrame: chave }); } catch { /* codificador fechou */ }
      quadro.close();
    }
  })();
  const ta = EC.trilhaAudio();
  codecAudio = null; configs.audio = null;
  if (ta && ta.readyState === 'live') {
    const at = ta.clone(); m.trilhas.push(at);
    const ar = new MediaStreamTrackProcessor({ track: at }).readable.getReader(); m.leitores.push(ar);
    (async () => {
      let enc = null;
      while (!m.parado) {
        let r; try { r = await ar.read(); } catch { break; }
        const dados = r.value; if (r.done || !dados) break;
        if (!enc) {
          const ac = await configAudio(dados.sampleRate, dados.numberOfChannels);
          if (!ac) { dados.close(); break; }
          enc = m.aenc = new AudioEncoder({ output: (c, meta) => receber('audio', c, meta), error: () => { /* segue sem som */ } });
          enc.configure(ac.config); codecAudio = ac.nome;
        }
        if (enc.state === 'configured' && enc.encodeQueueSize < 60) { try { enc.encode(dados); } catch { /* fechou */ } }
        dados.close();
      }
    })();
  }
  motor = m;
  return true;
}

function desligarMotor() {
  const m = motor; motor = null;
  buffer = []; configs = { video: null, audio: null }; codecAudio = null;
  if (!m) return;
  m.parado = true;
  m.leitores.forEach((r) => { try { r.cancel(); } catch { /* já parou */ } });
  m.trilhas.forEach((x) => { try { x.stop(); } catch { /* já parou */ } });
  [m.venc, m.aenc].forEach((e) => { try { if (e && e.state !== 'closed') e.close(); } catch { /* já fechou */ } });
}

// ---------------------------------------------------------------- montar o MP4
async function criarSaida(target, fastStart, fps, comAudio) {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart }), target });
  const v = new EncodedVideoPacketSource('avc');
  output.addVideoTrack(v, { frameRate: fps });
  let a = null;
  if (comAudio) { a = new EncodedAudioPacketSource(codecAudio); output.addAudioTrack(a); }
  await output.start();
  return { output, v, a, primeiroV: true, primeiroA: true };
}
async function adicionar(saida, item, t0) {
  const pacote = item.pacote.clone({ timestamp: Math.max(0, item.ts - t0) });
  if (item.tipo === 'video') { await saida.v.add(pacote, saida.primeiroV ? { decoderConfig: configs.video } : undefined); saida.primeiroV = false; }
  else if (saida.a) { await saida.a.add(pacote, saida.primeiroA ? { decoderConfig: configs.audio } : undefined); saida.primeiroA = false; }
}
// junta vídeo e som pela hora, sem mudar a ordem de cada um
function intercalar(itens) {
  const v = itens.filter((i) => i.tipo === 'video'), a = itens.filter((i) => i.tipo === 'audio'), saida = [];
  let i = 0, j = 0;
  while (i < v.length || j < a.length) saida.push(j >= a.length || (i < v.length && v[i].ts <= a[j].ts) ? v[i++] : a[j++]);
  return saida;
}

// ---------------------------------------------------------------- replay
async function salvarReplay() {
  if (!EC.pref.gravar.replay) { EC.osd(t('Ligue o replay em Ajustes > Gravar')); return; }
  if (!motor) { await ligarMotor(); EC.osd(t('O replay ainda está juntando os primeiros segundos')); return; }
  const copia = buffer.slice(), dur = EC.pref.gravar.duracao || 30, fim = ultimoTsVideo;
  let ini = copia.findIndex((i) => i.tipo === 'video' && i.chave && i.ts >= fim - dur);
  if (ini < 0) ini = copia.findIndex((i) => i.tipo === 'video' && i.chave);
  if (ini < 0 || !configs.video || fim - copia[ini].ts < 2) { EC.osd(t('O replay ainda está juntando os primeiros segundos')); return; }
  const t0 = copia[ini].ts;
  const itens = intercalar(copia.filter((i) => i.ts >= t0));
  const comAudio = Boolean(codecAudio && configs.audio && itens.some((i) => i.tipo === 'audio'));
  try {
    const saida = await criarSaida(new BufferTarget(), 'in-memory', motor.fps, comAudio);
    for (const it of itens) await adicionar(saida, it, t0);
    await saida.output.finalize();
    const r = await api.salvarArquivo({ pasta: 'videos', nome: nomeArquivo('Replay', 'mp4'), dados: new Uint8Array(saida.output.target.buffer) });
    EC.osd(r && r.ok ? t('Replay salvo ({0} s)', Math.round(fim - t0)) : t('Não deu para salvar: {0}', (r && r.erro) || '?'));
  } catch (e) { EC.osd(t('Não deu para salvar: {0}', e.message || e)); }
}

// ---------------------------------------------------------------- gravação de vídeo (vai direto para o disco)
function alimentarGravacao(item) {
  const g = gravacao;
  if (g.parando) return;
  if (g.esperando) {
    if (!(item.tipo === 'video' && item.chave && configs.video)) return; // começa num quadro-chave
    g.esperando = false; g.t0 = item.ts;
    const comAudio = Boolean(codecAudio && configs.audio);
    g.fila = g.fila.then(async () => { g.saida = await criarSaida(new StreamTarget(g.escrita, { chunked: true }), false, motor.fps, comAudio); });
  }
  if (item.ts < g.t0) return;
  g.fila = g.fila.then(() => adicionar(g.saida, item, g.t0)).catch(() => { /* um pacote ruim não para a gravação */ });
}
async function iniciarGravacao() {
  if (!(await ligarMotor())) return;
  const nome = nomeArquivo('Gravacao', 'mp4');
  const r = await api.gravacaoAbrir(nome);
  if (!r || !r.ok) { EC.osd(t('Não deu para salvar: {0}', (r && r.erro) || '?')); return; }
  const id = r.id;
  gravacao = {
    id, inicio: Date.now(), esperando: true, parando: false, t0: 0, saida: null, fila: Promise.resolve(),
    escrita: new WritableStream({ write: (ch) => api.gravacaoEscrever(id, ch.position, ch.data) }),
  };
  forcarChave = true;
  $('b-gravar').classList.add('gravando'); $('rec').hidden = false;
  relogio = setInterval(() => {
    const s = Math.floor((Date.now() - gravacao.inicio) / 1000);
    $('rec-tempo').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 500);
  EC.osd(t('Gravando'));
}
async function pararGravacao() {
  const g = gravacao; if (!g) return;
  g.parando = true; gravacao = null;
  clearInterval(relogio); $('b-gravar').classList.remove('gravando'); $('rec').hidden = true; $('rec-tempo').textContent = '00:00';
  try {
    await g.fila;
    if (g.saida) await g.saida.output.finalize();
    await api.gravacaoFechar(g.id, Boolean(g.saida));
    EC.osd(g.saida ? t('Gravação salva') : t('Não deu para salvar: {0}', '0 s'));
  } catch (e) {
    await api.gravacaoFechar(g.id, false);
    EC.osd(t('Não deu para salvar: {0}', e.message || e));
  }
  if (!EC.pref.gravar.replay) desligarMotor();
}

// ---------------------------------------------------------------- print (com os ajustes de imagem)
async function print() {
  const v = EC.video;
  if (!v.videoWidth) { EC.osd(t('Abra a placa antes')); return; }
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  const g = c.getContext('2d');
  g.filter = EC.filtro() || 'none';
  if (EC.pref.imagem.espelhar) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(v, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/png'));
  const r = await api.salvarArquivo({ pasta: 'imagens', nome: nomeArquivo('Print', 'png'), dados: new Uint8Array(await blob.arrayBuffer()) });
  EC.osd(r && r.ok ? t('Print salvo') : t('Não deu para salvar: {0}', (r && r.erro) || '?'));
}

// ---------------------------------------------------------------- ligações com o resto do programa
window.ECGravar = {
  print: () => { print(); },
  salvarReplay: () => { salvarReplay(); },
  alternarGravacao: () => { if (gravacao) pararGravacao(); else iniciarGravacao(); },
  configurarReplay: () => {
    if (EC.pref.gravar.replay) ligarMotor();
    else { buffer = []; if (!gravacao) desligarMotor(); }
  },
  // a placa vai fechar (troca de qualidade, de placa...): fecha a gravação certinho e para o motor
  placaFechando: () => { if (gravacao) pararGravacao(); desligarMotor(); },
  placaAberta: () => { if (EC.pref.gravar.replay) setTimeout(() => ligarMotor(), 600); },
  pararTudo: async () => { if (gravacao) await pararGravacao(); desligarMotor(); },
  // só para os testes automáticos
  estado: () => ({ motor: Boolean(motor), pacotes: buffer.length, codecAudio, temConfigVideo: Boolean(configs.video), gravando: Boolean(gravacao) }),
};
if (api.aoFecharPedido) api.aoFecharPedido(async () => { try { await window.ECGravar.pararTudo(); } finally { api.podeFechar(); } });
if (EC.pref.gravar.replay && EC.trilhaVideo()) ligarMotor();
