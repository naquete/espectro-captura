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
  e espelhar.
- **Gravar:** print (P), replay dos últimos 15 segundos a 5 minutos (R) e gravação em MP4 (G), em Imagens e Vídeos.
- **Programa:** português, inglês e espanhol; sempre por cima; abrir em tela cheia; abrir com o Windows; ícone perto do
  relógio; atalhos globais (Ctrl+Alt+tecla); perfis; atualização só com clique; relato de problema e sugestão de dentro
  do programa.

Nada de imagem ou som sai do computador. O programa só se conecta para procurar versão nova e quando a pessoa escolhe
mandar um relato.

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

© 2026 Espectro Soluções. Todos os direitos reservados. O Mediabunny, em `app/vendor/`, segue a licença MPL-2.0 dele.
