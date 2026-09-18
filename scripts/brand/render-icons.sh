#!/bin/sh
# Compiles the icon renderer against the app's own mark geometry, then runs it from the repository root.
set -eu
cd "$(dirname "$0")/../.."
out="${TMPDIR:-/tmp}/clearaf-render-icons"
swiftc -O -parse-as-library \
  scripts/brand/render-icons.swift \
  ClearAF/Views/Brand/LetterpressMarkGeometry.swift \
  ClearAF/Views/Brand/LetterpressMarkGlyphs.swift \
  -o "$out"
"$out"
