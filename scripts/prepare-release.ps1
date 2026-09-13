# Prepare exactly the documents consumed by release-build.yml.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
  node scripts/check-licenses.js --dist
  if ($LASTEXITCODE -ne 0) { throw 'Packaged license verification failed.' }
  $package = Get-Content package.json -Raw | ConvertFrom-Json
  $executable = "Subtitle-Translator-Overlay-$($package.version).exe"
  if (!(Test-Path -LiteralPath "dist/$executable")) { throw "Missing $executable" }
  New-Item -ItemType Directory -Force dist/release | Out-Null
  Copy-Item -LiteralPath "dist/$executable", 'LICENSE', 'THIRD_PARTY_NOTICES.txt' -Destination dist/release -Force
  Compress-Archive -Path 'licenses', 'dist/win-unpacked/LICENSE.electron.txt', 'dist/win-unpacked/LICENSES.chromium.html', 'dist/win-unpacked/resources/ocr-model-README.md' -DestinationPath dist/release/licenses.zip -Force
  # Prevent an old release executable being uploaded accidentally on a reused workspace.
  $expected = @($executable, 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'licenses.zip')
  $unexpected = Get-ChildItem -LiteralPath dist/release | Where-Object { $_.Name -notin $expected }
  if ($unexpected) { throw 'Unexpected files in dist/release; use a clean staging directory.' }
  Write-Output "Release executable and license documents prepared in dist/release."
} finally {
  Pop-Location
}
