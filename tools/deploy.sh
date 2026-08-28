#!/bin/sh
# Deploys the World, and refuses to ship a development bundle.
#
# `sdk-commands start` rewrites bin/index.js as a dev build (unminified, with a 6 MB inline
# sourcemap); a `deploy --skip-build` run after a preview shipped exactly that, and the
# handset spent its whole loading screen on it (28 Aug). This builds production first and
# checks the artefact before anything leaves the machine.
set -e
cd "$(dirname "$0")/.."
npm run build:prod
SIZE=$(stat -f %z bin/index.js)
if grep -q 'sourceMappingURL=data' bin/index.js || [ "$SIZE" -gt 3000000 ]; then
  echo "REFUSED: bin/index.js is a development bundle ($SIZE B)"; exit 1
fi
echo "bundle: $SIZE B, production"
exec npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org --no-browser --skip-version-checks --skip-build "$@"
