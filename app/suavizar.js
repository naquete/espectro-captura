// Motor de imagem na placa de vídeo (WebGPU) do Espectro Captura. Liga quando a pessoa escolhe:
//   - FSR 1 (AMD FidelityFX Super Resolution 1, MIT): aumenta a resolução até o tamanho da tela (EASU) e dá nitidez
//     (RCAS). Não precisa de complemento.
//   - Suavizar movimento: gera quadros entre dois quadros do jogo até a meta de fps (60, 90 ou 120) com a IA RIFE v4.6,
//     cortada para devolver a grade de amostragem e a máscara de mistura (complemento baixado à parte). A quantidade de
//     quadros gerados sai do intervalo real entre os dois quadros (30 fps -> 1 para 60; 15 fps -> 3), limitada pelo tempo
//     que a placa de vídeo leva. Onde o pixel é igual nos dois quadros (legenda, HUD), o gerado copia o original.
// Fluxo da geração: cada quadro novo da placa é copiado para uma textura; quadro repetido (o PS5 manda 30 fps num sinal
// de 60 Hz) é descartado; a IA calcula o movimento numa resolução menor; o quadro do meio é montado em resolução cheia;
// os quadros saem em ritmo igual pelo requestAnimationFrame. Fonte com mais de ~45 quadros diferentes por segundo passa
// direto, sem quadro gerado.

const BASE = 'complemento://suavizar-1/';
const RESOLUCAO_IA = { rapido: [960, 544], qualidade: [1280, 736] }; // múltiplos de 32

// ------------------------------------------------------------------ shaders
// pontos que mudaram (1 a cada 4 pixels em cada direção): quadro repetido da placa é idêntico (dá 0)
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

// entrada da IA (11 canais, como no vs-mlrt): quadro A, quadro B, tempo, grade x, grade y, 2/(L-1), 2/(A-1)
const wgslEntrada = (W, H) => /* wgsl */`
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var amostrador: sampler;
@group(0) @binding(3) var<storage, read_write> saida: array<f32>;
@group(0) @binding(4) var<uniform> tempo: vec4<f32>;
const W = ${W}u; const H = ${H}u;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= W || id.y >= H) { return; }
  let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(f32(W), f32(H));
  let ca = textureSampleLevel(a, amostrador, uv, 0.0).rgb;
  let cb = textureSampleLevel(b, amostrador, uv, 0.0).rgb;
  let n = W * H; let i = id.y * W + id.x;
  saida[i] = ca.r; saida[n + i] = ca.g; saida[2u * n + i] = ca.b;
  saida[3u * n + i] = cb.r; saida[4u * n + i] = cb.g; saida[5u * n + i] = cb.b;
  saida[6u * n + i] = tempo.x;
  saida[7u * n + i] = 2.0 * f32(id.x) / f32(W - 1u) - 1.0;
  saida[8u * n + i] = 2.0 * f32(id.y) / f32(H - 1u) - 1.0;
  saida[9u * n + i] = 2.0 / f32(W - 1u);
  saida[10u * n + i] = 2.0 / f32(H - 1u);
}`;

// quadro do meio em resolução cheia a partir da grade (-1 a 1, align_corners) e da máscara (peso de A) da IA
const wgslMeio = (W, H) => /* wgsl */`
@group(0) @binding(0) var a: texture_2d<f32>;
@group(0) @binding(1) var b: texture_2d<f32>;
@group(0) @binding(2) var amostrador: sampler;
@group(0) @binding(3) var<storage, read> grade: array<f32>;   // [2, H, W, 2]
@group(0) @binding(4) var<storage, read> mascara: array<f32>; // [1, 1, H, W]
@group(0) @binding(5) var saida: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(6) var<uniform> ajuste: vec4<f32>; // x = proteger legenda e HUD (1) ou não (0)
const W = ${W}u; const H = ${H}u;
fn g(q: u32, x: u32, y: u32) -> vec2<f32> { let k = ((q * H + y) * W + x) * 2u; return vec2<f32>(grade[k], grade[k + 1u]); }
fn m(x: u32, y: u32) -> f32 { return mascara[y * W + x]; }
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let tam = textureDimensions(saida);
  if (id.x >= tam.x || id.y >= tam.y) { return; }
  let uv = (vec2<f32>(id.xy) + 0.5) / vec2<f32>(tam);
  let p = clamp(uv * vec2<f32>(f32(W), f32(H)) - 0.5, vec2<f32>(0.0), vec2<f32>(f32(W - 1u), f32(H - 1u)));
  let p0 = vec2<u32>(floor(p)); let p1 = min(p0 + 1u, vec2<u32>(W - 1u, H - 1u)); let f = p - floor(p);
  let ga = mix(mix(g(0u, p0.x, p0.y), g(0u, p1.x, p0.y), f.x), mix(g(0u, p0.x, p1.y), g(0u, p1.x, p1.y), f.x), f.y);
  let gb = mix(mix(g(1u, p0.x, p0.y), g(1u, p1.x, p0.y), f.x), mix(g(1u, p0.x, p1.y), g(1u, p1.x, p1.y), f.x), f.y);
  let pm = mix(mix(m(p0.x, p0.y), m(p1.x, p0.y), f.x), mix(m(p0.x, p1.y), m(p1.x, p1.y), f.x), f.y);
  let escala = vec2<f32>(f32(W - 1u), f32(H - 1u));
  let ua = ((ga + 1.0) * 0.5 * escala + 0.5) / vec2<f32>(f32(W), f32(H));
  let ub = ((gb + 1.0) * 0.5 * escala + 0.5) / vec2<f32>(f32(W), f32(H));
  let ca = textureSampleLevel(a, amostrador, ua, 0.0);
  let cb = textureSampleLevel(b, amostrador, ub, 0.0);
  var cor = mix(cb.rgb, ca.rgb, pm);
  // legenda, HUD e tudo que não mudou entre os dois quadros: copia o original em vez de deixar a IA arrastar
  if (ajuste.x > 0.5) {
    let sa = textureLoad(a, id.xy, 0).rgb; let sb = textureLoad(b, id.xy, 0).rgb;
    let dif = max(max(abs(sa.r - sb.r), abs(sa.g - sb.g)), abs(sa.b - sb.b));
    cor = mix((sa + sb) * 0.5, cor, smoothstep(0.012, 0.05, dif));
  }
  textureStore(saida, id.xy, vec4<f32>(cor, 1.0));
}`;

// FSR 1 EASU (aumento de resolução), traduzido de ffx_fsr1.h (AMD FidelityFX, MIT), versão 32 bits
const WGSL_EASU = /* wgsl */`
struct Con { c0: vec4<f32>, c1: vec4<f32>, c2: vec4<f32>, c3: vec4<f32> };
@group(0) @binding(0) var entrada: texture_2d<f32>;
@group(0) @binding(1) var amostrador: sampler;
@group(0) @binding(2) var saida: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> con: Con;
struct Dir { dir: vec2<f32>, len: f32 };
fn conjunto(acc: Dir, w: f32, lA: f32, lB: f32, lC: f32, lD: f32, lE: f32) -> Dir {
  var r = acc;
  let dc = lD - lC; let cb = lC - lB;
  var lenX = max(abs(dc), abs(cb)); lenX = 1.0 / max(lenX, 1e-8);
  let dirX = lD - lB;
  r.dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0); lenX *= lenX;
  r.len += lenX * w;
  let ec = lE - lC; let ca = lC - lA;
  var lenY = max(abs(ec), abs(ca)); lenY = 1.0 / max(lenY, 1e-8);
  let dirY = lE - lA;
  r.dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0); lenY *= lenY;
  r.len += lenY * w;
  return r;
}
struct Tap { c: vec3<f32>, w: f32 };
fn tap(acc: Tap, off: vec2<f32>, dir: vec2<f32>, len: vec2<f32>, lob: f32, clp: f32, c: vec3<f32>) -> Tap {
  var v = vec2<f32>(off.x * dir.x + off.y * dir.y, off.x * (-dir.y) + off.y * dir.x);
  v *= len;
  let d2 = min(v.x * v.x + v.y * v.y, clp);
  var wB = 2.0 / 5.0 * d2 - 1.0; var wA = lob * d2 - 1.0;
  wB *= wB; wA *= wA;
  wB = 25.0 / 16.0 * wB - (25.0 / 16.0 - 1.0);
  let w = wB * wA;
  return Tap(acc.c + c * w, acc.w + w);
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let tam = textureDimensions(saida);
  if (id.x >= tam.x || id.y >= tam.y) { return; }
  var pp = vec2<f32>(id.xy) * con.c0.xy + con.c0.zw;
  let fp = floor(pp); pp -= fp;
  let p0 = fp * con.c1.xy + con.c1.zw;
  let p1 = p0 + con.c2.xy; let p2 = p0 + con.c2.zw; let p3 = p0 + con.c3.xy;
  let bczzR = textureGather(0, entrada, amostrador, p0); let bczzG = textureGather(1, entrada, amostrador, p0); let bczzB = textureGather(2, entrada, amostrador, p0);
  let ijfeR = textureGather(0, entrada, amostrador, p1); let ijfeG = textureGather(1, entrada, amostrador, p1); let ijfeB = textureGather(2, entrada, amostrador, p1);
  let klhgR = textureGather(0, entrada, amostrador, p2); let klhgG = textureGather(1, entrada, amostrador, p2); let klhgB = textureGather(2, entrada, amostrador, p2);
  let zzonR = textureGather(0, entrada, amostrador, p3); let zzonG = textureGather(1, entrada, amostrador, p3); let zzonB = textureGather(2, entrada, amostrador, p3);
  let bczzL = bczzB * 0.5 + (bczzR * 0.5 + bczzG);
  let ijfeL = ijfeB * 0.5 + (ijfeR * 0.5 + ijfeG);
  let klhgL = klhgB * 0.5 + (klhgR * 0.5 + klhgG);
  let zzonL = zzonB * 0.5 + (zzonR * 0.5 + zzonG);
  let bL = bczzL.x; let cL = bczzL.y; let iL = ijfeL.x; let jL = ijfeL.y; let fL = ijfeL.z; let eL = ijfeL.w;
  let kL = klhgL.x; let lL = klhgL.y; let hL = klhgL.z; let gL = klhgL.w; let oL = zzonL.z; let nL = zzonL.w;
  var d = Dir(vec2<f32>(0.0), 0.0);
  d = conjunto(d, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  d = conjunto(d, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  d = conjunto(d, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  d = conjunto(d, pp.x * pp.y, gL, jL, kL, lL, oL);
  let dir2 = d.dir * d.dir;
  var dirR = dir2.x + dir2.y;
  let zro = dirR < 1.0 / 32768.0;
  dirR = inverseSqrt(max(dirR, 1e-12));
  var dir = d.dir;
  if (zro) { dirR = 1.0; dir.x = 1.0; }
  dir *= dirR;
  var len = d.len * 0.5; len *= len;
  let stretch = (dir.x * dir.x + dir.y * dir.y) / max(abs(dir.x), abs(dir.y));
  let len2 = vec2<f32>(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  let lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  let clp = 1.0 / lob;
  let mn4 = min(min(vec3<f32>(ijfeR.z, ijfeG.z, ijfeB.z), vec3<f32>(klhgR.w, klhgG.w, klhgB.w)), min(vec3<f32>(ijfeR.y, ijfeG.y, ijfeB.y), vec3<f32>(klhgR.x, klhgG.x, klhgB.x)));
  let mx4 = max(max(vec3<f32>(ijfeR.z, ijfeG.z, ijfeB.z), vec3<f32>(klhgR.w, klhgG.w, klhgB.w)), max(vec3<f32>(ijfeR.y, ijfeG.y, ijfeB.y), vec3<f32>(klhgR.x, klhgG.x, klhgB.x)));
  var t = Tap(vec3<f32>(0.0), 0.0);
  t = tap(t, vec2<f32>(0.0, -1.0) - pp, dir, len2, lob, clp, vec3<f32>(bczzR.x, bczzG.x, bczzB.x));
  t = tap(t, vec2<f32>(1.0, -1.0) - pp, dir, len2, lob, clp, vec3<f32>(bczzR.y, bczzG.y, bczzB.y));
  t = tap(t, vec2<f32>(-1.0, 1.0) - pp, dir, len2, lob, clp, vec3<f32>(ijfeR.x, ijfeG.x, ijfeB.x));
  t = tap(t, vec2<f32>(0.0, 1.0) - pp, dir, len2, lob, clp, vec3<f32>(ijfeR.y, ijfeG.y, ijfeB.y));
  t = tap(t, vec2<f32>(0.0, 0.0) - pp, dir, len2, lob, clp, vec3<f32>(ijfeR.z, ijfeG.z, ijfeB.z));
  t = tap(t, vec2<f32>(-1.0, 0.0) - pp, dir, len2, lob, clp, vec3<f32>(ijfeR.w, ijfeG.w, ijfeB.w));
  t = tap(t, vec2<f32>(1.0, 1.0) - pp, dir, len2, lob, clp, vec3<f32>(klhgR.x, klhgG.x, klhgB.x));
  t = tap(t, vec2<f32>(2.0, 1.0) - pp, dir, len2, lob, clp, vec3<f32>(klhgR.y, klhgG.y, klhgB.y));
  t = tap(t, vec2<f32>(2.0, 0.0) - pp, dir, len2, lob, clp, vec3<f32>(klhgR.z, klhgG.z, klhgB.z));
  t = tap(t, vec2<f32>(1.0, 0.0) - pp, dir, len2, lob, clp, vec3<f32>(klhgR.w, klhgG.w, klhgB.w));
  t = tap(t, vec2<f32>(1.0, 2.0) - pp, dir, len2, lob, clp, vec3<f32>(zzonR.z, zzonG.z, zzonB.z));
  t = tap(t, vec2<f32>(0.0, 2.0) - pp, dir, len2, lob, clp, vec3<f32>(zzonR.w, zzonG.w, zzonB.w));
  let c = min(mx4, max(mn4, t.c / t.w));
  textureStore(saida, id.xy, vec4<f32>(c, 1.0));
}`;

// FSR 1 RCAS (nitidez com limite de contraste), traduzido de ffx_fsr1.h (AMD FidelityFX, MIT)
const WGSL_RCAS = /* wgsl */`
@group(0) @binding(0) var entrada: texture_2d<f32>;
@group(0) @binding(1) var saida: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> nitidez: vec4<f32>; // x = exp2(-stops)
const LIMITE = 0.25 - 1.0 / 16.0;
fn ler(p: vec2<i32>, tam: vec2<i32>) -> vec3<f32> { return textureLoad(entrada, clamp(p, vec2<i32>(0), tam - 1), 0).rgb; }
fn max3(a: f32, b: f32, c: f32) -> f32 { return max(a, max(b, c)); }
fn min3(a: f32, b: f32, c: f32) -> f32 { return min(a, min(b, c)); }
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let tam = vec2<i32>(textureDimensions(entrada));
  let sp = vec2<i32>(id.xy);
  if (sp.x >= tam.x || sp.y >= tam.y) { return; }
  //    b
  //  d e f
  //    h
  let b = ler(sp + vec2<i32>(0, -1), tam); let d = ler(sp + vec2<i32>(-1, 0), tam); let e = ler(sp, tam);
  let f = ler(sp + vec2<i32>(1, 0), tam); let h = ler(sp + vec2<i32>(0, 1), tam);
  let bL = b.b * 0.5 + (b.r * 0.5 + b.g); let dL = d.b * 0.5 + (d.r * 0.5 + d.g); let eL = e.b * 0.5 + (e.r * 0.5 + e.g);
  let fL = f.b * 0.5 + (f.r * 0.5 + f.g); let hL = h.b * 0.5 + (h.r * 0.5 + h.g);
  var nz = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
  nz = clamp(abs(nz) / max(max3(max3(bL, dL, eL), fL, hL) - min3(min3(bL, dL, eL), fL, hL), 1e-6), 0.0, 1.0);
  nz = -0.5 * nz + 1.0;
  let mn4 = min(min(b, d), min(f, h)); let mx4 = max(max(b, d), max(f, h));
  let peak = vec2<f32>(1.0, -4.0);
  let hitMin = min(mn4, e) / max(4.0 * mx4, vec3<f32>(1e-6));
  let hitMax = (peak.x - max(mx4, e)) / min(4.0 * mn4 + peak.y, vec3<f32>(-1e-6));
  let lobeRGB = max(-hitMin, hitMax);
  var lobe = max(-LIMITE, min(max3(lobeRGB.r, lobeRGB.g, lobeRGB.b), 0.0)) * nitidez.x;
  lobe *= nz;
  let c = (lobe * (b + d + h + f) + e) / (4.0 * lobe + 1.0);
  textureStore(saida, id.xy, vec4<f32>(clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0));
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

// opcoes: { gerar, alvo (fps: 60|90|120), qualidade ('rapido'|'qualidade'), proteger (legenda/HUD), fsr, nitidez (0 a 100) }
export async function criarMotor({ video, canvas, opcoes, aoEstado }) {
  if (!navigator.gpu) throw new Error('sem-webgpu');
  const gerar = Boolean(opcoes.gerar);
  const alvo = [60, 90, 120].includes(Number(opcoes.alvo)) ? Number(opcoes.alvo) : 60;
  const [MW, MH] = RESOLUCAO_IA[opcoes.qualidade === 'qualidade' ? 'qualidade' : 'rapido'];
  const fsr = Boolean(opcoes.fsr);

  // a IA (onnxruntime-web) cria a placa de vídeo dela; sem IA, o motor pede uma
  let ort = null, sessao = null, device;
  if (gerar) {
    ort = await import(BASE + 'ort.webgpu.min.mjs');
    ort.env.wasm.wasmPaths = BASE; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.logLevel = 'error';
    sessao = await ort.InferenceSession.create(BASE + 'rife46-fluxo.onnx', { executionProviders: ['webgpu'], graphOptimizationLevel: 'all', preferredOutputLocation: 'gpu-buffer' });
    device = ort.env.webgpu.device;
  } else {
    const adaptador = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adaptador) throw new Error('sem-webgpu');
    device = await adaptador.requestDevice();
  }
  const contexto = canvas.getContext('webgpu');
  const formato = navigator.gpu.getPreferredCanvasFormat();
  contexto.configure({ device, format: formato, alphaMode: 'opaque' });
  const linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const comp = (code) => device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
  const pDif = gerar ? comp(WGSL_DIFERENCA) : null;
  const pEnt = gerar ? comp(wgslEntrada(MW, MH)) : null;
  const pMeio = gerar ? comp(wgslMeio(MW, MH)) : null;
  const pEasu = comp(WGSL_EASU);
  const pRcas = comp(WGSL_RCAS);
  const mMostrar = device.createShaderModule({ code: WGSL_MOSTRAR });
  const pMostrar = device.createRenderPipeline({ layout: 'auto', vertex: { module: mMostrar, entryPoint: 'vs' }, fragment: { module: mMostrar, entryPoint: 'fs', targets: [{ format: formato }] }, primitive: { topology: 'triangle-list' } });

  const bufCon = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bufNitidez = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bufTempo = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bufAjuste = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(bufAjuste, 0, new Float32Array([opcoes.proteger === false ? 0 : 1, 0, 0, 0]));
  function definirNitidez(pct) {
    const stops = 2 * (1 - Math.max(0, Math.min(100, Number(pct) || 0)) / 100); // 100% = 0 stop (o máximo da AMD)
    device.queue.writeBuffer(bufNitidez, 0, new Float32Array([Math.pow(2, -stops), 0, 0, 0]));
  }
  definirNitidez(opcoes.nitidez ?? 75);

  let bufSoma = null, bufLeitura = null, bufEntrada = null, tensorEntrada = null, nomeEntrada = null;
  if (gerar) {
    bufSoma = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    bufLeitura = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    bufEntrada = device.createBuffer({ size: 11 * MW * MH * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    tensorEntrada = ort.Tensor.fromGpuBuffer(bufEntrada, { dataType: 'float32', dims: [1, 11, MH, MW] });
    nomeEntrada = sessao.inputNames[0];
    // aquecimento: a primeira rodada compila tudo na placa de vídeo (centenas de ms) e não pode contar como tempo da IA
    for (let k = 0; k < 3; k++) { const r0 = await sessao.run({ [nomeEntrada]: tensorEntrada }); await device.queue.onSubmittedWorkDone(); r0.grade.dispose(); r0.mascara.dispose(); }
  }

  // ------------------------------------------------------------------ estado
  let ligado = true, ocupado = false, lendoDif = false;
  let anterior = -1, ultimo = -1, mostrado = null, meioVez = 0, ultimoPar = null;
  let chegadaUltima = 0, periodo = 1000 / 30, vez = 0, dtUltimo = 0, pendente = false, ultimoQuando = 0;
  let emUso = []; // par que a IA está usando agora (não pode ser sobrescrito)
  const fila = []; // { tex, quando }
  const stats = { unicos: 0, mostrados: 0, gerados: 0, iaMs: 0, desde: performance.now(), modo: gerar ? 'iniciando' : 'fsr' };

  // ------------------------------------------------------------------ texturas e tamanho de saída
  let W = 0, H = 0, quadros = [], meios = [];
  let SW = 0, SH = 0, texAumento = null, texNitida = null; // saída do FSR
  function texturas(w, h) {
    quadros.forEach((t) => t.destroy()); meios.forEach((t) => t.destroy());
    W = w; H = h;
    const uso = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT;
    quadros = [0, 1, 2, 3].map(() => device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: uso }));
    meios = gerar ? [0, 1, 2, 3].map(() => device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC })) : [];
    anterior = -1; ultimo = -1; mostrado = null; fila.length = 0; SW = 0;
    ajustarSaida();
  }
  // FSR: saída no tamanho em que a imagem aparece na tela (pixels de verdade), conforme o encaixe da imagem
  function ajustarSaida() {
    if (!W) return;
    let sw = W, sh = H;
    if (fsr) {
      const dpr = window.devicePixelRatio || 1;
      const bw = Math.round(canvas.clientWidth * dpr), bh = Math.round(canvas.clientHeight * dpr);
      const ajuste = getComputedStyle(canvas).objectFit;
      if (bw > 0 && bh > 0) {
        if (ajuste === 'fill') { sw = bw; sh = bh; } else {
          const k = ajuste === 'cover' ? Math.max(bw / W, bh / H) : Math.min(bw / W, bh / H);
          sw = Math.round(W * k); sh = Math.round(H * k);
        }
      }
      sw = Math.max(W, Math.min(7680, sw)); sh = Math.max(H, Math.min(4320, sh)); // FSR só aumenta
    }
    if (sw === SW && sh === SH && canvas.width === sw) return;
    SW = sw; SH = sh; canvas.width = sw; canvas.height = sh;
    if (texAumento) texAumento.destroy();
    if (texNitida) texNitida.destroy();
    const uso = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING;
    texAumento = device.createTexture({ size: [sw, sh], format: 'rgba8unorm', usage: uso });
    texNitida = device.createTexture({ size: [sw, sh], format: 'rgba8unorm', usage: uso });
    device.queue.writeBuffer(bufCon, 0, new Float32Array([
      W / sw, H / sh, 0.5 * W / sw - 0.5, 0.5 * H / sh - 0.5,
      1 / W, 1 / H, 1 / W, -1 / H,
      -1 / W, 2 / H, 1 / W, 2 / H,
      0, 4 / H, 0, 0,
    ]));
    if (mostrado) mostrar(mostrado);
  }
  const observador = new ResizeObserver(() => ajustarSaida());
  observador.observe(canvas);

  // ------------------------------------------------------------------ mostrar (com FSR, se ligado)
  const bind = (p, recursos) => device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: recursos.map((resource, binding) => ({ binding, resource })) });
  function mostrar(tex) {
    const enc = device.createCommandEncoder();
    let final = tex;
    if (fsr) {
      const aumentar = SW > W + 1 || SH > H + 1;
      const pc = enc.beginComputePass();
      if (aumentar) {
        pc.setPipeline(pEasu); pc.setBindGroup(0, bind(pEasu, [tex.createView(), linear, texAumento.createView(), { buffer: bufCon }]));
        pc.dispatchWorkgroups(Math.ceil(SW / 16), Math.ceil(SH / 16));
      }
      pc.setPipeline(pRcas); pc.setBindGroup(0, bind(pRcas, [(aumentar ? texAumento : tex).createView(), texNitida.createView(), { buffer: bufNitidez }]));
      pc.dispatchWorkgroups(Math.ceil((aumentar ? SW : W) / 16), Math.ceil((aumentar ? SH : H) / 16));
      pc.end();
      final = texNitida;
    }
    const passe = enc.beginRenderPass({ colorAttachments: [{ view: contexto.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    passe.setPipeline(pMostrar); passe.setBindGroup(0, bind(pMostrar, [final.createView(), linear]));
    passe.draw(3); passe.end();
    device.queue.submit([enc.finish()]);
    mostrado = tex; stats.mostrados++;
  }

  function livre() {
    for (let k = 0; k < quadros.length; k++) {
      const i = (vez + k) % quadros.length;
      if (i !== anterior && i !== ultimo && !emUso.includes(i) && quadros[i] !== mostrado && !fila.some((f) => f.tex === quadros[i])) { vez = i + 1; return i; }
    }
    return -1;
  }

  // null = outra comparação em andamento: o quadro é pulado (o seguinte, igual a ele, entra no lugar)
  async function diferente(i, j) {
    if (lendoDif) return null;
    lendoDif = true;
    const enc = device.createCommandEncoder();
    enc.clearBuffer(bufSoma);
    const pc = enc.beginComputePass();
    pc.setPipeline(pDif); pc.setBindGroup(0, bind(pDif, [quadros[i].createView(), quadros[j].createView(), { buffer: bufSoma }]));
    pc.dispatchWorkgroups(Math.ceil(W / 64), Math.ceil(H / 64)); pc.end();
    enc.copyBufferToBuffer(bufSoma, 0, bufLeitura, 0, 4);
    device.queue.submit([enc.finish()]);
    await bufLeitura.mapAsync(GPUMapMode.READ);
    const soma = new Uint32Array(bufLeitura.getMappedRange())[0];
    bufLeitura.unmap();
    lendoDif = false;
    return soma >= 3;
  }

  // gera o quadro entre a e b no tempo t (0 a 1)
  async function gerarMeio(a, b, t) {
    const t0 = performance.now();
    {
      device.queue.writeBuffer(bufTempo, 0, new Float32Array([t, 0, 0, 0]));
      const enc = device.createCommandEncoder();
      const pc = enc.beginComputePass();
      pc.setPipeline(pEnt); pc.setBindGroup(0, bind(pEnt, [quadros[a].createView(), quadros[b].createView(), linear, { buffer: bufEntrada }, { buffer: bufTempo }]));
      pc.dispatchWorkgroups(Math.ceil(MW / 16), Math.ceil(MH / 16)); pc.end();
      device.queue.submit([enc.finish()]);
      const r = await sessao.run({ [nomeEntrada]: tensorEntrada });
      const destino = meios[meioVez = (meioVez + 1) % meios.length];
      const enc2 = device.createCommandEncoder();
      const pc2 = enc2.beginComputePass();
      pc2.setPipeline(pMeio); pc2.setBindGroup(0, bind(pMeio, [quadros[a].createView(), quadros[b].createView(), linear, { buffer: r.grade.gpuBuffer }, { buffer: r.mascara.gpuBuffer }, destino.createView(), { buffer: bufAjuste }]));
      pc2.dispatchWorkgroups(Math.ceil(W / 16), Math.ceil(H / 16)); pc2.end();
      device.queue.submit([enc2.finish()]);
      await device.queue.onSubmittedWorkDone();
      r.grade.dispose(); r.mascara.dispose();
      const ms = performance.now() - t0;
      stats.iaMs = stats.iaMs ? stats.iaMs * 0.9 + ms * 0.1 : ms;
      if (t >= 0.45 && t <= 0.55 || !ultimoPar) ultimoPar = { a, b, meio: destino };
      return destino;
    }
  }

  function agendar(tex, quando) {
    const q = Math.max(quando, ultimoQuando);
    fila.push({ tex, quando: q });
    ultimoQuando = q;
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
    if (!gerar) { stats.unicos++; ultimo = i; fila.length = 0; fila.push({ tex: quadros[i], quando: 0 }); return; }
    if (ultimo >= 0) { const d = await diferente(i, ultimo); if (!d) return; } // repetido ou sem conferir
    const agora = performance.now();
    dtUltimo = chegadaUltima ? agora - chegadaUltima : 0;
    if (dtUltimo > 5 && dtUltimo < 500) periodo = periodo * 0.85 + dtUltimo * 0.15;
    chegadaUltima = agora;
    stats.unicos++;
    anterior = ultimo; ultimo = i;
    if (ocupado) { pendente = true; return; } // a IA ainda está no par anterior: este entra em seguida
    processar();
  }

  // gera os quadros do par (anterior, ultimo); se chegar outro quadro no meio, emenda o próximo par em seguida
  async function processar() {
    ocupado = true;
    try {
      do {
        pendente = false;
        const a = anterior, b = ultimo, dt = dtUltimo;
        // quantos quadros faltam para chegar na meta, e quantos a placa de vídeo consegue no intervalo
        const passoAlvo = 1000 / alvo;
        const faltam = dt > 0 && dt < 500 ? Math.round(dt / passoAlvo) - 1 : 0; // mais de meio segundo parado = pausa
        const cabem = stats.iaMs ? Math.floor((dt * 0.85) / stats.iaMs) : 1;
        const n = Math.max(0, Math.min(faltam, cabem, 40));
        const agora = performance.now();
        if (ultimoQuando < agora - 100) ultimoQuando = 0; // fila parada há tempo: não segura o quadro novo
        if (a < 0 || n === 0) {
          stats.modo = faltam <= 0 && dt > 0 && dt < 500 ? 'direto' : faltam > 0 && cabem <= 0 ? 'lento' : stats.modo === 'iniciando' ? 'iniciando' : 'ativo';
          agendar(quadros[b], agora);
          continue;
        }
        emUso = [a, b];
        // cada quadro gerado aparece assim que fica pronto (ou no seu horário); depois, o quadro real
        const passo = dt / (n + 1);
        let inicio = 0;
        for (let k = 1; k <= n && ligado; k++) {
          const tex = await gerarMeio(a, b, k / (n + 1));
          const agoraK = performance.now();
          if (k === 1) inicio = Math.max(agoraK, ultimoQuando + passo * 0.5);
          agendar(tex, Math.max(agoraK, inicio + (k - 1) * passo));
          stats.gerados++;
        }
        agendar(quadros[b], inicio + n * passo);
        emUso = [];
        stats.modo = 'ativo';
      } while (pendente && ligado);
    } catch (e) {
      stats.modo = 'erro'; console.error('suavizar', e);
      emUso = []; fila.length = 0; ultimoQuando = 0; fila.push({ tex: quadros[ultimo], quando: 0 });
    } finally { ocupado = false; }
  }

  function laco(agora) {
    if (!ligado) return;
    requestAnimationFrame(laco);
    let escolhido = null;
    while (fila.length && fila[0].quando <= agora + 1) escolhido = fila.shift();
    if (escolhido) mostrar(escolhido.tex);
    if (agora - stats.desde >= 1000 && aoEstado) {
      const s = (agora - stats.desde) / 1000;
      const modo = gerar && stats.unicos === 0 && stats.modo !== 'erro' ? 'parado' : stats.modo;
      aoEstado({ modo, gerar, fsr, alvo, fonteFps: Math.round(stats.unicos / s), saidaFps: Math.round(stats.mostrados / s), iaMs: Math.round(stats.iaMs * 10) / 10, entrada: W + 'x' + H, saida: SW + 'x' + SH });
      stats.unicos = 0; stats.mostrados = 0; stats.gerados = 0; stats.desde = agora;
    }
  }

  // para conferir a qualidade (teste): copia o último par e o primeiro quadro gerado entre eles
  async function ler(tex, w, h) {
    const linha = Math.ceil(w * 4 / 256) * 256;
    const buf = device.createBuffer({ size: linha * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: linha }, [w, h]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const bruto = new Uint8Array(buf.getMappedRange()); const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) px.set(bruto.subarray(y * linha, y * linha + w * 4), y * w * 4);
    buf.unmap(); buf.destroy();
    return px;
  }

  video.requestVideoFrameCallback(aoQuadro);
  requestAnimationFrame(laco);
  return {
    nitidez: definirNitidez,
    async amostra() {
      if (!ultimoPar) return null;
      const p = ultimoPar;
      return { largura: W, altura: H, a: await ler(quadros[p.a], W, H), meio: await ler(p.meio, W, H), b: await ler(quadros[p.b], W, H) };
    },
    parar() {
      ligado = false; observador.disconnect();
      setTimeout(() => {
        try {
          quadros.forEach((t) => t.destroy()); meios.forEach((t) => t.destroy());
          if (texAumento) texAumento.destroy();
          if (texNitida) texNitida.destroy();
          if (bufEntrada) bufEntrada.destroy();
          if (sessao) sessao.release();
          if (!gerar) device.destroy();
        } catch (e) { /* já liberado */ }
      }, 200);
    },
  };
}
