#!/bin/sh
# Publica uma versão nova do Espectro Captura para o botão "Atualizar" dos programas instalados.
# Antes: aumentar "version" no package.json e rodar `npm run instalador`.
# Envia latest.yml, o instalador e o .blockmap para o servidor de atualizações (pasta servida em
# https://espectrosolucoes.com.br/atualizacoes/espectro-captura/).
# O servidor, o usuário e a chave SSH vêm de fora do repositório: variáveis ESPECTRO_VPS_HOST, ESPECTRO_VPS_USER,
# ESPECTRO_VPS_CHAVE e ESPECTRO_KNOWN_HOSTS, ou um arquivo .env indicado em ESPECTRO_VPS_ENV (com HOST e USER).
set -e
D="$(cd "$(dirname "$0")" && pwd)"
V="$(cd "$D" && node -p "require('./package.json').version")" # (com cd: o node do Windows não entende /c/...)
EXE="$D/dist/Espectro-Captura-Setup-$V.exe"
[ -f "$EXE" ] && [ -f "$EXE.blockmap" ] && [ -f "$D/dist/latest.yml" ] || { echo "falta o instalador $V em dist/ (rode npm run instalador)"; exit 1; }
grep -q "^version: $V$" "$D/dist/latest.yml" || { echo "latest.yml não é da versão $V"; exit 1; }

ENVF="${ESPECTRO_VPS_ENV:-}"
ler() { [ -f "$ENVF" ] && grep "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '\r"'"'" || true; }
HOST="${ESPECTRO_VPS_HOST:-$(ler ESPECTRO_VPS_HOST)}"
USUARIO="${ESPECTRO_VPS_USER:-$(ler ESPECTRO_VPS_USER)}"
CHAVE="${ESPECTRO_VPS_CHAVE:-$HOME/.ssh/espectro_vps}"
CONHECIDOS="${ESPECTRO_KNOWN_HOSTS:-}"
[ -n "$HOST" ] && [ -n "$USUARIO" ] || { echo "defina ESPECTRO_VPS_HOST e ESPECTRO_VPS_USER (ou ESPECTRO_VPS_ENV com elas)"; exit 1; }
[ -n "$CONHECIDOS" ] && [ -f "$CONHECIDOS" ] || { echo "defina ESPECTRO_KNOWN_HOSTS (arquivo known_hosts com a chave do servidor)"; exit 1; }
SSH="-i $CHAVE -o IdentitiesOnly=yes -o UserKnownHostsFile=$CONHECIDOS -o StrictHostKeyChecking=yes -o BatchMode=yes"
P=/opt/espectro-captura/public

# instalador primeiro; o latest.yml por último (assim ninguém é avisado antes do arquivo estar lá)
scp $SSH "$EXE" "$EXE.blockmap" "$USUARIO@$HOST:$P/"
scp $SSH "$D/dist/latest.yml" "$USUARIO@$HOST:$P/"
# nome fixo para o botão "Baixar" da página espectrosolucoes.com.br/captura (sempre a versão mais nova)
# só os arquivos: a pasta complementos/ (Suavizar movimento) precisa continuar 755, senão o servidor responde 403
ssh $SSH "$USUARIO@$HOST" "cp -f '$P/Espectro-Captura-Setup-$V.exe' $P/Espectro-Captura-Setup.exe && find $P -maxdepth 1 -type f -exec chmod 644 {} +"
echo "publicada a versão $V: $(curl -s https://espectrosolucoes.com.br/atualizacoes/espectro-captura/latest.yml | head -1)"
