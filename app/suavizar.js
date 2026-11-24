// Suavizar movimento (experimental): gera o quadro do meio entre dois quadros da placa e mostra o dobro de quadros.
// Fluxo (tudo na placa de vídeo, com WebGPU):
//   1. cada quadro novo da placa é copiado para uma textura; quadro repetido (o PS5 manda o jogo de 30 fps num sinal
//      de 60 Hz, repetindo cada quadro) é descartado comparando com o anterior;
//   2. a IA (RIFE v4.6 cortado: devolve a grade de amostragem e a máscara, não a imagem) roda em 960x544;
//   3. o quadro do meio é montado em resolução cheia a partir da grade (que não depende da resolução);
//   4. o meio aparece assim que fica pronto e o quadro real meio período depois (ritmo pelo requestAnimationFrame).
// Fonte que já chega a mais de ~45 quadros diferentes por segundo passa direto, sem quadro gerado.
// A IA e o onnxruntime-web vêm do complemento baixado à parte (complemento://suavizar-1/).

const BASE = 'complemento://suavizar-1/';
const MW = 960, MH = 544; // resolução em que a IA calcula o movimento (múltiplos de 32)

// conta quantos pontos mudaram (1 a cada 4 pixels em cada direção): quadro repetido da placa é idêntico (dá 0);
// a média da tela inteira escondia movimento pequeno ou lento e descartava quadro de verdade
const WGSL_DIFERENCA = /* wgsl */`
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> soma: array<atomic<u32>, 1>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let tam = textureDimensions(a);
  let p = id.xy * 4u + 1u;
  if (p.x >= tam.x || p.y >= tam.y) { return; }
  let d = abs(textureLoad(a, p, 0).rgb - textureLoad(b, p, 0).rgb);
  if ((d.r + d.g + d.b) * 255.0 > 6.0) { atomicAdd(&soma[0], 1u); }
}`;

const WGSL_ENTRADA = /* wgsl */`
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var amostrador: sampler;
@group(0) @binding(3) var<storage, read_write> saida: array<f32>;
const W = ${MW}u; const H = ${MH}u;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= W || id.y >= H) { return; }
  let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(f32(W), f32(H));
  let ca = textureSampleLevel(a, amostrador, uv, 0.0).rgb;
  let cb = textureSampleLevel(b, amostrador, uv, 0.0).rgb;
  let n = W * H; let i = id.y * W + id.x;
  saida[i] = ca.r; saida[n + i] = ca.g; saida[2u * n + i] = ca.b;
  saida[3u * n + i] = cb.r; saida[4u * n + i] = cb.g; saida[5u * n + i] = cb.b;
  saida[6u * n + i] = 0.5;
  saida[7u * n + i] = 2.0 * f32(id.x) / f32(W - 1u) - 1.0;
  saida[8u * n + i] = 2.0 * f32(id.y) / f32(H - 1u) - 1.0;
  saida[9u * n + i] = 2.0 / f32(W - 1u);
  saida[10u * n + i] = 2.0 / f32(H - 1u);
}`;

const WGSL_MEIO = /* wgsl */`
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var amostrador: sampler;
@group(0) @binding(3) var<storage, read> grade: array<f32>;   // [2, H, W, 2]: onde buscar em A (0) e em B (1), de -1 a 1
@group(0) @binding(4) var<storage, read> mascara: array<f32>; // [1, 1, H, W]: peso de A
@group(0) @binding(5) var saida: texture_storage_2d<rgba8unorm, write>;
const W = ${MW}u; const H = ${MH}u;
fn g(q: u32, x: u32, y: u32) -> vec2<f32> { let k = ((q * H + y) * W + x) * 2u; return vec2<f32>(grade[k], grade[k + 1u]); }
fn m(x: u32, y: u32) -> f32 { return mascara[y * W + x]; }
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let tam = textureDimensions(saida);
  if (id.x >= tam.x || id.y >= tam.y) { return; }
  let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(tam);
  // posição na grade da IA (bilinear)
  let p = clamp(uv * vec2<f32>(f32(W), f32(H)) - 0.5, vec2<f32>(0.0), vec2<f32>(f32(W - 1u), f32(H - 1u)));
  let p0 = vec2<u32>(floor(p)); let p1 = min(p0 + 1u, vec2<u32>(W - 1u, H - 1u)); let f = p - floor(p);
  let ga = mix(mix(g(0u, p0.x, p0.y), g(0u, p1.x, p0.y), f.x), mix(g(0u, p0.x, p1.y), g(0u, p1.x, p1.y), f.x), f.y);
  let gb = mix(mix(g(1u, p0.x, p0.y), g(1u, p1.x, p0.y), f.x), mix(g(1u, p0.x, p1.y), g(1u, p1.x, p1.y), f.x), f.y);
  let pm = mix(mix(m(p0.x, p0.y), m(p1.x, p0.y), f.x), mix(m(p0.x, p1.y), m(p1.x, p1.y), f.x), f.y);
  // grade com align_corners: -1 = centro do primeiro pixel, 1 = centro do último (da grade da IA)
  let ua = ((ga + 1.0) * 0.5 * vec2<f32>(f32(W - 1u), f32(H - 1u)) + 0.5) / vec2<f32>(f32(W), f32(H));
  let ub = ((gb + 1.0) * 0.5 * vec2<f32>(f32(W - 1u), f32(H - 1u)) + 0.5) / vec2<f32>(f32(W), f32(H));
  let ca = textureSampleLevel(a, amostrador, ua, 0.0);
  let cb = textureSampleLevel(b, amostrador, ub, 0.0);
  textureStore(saida, id.xy, vec4<f32>(mix(cb.rgb, ca.rgb, pm), 1.0));
}`;

const WGSL_MOSTRAR = /* wgsl */`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var amostrador: sampler;
struct Saida { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> Saida {
  let xy = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));
  var s: Saida; s.pos = vec4<f32>(xy * 2.0 - 1.0, 0.0, 1.0); s.uv = vec2<f32>(xy.x, 1.0 - xy.y); return s;
}
@fragment fn fs(e: Saida) -> @location(0) vec4<f32> { return textureSample(t, amostrador, e.uv); }`;

export async function criarSuavizador({ video, canvas, aoEstado }) {
  if (!navigator.gpu) throw new Error('sem-webgpu');
  const ort = await import(BASE + 'ort.webgpu.min.mjs');
  ort.env.wasm.wasmPaths = BASE;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';
  const sessao = await ort.InferenceSession.create(BASE + 'rife46-fluxo.onnx', {
    executionProviders: ['webgpu'], graphOptimizationLevel: 'all', preferredOutputLocation: 'gpu-buffer',
  });
  const device = ort.env.webgpu.device;
  const contexto = canvas.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  contexto.configure({ device, format: formato, alphaMode: 'opaque' });
  const linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  const pDif = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: WGSL_DIFERENCA }), entryPoint: 'main' } });
  const pEnt = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: WGSL_ENTRADA }), entryPoint: 'main' } });
  const pMeio = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: WGSL_MEIO }), entryPoint: 'main' } });
  const mMostrar = device.createShaderModule({ code: WGSL_MOSTRAR });
  const pMostrar = device.createRenderPipeline({ layout: 'auto', vertex: { module: mMostrar, entryPoint: 'vs' }, fragment: { module: mMostrar, entryPoint: 'fs', targets: [{ format: formato }] }, primitive: { topology: 'triangle-list' } });

  const bufSoma = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const bufLeitura = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const bufEntrada = device.createBuffer({ size: 11 * MW * MH * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
  const tensorEntrada = ort.Tensor.fromGpuBuffer(bufEntrada, { dataType: 'float32', dims: [1, 11, MH, MW] });
  const nomeEntrada = sessao.inputNames[0];
  // aquecimento: a primeira rodada compila tudo na placa de vídeo (centenas de ms) e não pode contar como tempo da IA
  for (let k = 0; k < 3; k++) { const r0 = await sessao.run({ [nomeEntrada]: tensorEntrada }); await device.queue.onSubmittedWorkDone(); r0.grade.dispose(); r0.mascara.dispose(); }

  let W = 0, H = 0, quadros = [], meios = [];
  function texturas(w, h) {
    quadros.forEach((t) => t.destroy()); meios.forEach((t) => t.destroy());
    W = w; H = h; canvas.width = w; canvas.height = h;
    quadros = [0, 1, 2, 3].map(() => device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT }));
    meios = [0, 1].map(() => device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC }));
    anterior = -1; ultimo = -1;
  }

  // ---------------------------------------------------------------- estado
  let ligado = true, ocupado = false, lendoDif = false;
  let anterior = -1, ultimo = -1, mostrado = null, meioVez = 0, ultimoPar = null;
  let chegadaUltima = 0, periodo = 1000 / 30, ultimaTentativa = 0;
  const fila = []; // { tex, quando }
  const stats = { unicos: 0, gerados: 0, mostrados: 0, iaMs: 0, desde: performance.now(), modo: 'iniciando' };

  function mostrar(tex) {
    const enc = device.createCommandEncoder();
    const passe = enc.beginRenderPass({ colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    passe.setPipeline(pMostrar);
    passe.setBindGroup(0, device.createBindGroup({ layout: pMostrar.getBindGroupLayout(0), entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: linear }] }));
    passe.draw(3); passe.end();
    device.queue.submit([enc.finish()]);
    mostrado = tex; stats.mostrados++;
  }

  function livre() { for (let i = 0; i < quadros.length; i++) if (i !== anterior && i !== ultimo && quadros[i] !== mostrado && !fila.some((f) => f.tex === quadros[i])) return i; return -1; }

  async function diferente(i, j) {
    if (lendoDif) return true;
    lendoDif = true;
    const enc = device.createCommandEncoder();
    enc.clearBuffer(bufSoma);
    const pc = enc.beginComputePass();
    pc.setPipeline(pDif);
    pc.setBindGroup(0, device.createBindGroup({ layout: pDif.getBindGroupLayout(0), entries: [{ binding: 0, resource: quadros[i].createView() }, { binding: 1, resource: quadros[j].createView() }, { binding: 2, resource: { buffer: bufSoma } }] }));
    pc.dispatchWorkgroups(Math.ceil(W / 64), Math.ceil(H / 64)); pc.end();
    enc.copyBufferToBuffer(bufSoma, 0, bufLeitura, 0, 4);
    device.queue.submit([enc.finish()]);
    await bufLeitura.mapAsync(GPUMapMode.READ);
    const soma = new Uint32Array(bufLeitura.getMappedRange())[0];
    bufLeitura.unmap();
    lendoDif = false;
    return soma >= 3; // pontos que mudaram: quadro repetido dá 0
  }

  async function gerarMeio(a, b) {
    const t0 = performance.now();
    const enc = device.createCommandEncoder();
    const pc = enc.beginComputePass();
    pc.setPipeline(pEnt);
    pc.setBindGroup(0, device.createBindGroup({ layout: pEnt.getBindGroupLayout(0), entries: [{ binding: 0, resource: quadros[a].createView() }, { binding: 1, resource: quadros[b].createView() }, { binding: 2, resource: linear }, { binding: 3, resource: { buffer: bufEntrada } }] }));
    pc.dispatchWorkgroups(Math.ceil(MW / 16), Math.ceil(MH / 16)); pc.end();
    device.queue.submit([enc.finish()]);
    const r = await sessao.run({ [nomeEntrada]: tensorEntrada });
    const destino = meios[meioVez = 1 - meioVez];
    ultimoPar = { a, b, meio: destino };
    const enc2 = device.createCommandEncoder();
    const pc2 = enc2.beginComputePass();
    pc2.setPipeline(pMeio);
    pc2.setBindGroup(0, device.createBindGroup({ layout: pMeio.getBindGroupLayout(0), entries: [
      { binding: 0, resource: quadros[a].createView() }, { binding: 1, resource: quadros[b].createView() }, { binding: 2, resource: linear },
      { binding: 3, resource: { buffer: r.grade.gpuBuffer } }, { binding: 4, resource: { buffer: r.mascara.gpuBuffer } }, { binding: 5, resource: destino.createView() }] }));
    pc2.dispatchWorkgroups(Math.ceil(W / 16), Math.ceil(H / 16)); pc2.end();
    device.queue.submit([enc2.finish()]);
    await device.queue.onSubmittedWorkDone();
    r.grade.dispose(); r.mascara.dispose();
    const ms = performance.now() - t0;
    stats.iaMs = stats.iaMs ? stats.iaMs * 0.9 + ms * 0.1 : ms;
    return destino;
  }

  async function aoQuadro() {
    if (!ligado) return;
    video.requestVideoFrameCallback(aoQuadro);
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    if (w !== W || h !== H) texturas(w, h);
    const i = livre();
    if (i < 0) return;
    device.queue.copyExternalImageToTexture({ source: video }, { texture: quadros[i] }, [w, h]);
    if (ultimo >= 0 && !(await diferente(i, ultimo))) return; // quadro repetido
    const agora = performance.now();
    if (chegadaUltima) { const dt = agora - chegadaUltima; if (dt > 12 && dt < 70) periodo = periodo * 0.85 + dt * 0.15; }
    chegadaUltima = agora;
    stats.unicos++;
    anterior = ultimo; ultimo = i;
    const rapido = periodo < 22; // fonte já com mais de ~45 quadros diferentes por segundo
    // lento: continua tentando uma vez por segundo, para voltar sozinho quando a placa de vídeo folgar
    const lento = stats.iaMs > periodo * 0.9 && agora - ultimaTentativa < 1000;
    if (anterior < 0 || rapido || ocupado || lento) {
      stats.modo = rapido ? 'direto' : lento ? 'lento' : stats.modo === 'iniciando' ? 'iniciando' : 'ativo';
      fila.length = 0; fila.push({ tex: quadros[i], quando: 0 });
      return;
    }
    ocupado = true; ultimaTentativa = agora;
    const a = anterior, b = ultimo;
    try {
      const meio = await gerarMeio(a, b);
      stats.gerados++; stats.modo = 'ativo';
      const t = performance.now();
      fila.length = 0;
      fila.push({ tex: meio, quando: t }, { tex: quadros[b], quando: t + periodo / 2 });
    } catch (e) {
      stats.modo = 'erro'; console.error('suavizar', e);
      fila.length = 0; fila.push({ tex: quadros[b], quando: 0 });
    } finally { ocupado = false; }
  }

  function laco(agora) {
    if (!ligado) return;
    requestAnimationFrame(laco);
    while (fila.length && fila[0].quando <= agora + 1) {
      const f = fila.shift();
      if (!fila.length || fila[0].quando > agora + 1) { mostrar(f.tex); }
    }
    if (agora - stats.desde >= 1000 && aoEstado) {
      const s = (agora - stats.desde) / 1000;
      // nenhum quadro diferente no último segundo: imagem parada (menu, pausa) ou placa sem sinal
      aoEstado({ modo: stats.unicos === 0 && stats.modo !== 'erro' ? 'parado' : stats.modo, fonteFps: Math.round(stats.unicos / s), saidaFps: Math.round(stats.mostrados / s), iaMs: Math.round(stats.iaMs * 10) / 10 });
      stats.unicos = 0; stats.gerados = 0; stats.mostrados = 0; stats.desde = agora;
    }
  }

  video.requestVideoFrameCallback(aoQuadro);
  requestAnimationFrame(laco);
  // para conferir a qualidade (teste): copia o último par e o quadro do meio gerado entre eles
  async function ler(tex) {
    const linha = Math.ceil(W * 4 / 256) * 256;
    const buf = device.createBuffer({ size: linha * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: linha }, [W, H]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const bruto = new Uint8Array(buf.getMappedRange()); const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) px.set(bruto.subarray(y * linha, y * linha + W * 4), y * W * 4);
    buf.unmap(); buf.destroy();
    return px;
  }
  return {
    async amostra() {
      if (!ultimoPar) return null;
      const p = ultimoPar;
      return { largura: W, altura: H, a: await ler(quadros[p.a]), meio: await ler(p.meio), b: await ler(quadros[p.b]) };
    },
    parar() {
      ligado = false;
      setTimeout(() => { try { quadros.forEach((t) => t.destroy()); meios.forEach((t) => t.destroy()); bufEntrada.destroy(); sessao.release(); } catch (e) { /* já liberado */ } }, 200);
    },
  };
}
