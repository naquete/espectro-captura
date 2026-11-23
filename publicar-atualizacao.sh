#!/bin/sh
# Publica uma versão nova do Espectro Captura para o botão "Atualizar" dos programas instalados.
# Antes: aumentar "version" no package.json e rodar `npm run instalador`.
# Envia latest.yml, o instalador e o .blockmap para a VPS do Espectro (pasta servida pelo Caddy em
# https://espectrosolucoes.com.br/atualizacoes/espectro-captura/). Pegar a trava "vps" no quadro do Espectro antes.
set -e
D="$(cd "$(dirname "$0")" && pwd)"
V="$(node -p "require('$D/package.json').version")"
EXE="$D/dist/Espectro-Captura-Setup-$V.exe"
[ -f "$EXE" ] && [ -f "$EXE.blockmap" ] && [ -f "$D/dist/latest.yml" ] || { echo "falta o instalador $V em dist/ (rode npm run instalador)"; exit 1; }
grep -q "^version: $V$" "$D/dist/latest.yml" || { echo "latest.yml não é da versão $V"; exit 1; }
SSH="-i $HOME/.ssh/espectro_vps -o IdentitiesOnly=yes -o UserKnownHostsFile=/c/repositorios/Espectro/espectro-solucoes/tools/known_hosts -o StrictHostKeyChecking=yes -o BatchMode=yes"
# instalador primeiro; o latest.yml por último (assim ninguém é avisado antes do arquivo estar lá)
scp $SSH "$EXE" "$EXE.blockmap" $USUARIO@$HOST:/opt/espectro-captura/public/
scp $SSH "$D/dist/latest.yml" $USUARIO@$HOST:/opt/espectro-captura/public/
ssh $SSH $USUARIO@$HOST "chmod 644 /opt/espectro-captura/public/*"
echo "publicada a versão $V: $(curl -s https://espectrosolucoes.com.br/atualizacoes/espectro-captura/latest.yml | head -1)"
