#!/usr/bin/env bash
# Crea el repositorio en GitHub, sube el código y activa GitHub Pages con Actions.
# Requiere la CLI de GitHub con sesión iniciada: gh auth login
set -euo pipefail

REPO="${1:-cipherflow}"
VISIBILIDAD="${2:-public}"

command -v gh >/dev/null || { echo "Instala la CLI de GitHub: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Inicia sesión primero: gh auth login"; exit 1; }
OWNER="$(gh api user --jq .login)"

if [ ! -d .git ]; then
  git init -b main
fi
git add -A
git diff --cached --quiet || git commit -m "CipherFlow: editor de flujos criptográficos sobre CyberChef"

if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  echo "El repositorio $OWNER/$REPO ya existe; se sube el código."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
else
  gh repo create "$OWNER/$REPO" "--$VISIBILIDAD" --source=. --push \
    --description "Flujos criptográficos por nodos con las operaciones de CyberChef y explicaciones paso a paso" \
    --homepage "https://$OWNER.github.io/$REPO/"
fi

echo "Activando GitHub Pages con GitHub Actions…"
gh api --method POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api --method PUT "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null

gh repo edit "$OWNER/$REPO" --add-topic cyberchef --add-topic cryptography --add-topic education --add-topic n8n >/dev/null || true

echo "Lanzando el despliegue…"
gh workflow run deploy.yml --repo "$OWNER/$REPO" --ref main >/dev/null 2>&1 || true

echo
echo "Listo. Sigue el despliegue con:  gh run watch --repo $OWNER/$REPO"
echo "La página quedará en:           https://$OWNER.github.io/$REPO/"
