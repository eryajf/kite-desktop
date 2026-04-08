#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <version-without-v> [homepage-url]" >&2
  exit 1
fi

VERSION="$1"
export KITE_VERSION="${VERSION}"

perl -0pi -e 's/(version:\s*")[^"]+(")/${1}$ENV{KITE_VERSION}$2/g' \
  desktop/build/config.yml

(
  cd desktop
  wails3 task common:update:build-assets
)

echo "desktop release metadata updated: version=${VERSION}"
