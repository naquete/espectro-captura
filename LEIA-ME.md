# Espectro Captura

Programa para Windows que mostra e toca QUALQUER placa de captura que o Windows reconheça como câmera e microfone
(Elgato, AVerMedia, Razer, Magewell, Blackmagic, as genéricas "USB3.0 Capture" etc.) com controle de volume de
verdade, sem OBS. Pedido do João em 22/11/2026 (a dele é uma Elgato HD60 X).

- Escolha automática: a imagem com nome de placa de captura (e nunca uma webcam, se houver outra opção); o som com
  nome parecido com o da imagem. Sem achar o som da placa, não pega o microfone: abre os Ajustes para a pessoa
  escolher. Na primeira vez com mais de uma câmera, também abre os Ajustes para conferir.

- Imagem no `<video>` (mudo) e som por Web Audio com ganho próprio: volume de 0 a 200%, mudo, escolha da saída de
  som, sem cancelamento de eco, redução de ruído nem ganho automático.
- Atalhos: M mudo; setas para cima e para baixo ou roda do mouse mudam o volume em 5%; F, F11 ou duplo clique para tela cheia.
- Guarda placa, entrada de som, saída, qualidade, encaixe e volume para a próxima vez.
- Placa usada por outro programa (app da Elgato, OBS): avisa e tem "Tentar de novo".
- Só abre a página local; câmera e microfone liberados só para ela.

## Rodar e gerar o instalador

    npm install
    npm start                 # abre o programa
    npm run instalador        # gera dist/Espectro Captura Setup <versão>.exe

## Atualização (só com clique)

Ao abrir, o programa só PROCURA versão nova em `https://espectrosolucoes.com.br/atualizacoes/espectro-captura/`
(pasta `/opt/espectro-captura/public` na VPS do Espectro, rota no Caddy). Havendo, aparece "Atualizar para X" na barra
e em Ajustes; o clique baixa, e depois "Reiniciar e instalar". Nada é baixado nem instalado sem clique
(`autoDownload` e `autoInstallOnAppQuit` desligados). Em Ajustes também há "Procurar atualização".

Publicar uma versão nova: aumentar `version` no package.json, `npm run instalador`, pegar a trava `vps` no quadro do
Espectro e rodar `sh publicar-atualizacao.sh`.

Quem instalou a 1.0.3 ou antes precisa instalar a 1.0.4 uma vez à mão (elas não tinham o botão).

Teste sem janela: `ESPECTRO_CAPTURA_TESTE=<arquivo.png> npx electron .` abre escondido, tira um print e fecha.
