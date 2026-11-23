// Textos do programa em português (a chave), inglês e espanhol. t('texto {0}', valor) devolve no idioma escolhido.
// Na tela, elementos com data-t (texto), data-t-title, data-t-aria e data-t-ph (placeholder) são traduzidos sozinhos.
(function () {
  'use strict';
  var T = {
    // tela e barra
    'Tentar de novo': ['Try again', 'Intentar de nuevo'],
    'Sem imagem da placa': ['No picture from the capture card', 'Sin imagen de la capturadora'],
    'O console está desligado ou o cabo HDMI soltou? A imagem volta sozinha.': ['Is the console off or the HDMI cable loose? The picture comes back on its own.', '¿La consola está apagada o se soltó el cable HDMI? La imagen vuelve sola.'],
    'Mudo (M)': ['Mute (M)', 'Silenciar (M)'],
    'Volume': ['Volume', 'Volumen'],
    'Print (P)': ['Screenshot (P)', 'Captura (P)'],
    'Salvar o replay (R)': ['Save replay (R)', 'Guardar repetición (R)'],
    'Gravar vídeo (G)': ['Record video (G)', 'Grabar video (G)'],
    'Ajustes': ['Settings', 'Ajustes'],
    'Tela cheia (F)': ['Full screen (F)', 'Pantalla completa (F)'],
    // abas
    'Placa': ['Card', 'Capturadora'], 'Imagem': ['Picture', 'Imagen'], 'Som': ['Sound', 'Sonido'], 'Gravar': ['Record', 'Grabar'], 'Programa': ['App', 'Programa'],
    // placa
    'Imagem (placa de captura)': ['Picture (capture card)', 'Imagen (capturadora)'],
    'Som da placa': ['Card audio', 'Audio de la capturadora'],
    'Tocar o som em': ['Play sound on', 'Reproducir el sonido en'],
    'Qualidade': ['Quality', 'Calidad'],
    'Escolha o que a sua placa aguenta. Se ela não fizer a combinação escolhida, entrega a mais próxima e o app mostra o que chegou. Para 4K ou 1440p, o console ou PC também precisa estar mandando essa resolução para a placa.': ['Pick what your card can handle. If it can\'t do the chosen combination, it delivers the closest one and the app shows what arrived. For 4K or 1440p, the console or PC also has to send that resolution to the card.', 'Elige lo que tu capturadora aguanta. Si no hace la combinación elegida, entrega la más cercana y el programa muestra lo que llegó. Para 4K o 1440p, la consola o la PC también debe enviar esa resolución.'],
    'Encaixe da imagem': ['Picture fit', 'Ajuste de la imagen'],
    'Imagem inteira (barras pretas se precisar)': ['Whole picture (black bars if needed)', 'Imagen completa (barras negras si hace falta)'],
    'Preencher a janela (corta as bordas)': ['Fill the window (crops the edges)', 'Llenar la ventana (recorta los bordes)'],
    'Proporção': ['Aspect ratio', 'Proporción'],
    'Original da placa': ['Card original', 'Original de la capturadora'],
    '4:3 (console antigo)': ['4:3 (retro console)', '4:3 (consola antigua)'],
    '21:9 (ultrawide)': ['21:9 (ultrawide)', '21:9 (ultrapanorámica)'],
    'Esticar na janela inteira': ['Stretch to the whole window', 'Estirar a toda la ventana'],
    'Zoom': ['Zoom', 'Zoom'],
    'Com zoom, arraste a imagem com o mouse para escolher a parte que aparece.': ['When zoomed in, drag the picture with the mouse to choose what shows.', 'Con zoom, arrastra la imagen con el mouse para elegir qué parte se ve.'],
    'Mostrar os quadros por segundo (FPS) no canto': ['Show frames per second (FPS) in the corner', 'Mostrar los cuadros por segundo (FPS) en la esquina'],
    // imagem
    'Estilo pronto': ['Preset', 'Estilo'], 'Normal': ['Normal', 'Normal'], 'Vívido': ['Vivid', 'Vívido'], 'Cinema': ['Cinema', 'Cine'], 'Quente': ['Warm', 'Cálido'], 'Frio': ['Cool', 'Frío'],
    'Preto e branco': ['Black and white', 'Blanco y negro'], 'Corrigir HDR lavado': ['Fix washed-out HDR', 'Corregir HDR deslavado'], 'Personalizado': ['Custom', 'Personalizado'],
    'Brilho': ['Brightness', 'Brillo'], 'Contraste': ['Contrast', 'Contraste'], 'Saturação (cor)': ['Saturation (color)', 'Saturación (color)'], 'Tom de cor': ['Hue', 'Tono'],
    'Nitidez': ['Sharpness', 'Nitidez'], 'Desligada': ['Off', 'Apagada'], 'Leve': ['Light', 'Leve'], 'Forte': ['Strong', 'Fuerte'],
    'Realce HDR (mais contraste e cor; corrige imagem lavada)': ['HDR boost (more contrast and color; fixes washed-out picture)', 'Realce HDR (más contraste y color; corrige la imagen deslavada)'],
    'Modo retrô: pixels nítidos (console antigo)': ['Retro mode: crisp pixels (retro console)', 'Modo retro: píxeles nítidos (consola antigua)'],
    'Efeito de TV de tubo (linhas e bordas escuras)': ['CRT TV effect (scanlines and dark edges)', 'Efecto de TV de tubo (líneas y bordes oscuros)'],
    'Espelhar a imagem': ['Mirror the picture', 'Reflejar la imagen'],
    'Voltar a imagem ao padrão': ['Reset the picture', 'Restablecer la imagen'],
    'O HDR de verdade se liga no console e na placa. Quando o console manda HDR e a placa não converte, a imagem fica lavada: use "Corrigir HDR lavado" ou o Realce HDR. A nitidez pode pesar em PC mais fraco.': ['Real HDR is turned on in the console and the card. When the console sends HDR and the card does not convert it, the picture looks washed out: use "Fix washed-out HDR" or the HDR boost. Sharpness can be heavy on slower PCs.', 'El HDR real se activa en la consola y en la capturadora. Cuando la consola envía HDR y la capturadora no lo convierte, la imagen se ve deslavada: usa "Corregir HDR deslavado" o el Realce HDR. La nitidez puede pesar en PCs más lentas.'],
    // som
    'Estabilidade do som': ['Sound stability', 'Estabilidad del sonido'],
    'Menor atraso (pode estalar com o PC ocupado)': ['Lowest delay (may crackle when the PC is busy)', 'Menor retraso (puede chasquear con la PC ocupada)'],
    'Equilibrado (recomendado)': ['Balanced (recommended)', 'Equilibrado (recomendado)'],
    'Mais estável (sem estalos, um pouco mais de atraso)': ['Most stable (no crackles, a bit more delay)', 'Más estable (sin chasquidos, un poco más de retraso)'],
    'Atraso do som': ['Audio delay', 'Retraso del sonido'],
    'Se o som chega antes da imagem (o tiro soa antes do clarão), aumente aos poucos até casar.': ['If the sound arrives before the picture (the shot sounds before the flash), raise it little by little until they match.', 'Si el sonido llega antes que la imagen (el disparo suena antes del destello), súbelo de a poco hasta que coincidan.'],
    'Equalizador': ['Equalizer', 'Ecualizador'], 'Realçar passos (jogo de tiro)': ['Footsteps boost (shooters)', 'Realzar pasos (juegos de disparos)'], 'Mais grave': ['More bass', 'Más graves'], 'Vozes mais claras': ['Clearer voices', 'Voces más claras'],
    'Grave': ['Bass', 'Graves'], 'Médio': ['Mid', 'Medios'], 'Agudo': ['Treble', 'Agudos'],
    'Modo noturno: segura explosões e deixa falas mais altas': ['Night mode: tames explosions and lifts dialogue', 'Modo nocturno: suaviza explosiones y sube los diálogos'],
    'Balanço (esquerda e direita)': ['Balance (left and right)', 'Balance (izquierda y derecha)'],
    'Som mono (para quem joga com um fone só)': ['Mono sound (for one earbud)', 'Sonido mono (para un solo auricular)'],
    'Voltar o som ao padrão': ['Reset the sound', 'Restablecer el sonido'],
    // gravar
    'Guardar sempre os últimos segundos para o replay': ['Always keep the last seconds for replay', 'Guardar siempre los últimos segundos para la repetición'],
    'Tamanho do replay': ['Replay length', 'Duración de la repetición'], '15 segundos': ['15 seconds', '15 segundos'], '30 segundos': ['30 seconds', '30 segundos'], '1 minuto': ['1 minute', '1 minuto'],
    '90 segundos': ['90 seconds', '90 segundos'], '2 minutos': ['2 minutes', '2 minutos'], '5 minutos': ['5 minutes', '5 minutos'],
    'O replay usa a placa de vídeo do PC o tempo todo enquanto está ligado e guarda os últimos segundos na memória: 5 minutos ocupam cerca de 500 MB em 1080p e 1,5 GB em 4K. Desligue se o PC esquentar ou travar.': ['Replay keeps the PC graphics card busy while it is on and holds the last seconds in memory: 5 minutes take about 500 MB at 1080p and 1.5 GB at 4K. Turn it off if the PC gets hot or stutters.', 'La repetición usa la tarjeta de video de la PC todo el tiempo mientras está activa y guarda los últimos segundos en memoria: 5 minutos ocupan unos 500 MB en 1080p y 1,5 GB en 4K. Apágala si la PC se calienta o se traba.'],
    'Abrir a pasta dos prints': ['Open screenshots folder', 'Abrir la carpeta de capturas'],
    'Abrir a pasta dos vídeos': ['Open videos folder', 'Abrir la carpeta de videos'],
    'Prints em Imagens\\Espectro Captura e vídeos em Vídeos\\Espectro Captura. Teclas: P print, R salvar o replay, G iniciar ou parar a gravação.': ['Screenshots go to Pictures\\Espectro Captura and videos to Videos\\Espectro Captura. Keys: P screenshot, R save replay, G start or stop recording.', 'Capturas en Imágenes\\Espectro Captura y videos en Videos\\Espectro Captura. Teclas: P captura, R guardar repetición, G iniciar o detener la grabación.'],
    // programa
    'Idioma': ['Language', 'Idioma'],
    'Manter a janela sempre por cima das outras': ['Keep the window always on top', 'Mantener la ventana siempre encima'],
    'Abrir já em tela cheia': ['Open in full screen', 'Abrir en pantalla completa'],
    'Abrir junto com o Windows': ['Start with Windows', 'Abrir al iniciar Windows'],
    'Atalhos funcionando com outra janela na frente (Ctrl + Alt + tecla)': ['Shortcuts work with another window in front (Ctrl + Alt + key)', 'Atajos con otra ventana al frente (Ctrl + Alt + tecla)'],
    'Com outra janela na frente: Ctrl+Alt+setas mudam o volume, Ctrl+Alt+M mudo, Ctrl+Alt+P print, Ctrl+Alt+R replay e Ctrl+Alt+G gravar.': ['With another window in front: Ctrl+Alt+arrows change the volume, Ctrl+Alt+M mute, Ctrl+Alt+P screenshot, Ctrl+Alt+R replay and Ctrl+Alt+G record.', 'Con otra ventana al frente: Ctrl+Alt+flechas cambian el volumen, Ctrl+Alt+M silencio, Ctrl+Alt+P captura, Ctrl+Alt+R repetición y Ctrl+Alt+G grabar.'],
    'Perfis': ['Profiles', 'Perfiles'],
    'Guarde a imagem, o som e a qualidade de cada jogo ou placa e troque com um clique.': ['Save picture, sound and quality for each game or card and switch with one click.', 'Guarda imagen, sonido y calidad de cada juego o capturadora y cambia con un clic.'],
    'Usar': ['Use', 'Usar'], 'Apagar': ['Delete', 'Borrar'], 'Salvar o atual': ['Save current', 'Guardar el actual'],
    'Nome do perfil (ex.: FIFA)': ['Profile name (e.g. FIFA)', 'Nombre del perfil (ej.: FIFA)'],
    'Procurar atualização': ['Check for updates', 'Buscar actualización'],
    'Enviar sugestão ou relatar problema': ['Send a suggestion or report a problem', 'Enviar sugerencia o reportar un problema'],
    'Atalhos: M mudo · setas para cima e para baixo ou a roda do mouse mudam o volume · F ou duplo clique para tela cheia · P print · R replay · G gravar.': ['Shortcuts: M mute · up and down arrows or the mouse wheel change the volume · F or double click for full screen · P screenshot · R replay · G record.', 'Atajos: M silencio · flechas arriba y abajo o la rueda del mouse cambian el volumen · F o doble clic para pantalla completa · P captura · R repetición · G grabar.'],
    'Fechar': ['Close', 'Cerrar'],
    // relato
    'Fale com a Espectro': ['Talk to Espectro', 'Habla con Espectro'],
    'Sugestão, problema ou ideia: chega direto para a equipe da Espectro Soluções.': ['Suggestion, problem or idea: it goes straight to the Espectro Soluções team.', 'Sugerencia, problema o idea: llega directo al equipo de Espectro Soluções.'],
    'Assunto': ['Subject', 'Asunto'], 'Sugestão': ['Suggestion', 'Sugerencia'], 'Problema': ['Problem', 'Problema'], 'Outro': ['Other', 'Otro'], 'Mensagem': ['Message', 'Mensaje'],
    'Conte o que aconteceu ou o que você queria que o programa fizesse.': ['Tell us what happened or what you wish the app did.', 'Cuéntanos qué pasó o qué te gustaría que hiciera el programa.'],
    'Seu nome (opcional)': ['Your name (optional)', 'Tu nombre (opcional)'],
    'Seu e-mail para resposta (opcional)': ['Your email for a reply (optional)', 'Tu correo para responderte (opcional)'],
    'Incluir informações técnicas (versão, Windows e placa em uso)': ['Include technical info (version, Windows and card in use)', 'Incluir información técnica (versión, Windows y capturadora en uso)'],
    'Enviar': ['Send', 'Enviar'],
    // mensagens do programa
    'Volume {0}%': ['Volume {0}%', 'Volumen {0}%'], 'Mudo': ['Muted', 'Silencio'],
    'Abrindo a placa de captura...': ['Opening the capture card...', 'Abriendo la capturadora...'],
    'Não achei nenhuma placa de captura. Confira o cabo USB da placa e se ela está ligada.': ['No capture card found. Check the card USB cable and that it is on.', 'No encontré ninguna capturadora. Revisa el cable USB y que esté encendida.'],
    'A placa está sendo usada por outro programa (o app da própria placa ou o OBS?). Feche o outro e tente de novo.': ['The card is being used by another app (its own app or OBS?). Close it and try again.', 'La capturadora está siendo usada por otro programa (su propio programa u OBS?). Ciérralo e inténtalo de nuevo.'],
    'Não consegui abrir a placa: {0}': ['Could not open the card: {0}', 'No pude abrir la capturadora: {0}'],
    'A placa entregou {0}p a {1} fps': ['The card delivered {0}p at {1} fps', 'La capturadora entregó {0}p a {1} fps'],
    'sem som': ['no sound', 'sin sonido'], 'Placa': ['Card', 'Capturadora'],
    'Nenhuma placa encontrada': ['No card found', 'Ninguna capturadora encontrada'],
    'Nenhuma entrada de som': ['No audio input', 'Ninguna entrada de sonido'],
    'Padrão do Windows': ['Windows default', 'Predeterminado de Windows'],
    'Dispositivo {0}': ['Device {0}', 'Dispositivo {0}'],
    'Escolha o som da sua placa em Ajustes': ['Choose your card audio in Settings', 'Elige el audio de tu capturadora en Ajustes'],
    'Confira se esta é a sua placa': ['Check this is your card', 'Revisa que sea tu capturadora'],
    'Realce HDR ligado': ['HDR boost on', 'Realce HDR activado'], 'Realce HDR desligado': ['HDR boost off', 'Realce HDR desactivado'],
    'Imagem padrão': ['Picture reset', 'Imagen restablecida'], 'Som padrão': ['Sound reset', 'Sonido restablecido'],
    'Escreva um pouco mais na mensagem.': ['Write a bit more in the message.', 'Escribe un poco más en el mensaje.'],
    'Envio indisponível nesta versão.': ['Sending is not available in this version.', 'El envío no está disponible en esta versión.'],
    'Enviando...': ['Sending...', 'Enviando...'],
    'Enviado. Obrigado! A equipe da Espectro vai ler.': ['Sent. Thank you! The Espectro team will read it.', 'Enviado. ¡Gracias! El equipo de Espectro lo leerá.'],
    'Não deu para enviar agora. Confira a internet e tente de novo.': ['Could not send now. Check your internet and try again.', 'No se pudo enviar ahora. Revisa internet e inténtalo de nuevo.'],
    'Procurando atualização...': ['Checking for updates...', 'Buscando actualización...'],
    'Você está na versão mais nova.': ['You have the latest version.', 'Tienes la versión más nueva.'],
    'Versão {0} disponível.': ['Version {0} available.', 'Versión {0} disponible.'],
    'Baixando a atualização... {0}%': ['Downloading the update... {0}%', 'Descargando la actualización... {0}%'],
    'Atualização baixada. Clique em "Reiniciar e instalar".': ['Update downloaded. Click "Restart and install".', 'Actualización descargada. Haz clic en "Reiniciar e instalar".'],
    'Não deu para procurar atualização agora (sem internet?).': ['Could not check for updates now (no internet?).', 'No se pudo buscar actualización ahora (¿sin internet?).'],
    'Reiniciar e instalar': ['Restart and install', 'Reiniciar e instalar'],
    'Atualizar para {0}': ['Update to {0}', 'Actualizar a {0}'],
    'Atualização disponível: versão {0}': ['Update available: version {0}', 'Actualización disponible: versión {0}'],
    'Versão {0}': ['Version {0}', 'Versión {0}'],
    'Print salvo': ['Screenshot saved', 'Captura guardada'],
    'Não deu para salvar: {0}': ['Could not save: {0}', 'No se pudo guardar: {0}'],
    'Replay salvo ({0} s)': ['Replay saved ({0} s)', 'Repetición guardada ({0} s)'],
    'Ligue o replay em Ajustes > Gravar': ['Turn on replay in Settings > Record', 'Activa la repetición en Ajustes > Grabar'],
    'O replay ainda está juntando os primeiros segundos': ['Replay is still collecting the first seconds', 'La repetición todavía está juntando los primeros segundos'],
    'Gravando': ['Recording', 'Grabando'],
    'Gravação salva': ['Recording saved', 'Grabación guardada'],
    'Abra a placa antes': ['Open the card first', 'Abre la capturadora primero'],
    'Este PC não consegue codificar vídeo para gravar': ['This PC cannot encode video for recording', 'Esta PC no puede codificar video para grabar'],
    'Replay ligado': ['Replay on', 'Repetición activada'], 'Replay desligado': ['Replay off', 'Repetición desactivada'],
    'Perfil "{0}" aplicado': ['Profile "{0}" applied', 'Perfil "{0}" aplicado'],
    'Perfil "{0}" salvo': ['Profile "{0}" saved', 'Perfil "{0}" guardado'],
    'Perfil apagado': ['Profile deleted', 'Perfil borrado'],
    'Dê um nome ao perfil': ['Give the profile a name', 'Ponle un nombre al perfil'],
    'Nenhum perfil salvo': ['No saved profiles', 'Ningún perfil guardado'],
    'Atraso do som {0} ms': ['Audio delay {0} ms', 'Retraso del sonido {0} ms'],
  };
  var idioma = 'pt';
  function t(texto) {
    var linha = T[texto], s = linha && idioma !== 'pt' ? linha[idioma === 'en' ? 0 : 1] : texto;
    for (var i = 1; i < arguments.length; i++) s = s.split('{' + (i - 1) + '}').join(String(arguments[i]));
    return s;
  }
  function aplicarNaTela() {
    document.documentElement.lang = idioma === 'pt' ? 'pt-br' : idioma;
    document.querySelectorAll('[data-t]').forEach(function (el) {
      if (!el.dataset.tOrig) el.dataset.tOrig = el.textContent.replace(/\s+/g, ' ').trim();
      el.textContent = t(el.dataset.tOrig);
    });
    [['data-t-title', 'title'], ['data-t-aria', 'aria-label'], ['data-t-ph', 'placeholder']].forEach(function (par) {
      document.querySelectorAll('[' + par[0] + ']').forEach(function (el) { el.setAttribute(par[1], t(el.getAttribute(par[0]))); });
    });
  }
  function idiomaInicial() {
    var n = String(navigator.language || 'pt').toLowerCase();
    return n.indexOf('pt') === 0 ? 'pt' : n.indexOf('es') === 0 ? 'es' : 'en';
  }
  window.ECIdioma = {
    t: t,
    definir: function (novo) { idioma = ['pt', 'en', 'es'].indexOf(novo) >= 0 ? novo : idiomaInicial(); aplicarNaTela(); return idioma; },
    atual: function () { return idioma; },
    inicial: idiomaInicial,
  };
})();
