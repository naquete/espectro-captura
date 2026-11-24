# Espectro Captura

Programa grátis para Windows que mostra a imagem e toca o som de **qualquer placa de captura** que o Windows reconheça
como câmera e microfone (Elgato, AVerMedia, Razer, Magewell, Blackmagic, Hauppauge, as genéricas "USB3.0 Capture" etc.),
com controle de volume de verdade e sem OBS. Feito para jogar o console pela tela do PC.

Página e download: https://espectrosolucoes.com.br/captura (também em [inglês](https://espectrosolucoes.com.br/en/captura)
e [espanhol](https://espectrosolucoes.com.br/es/captura)). Da [Espectro Soluções](https://espectrosolucoes.com.br).

*A free Windows app to view and hear any capture card with real volume control, no OBS. Available in English,
Portuguese and Spanish.*

## O que faz

- **Placa:** acha a placa sozinho (nunca confunde com a webcam), qualidade de 720p a 4K com a taxa de quadros escolhida,
  encaixe, proporção (16:9, 4:3, 21:9, esticar), zoom com arraste, contador de FPS e aviso de "sem sinal".
- **Som:** volume de 0 a 200%, saída escolhida, estabilidade do som (latência), atraso do som, equalizador com estilos
  prontos, modo noturno, ampliar estéreo, balanço e mono.
- **Imagem:** brilho, contraste, saturação, tom, nitidez, Realce HDR, modo retrô (pixels nítidos), efeito de TV de tubo
  e espelhar. **FSR 1 (AMD):** aumenta a resolução até a tela e dá nitidez, em qualquer placa de vídeo.
  **Suavizar movimento (experimental):** uma IA na placa de vídeo gera quadros até a meta de fps (60, 90 ou 120; se o
  jogo cair para 15, ela completa a diferença), com proteção de legenda e HUD e um complemento que só baixa se a pessoa
  quiser.
- **Gravar:** print (P), replay dos últimos 15 segundos a 5 minutos (R) e gravação em MP4 (G), em Imagens e Vídeos.
- **Programa:** português, inglês e espanhol; sempre por cima; abrir em tela cheia; abrir com o Windows; ícone perto do
  relógio; atalhos globais (Ctrl+Alt+tecla); perfis; atualização só com clique; relato de problema e sugestão de dentro
  do programa.

Nada de imagem ou som sai do computador. O programa só se conecta para procurar versão nova, para baixar o complemento
do Suavizar movimento (só quando a pessoa pede) e quando a pessoa escolhe mandar um relato.

## Como é feito

Electron (janela isolada: `contextIsolation`, `sandbox`, sem Node na página, só a página local com permissão de câmera
e microfone). Imagem num `<video>` mudo; som pela Web Audio API (atraso, três filtros, compressor, balanço, meio e lados,
mono, volume). Gravação com WebCodecs (H.264 na placa de vídeo e AAC) e o MP4 montado pelo
[Mediabunny](https://github.com/Vanilagy/mediabunny) (MPL-2.0, cópia em `app/vendor/` com a licença).

| Arquivo | O quê |
|---|---|
| `main.js` | janela, permissões, atualização, atalhos globais, bandeja, arquivos de gravação, aviso de travamento |
| `preload.js` | a ponte `window.espectro` entre a página e o programa |
| `app/app.js` | placa, som, imagem, ajustes, perfis |
| `app/gravacao.js` | print, replay e gravação |
| `app/idiomas.js` | textos em inglês e espanhol |
| `app/suavizar.js` | motor de imagem (WebGPU): FSR 1 (EASU e RCAS traduzidos de `ffx_fsr1.h`, AMD, MIT) e Suavizar movimento (descarta quadro repetido, roda a IA, monta os quadros gerados) |
| `complementos.js` | complemento baixado à parte: download conferido por SHA-256 e o endereço privado `complemento://` |

## Complemento: Suavizar movimento

Não vem no instalador. Em Ajustes > Imagem, a pessoa baixa (48 MB) do servidor da Espectro; cada arquivo só é usado se o
SHA-256 bater com o de `complementos.js`. Fica na pasta de dados do programa e sai com "Remover o complemento".

- **IA:** RIFE v4.6 ([Practical-RIFE](https://github.com/hzwer/Practical-RIFE), MIT), em ONNX pelo
  [vs-mlrt](https://github.com/AmusementClub/vs-mlrt) (GPL-3.0), cortado para devolver a grade de amostragem e a máscara
  de mistura em vez da imagem pronta. A IA calcula o movimento em 960x544 (13 a 16 ms numa RTX 5070) e o quadro do meio
  é montado em resolução cheia pela placa de vídeo.
- **Motor:** [ONNX Runtime Web](https://onnxruntime.ai) 1.31.1 (MIT) com WebGPU.
- **Ritmo:** quadro repetido (o PS5 manda 30 fps num sinal de 60 Hz) é descartado. Para cada par, o motor mede o
  intervalo real e gera os quadros que faltam até a meta (30 fps: 1 para 60; 15 fps: 3), até onde a placa de vídeo
  dá conta no intervalo; cada um aparece assim que fica pronto e o quadro real em seguida. Quadro que chega durante a
  geração espera a vez. Fonte já na meta passa direto; mais de meio segundo parado conta como pausa. O som ganha 35 ms
  de atraso para continuar junto da imagem.
- **Legenda e HUD:** onde o pixel é igual nos dois quadros reais, o gerado copia o original em vez do que a IA arrastou.
- O LEIA-ME do complemento traz as licenças.
- Teste: `ESPECTRO_CAPTURA_TESTE_FORA=1` abre a janela de teste fora da tela, sem pegar o foco (escondida, o Windows
  quase para de desenhar e o ritmo não dá para medir); `window.EC.suavizarAmostra()` devolve o último par e o quadro
  gerado entre eles.

## Rodar e gerar o instalador

    npm install
    npm start                 # abre o programa
    npm run instalador        # gera dist/Espectro-Captura-Setup-<versão>.exe

## Atualização (só com clique)

Ao abrir, o programa só PROCURA versão nova em `https://espectrosolucoes.com.br/atualizacoes/espectro-captura/`.
Havendo, aparece "Atualizar para X" na barra e em Ajustes; o clique baixa, e "Reiniciar e instalar" instala em
silêncio e abre o programa de novo. Nada é baixado nem instalado sem clique (`autoDownload` e `autoInstallOnAppQuit`
desligados).

Publicar uma versão: aumentar `version` no package.json, `npm run instalador` e `sh publicar-atualizacao.sh` (o servidor
e a chave vêm de variáveis de ambiente ou de um arquivo fora do repositório; ver o topo do script).

## Testes sem janela

    ESPECTRO_CAPTURA_TESTE=<print.png> npx electron .

Abre escondido, tira um print e fecha. Com `ESPECTRO_CAPTURA_TESTE_FALSO=1`, usa câmera e microfone falsos do Chromium
(som mudo, preferências e arquivos numa pasta temporária). Com `ESPECTRO_CAPTURA_TESTE_ROTEIRO=<arquivo.js>`, roda o
arquivo na página antes do print (corpo de função assíncrona; o retorno sai no console como `roteiro: ...`).

## Licença

Código aberto sob a licença [GNU GPL 3.0 ou posterior](LICENSE). © 2026 Espectro Soluções.

Você pode usar, estudar, mudar e redistribuir o programa. Quem distribuir uma versão modificada precisa entregar o
código dela com a mesma licença. O Mediabunny, em `app/vendor/`, segue a licença MPL-2.0 dele.
