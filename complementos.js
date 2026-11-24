// Complementos que a pessoa baixa só se quiser (não vêm no instalador).
// Hoje só existe o "suavizar-1": a IA de quadros intermediários (RIFE v4.6, MIT, convertida em ONNX pelo vs-mlrt, GPL-3.0)
// e o onnxruntime-web 1.31.1 (MIT), que roda a IA na placa de vídeo. Os arquivos vêm do servidor da Espectro e só são
// usados se o SHA-256 bater com o daqui. A tela lê os arquivos pelo endereço privado complemento://<id>/<arquivo>.
const { app, net, protocol, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SERVIDOR = 'https://espectrosolucoes.com.br/atualizacoes/espectro-captura/complementos/';
const LISTA = {
  'suavizar-1': {
    arquivos: [
      // nome, tamanho em bytes e SHA-256 de cada arquivo publicado no servidor
      { nome: 'ort.webgpu.min.mjs', bytes: 70742, sha256: '329cd956772397a1aedd668e911195d39afefb182f6fc14aafa4f08ac8d8f379' },
      { nome: 'ort-wasm-simd-threaded.asyncify.mjs', bytes: 53457, sha256: '59cf781530e1a16df2a291d78798e3ec1152467edaec402d6f9599d85047c302' },
      { nome: 'ort-wasm-simd-threaded.asyncify.wasm', bytes: 28747738, sha256: 'ca319e9539cd0f1e291cf56074760121eaf39650f5dbf84b6e52c07f4b2944ec' },
      { nome: 'rife46-fluxo.onnx', bytes: 21261757, sha256: 'c168d4bb3c7faf50f9313247ae8794120076bade9e79e524633bfe4746d6a1a3' },
      { nome: 'LEIA-ME.txt', bytes: 3428, sha256: '4e32e2e86e8f0ce951ed06e5852dc9b24aba67c6e6498e17803c41bfde9d21d2' },
    ],
  },
};
const TIPOS = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8' };

const pastaDe = (id) => path.join(app.getPath('userData'), 'complementos', id);
const conferidos = new Map(); // id -> true (SHA-256 conferido nesta sessão)
const baixando = new Map(); // id -> Promise

function sha256DoArquivo(arq) {
  return new Promise((ok, falhou) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(arq).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex'))).on('error', falhou);
  });
}

function estado(id) {
  const c = LISTA[id];
  if (!c) return { existe: false };
  const total = c.arquivos.reduce((s, a) => s + a.bytes, 0);
  const instalado = c.arquivos.every((a) => { try { return fs.statSync(path.join(pastaDe(id), a.nome)).size === a.bytes; } catch { return false; } });
  return { existe: true, instalado, baixando: baixando.has(id), totalBytes: total };
}

async function conferir(id) {
  if (conferidos.get(id)) return true;
  const c = LISTA[id];
  for (const a of c.arquivos) {
    const arq = path.join(pastaDe(id), a.nome);
    if (!fs.existsSync(arq) || (await sha256DoArquivo(arq)) !== a.sha256) return false;
  }
  conferidos.set(id, true);
  return true;
}

async function baixar(id, aoProgresso) {
  const c = LISTA[id];
  if (!c) throw new Error('complemento desconhecido');
  if (baixando.has(id)) return baixando.get(id);
  const tarefa = (async () => {
    const pasta = pastaDe(id);
    fs.mkdirSync(pasta, { recursive: true });
    const total = c.arquivos.reduce((s, a) => s + a.bytes, 0);
    let feito = 0;
    for (const a of c.arquivos) {
      const destino = path.join(pasta, a.nome);
      if (fs.existsSync(destino) && fs.statSync(destino).size === a.bytes && (await sha256DoArquivo(destino)) === a.sha256) { feito += a.bytes; aoProgresso(feito, total); continue; }
      const parcial = destino + '.parcial';
      const res = await net.fetch(SERVIDOR + id + '/' + a.nome, { cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error(`download ${a.nome}: HTTP ${res.status}`);
      const h = crypto.createHash('sha256');
      const saida = fs.createWriteStream(parcial);
      let recebidos = 0;
      const leitor = res.body.getReader();
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        recebidos += value.length;
        if (recebidos > a.bytes) throw new Error(`download ${a.nome}: maior que o esperado`);
        h.update(value);
        if (!saida.write(value)) await new Promise((ok) => saida.once('drain', ok));
        aoProgresso(feito + recebidos, total);
      }
      await new Promise((ok, falhou) => saida.end((e) => (e ? falhou(e) : ok())));
      if (h.digest('hex') !== a.sha256) { fs.rmSync(parcial, { force: true }); throw new Error(`download ${a.nome}: arquivo não confere (SHA-256)`); }
      fs.renameSync(parcial, destino);
      feito += a.bytes;
    }
    conferidos.set(id, true);
  })();
  baixando.set(id, tarefa);
  try { await tarefa; } finally { baixando.delete(id); }
}

// antes do app ficar pronto: o esquema complemento:// pode servir módulo, wasm e fetch para a página do app
function registrarEsquema() {
  protocol.registerSchemesAsPrivileged([{ scheme: 'complemento', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
}

// depois do app pronto
function ativar(enviarParaTela) {
  protocol.handle('complemento', async (req) => {
    let u;
    try { u = new URL(req.url); } catch { return new Response('', { status: 400 }); }
    const id = u.hostname;
    const nome = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    const c = LISTA[id];
    const item = c && c.arquivos.find((a) => a.nome === nome);
    if (!item) return new Response('', { status: 404 });
    if (!(await conferir(id))) return new Response('', { status: 409 });
    const corpo = await fs.promises.readFile(path.join(pastaDe(id), nome));
    return new Response(corpo, { headers: { 'Content-Type': TIPOS[path.extname(nome)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
  });
  ipcMain.handle('complemento:estado', (_e, id) => estado(String(id)));
  ipcMain.handle('complemento:baixar', async (_e, id) => {
    id = String(id);
    let ultimo = 0;
    try {
      await baixar(id, (feito, total) => {
        const agora = Date.now();
        if (agora - ultimo > 150 || feito === total) { ultimo = agora; enviarParaTela('complemento', { id, fase: 'baixando', feito, total }); }
      });
      enviarParaTela('complemento', { id, fase: 'pronto' });
      return { ok: true };
    } catch (e) {
      enviarParaTela('complemento', { id, fase: 'erro', erro: String(e.message || e) });
      return { ok: false, erro: String(e.message || e) };
    }
  });
  ipcMain.handle('complemento:remover', (_e, id) => {
    id = String(id);
    if (!LISTA[id] || baixando.has(id)) return { ok: false };
    fs.rmSync(pastaDe(id), { recursive: true, force: true });
    conferidos.delete(id);
    return { ok: true };
  });
}

module.exports = { registrarEsquema, ativar, LISTA };
