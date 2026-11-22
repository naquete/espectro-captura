# Espectro Captura

Programa para Windows que mostra e toca a placa de captura (Elgato HD60 X e outras que aparecem como câmera e
microfone) com controle de volume de verdade, sem OBS. Pedido do João em 22/11/2026.

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

Teste sem janela: `ESPECTRO_CAPTURA_TESTE=<arquivo.png> npx electron .` abre escondido, tira um print e fecha.
