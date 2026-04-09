#!/usr/bin/env bash

set -euo pipefail

PACKAGE="github.com/eryajf/kite-desktop/pkg/version"
FLAGS=()

if [[ -n "${KITE_VERSION:-}" ]]; then
  FLAGS+=("-X" "${PACKAGE}.Version=${KITE_VERSION}")
fi

if [[ -n "${KITE_BUILD_DATE:-}" ]]; then
  FLAGS+=("-X" "${PACKAGE}.BuildDate=${KITE_BUILD_DATE}")
fi

if [[ -n "${KITE_COMMIT_ID:-}" ]]; then
  FLAGS+=("-X" "${PACKAGE}.CommitID=${KITE_COMMIT_ID}")
fi

printf '%s' "${FLAGS[*]:-}"
