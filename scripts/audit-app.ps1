param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

function Count-Matches {
  param(
    [string]$Path,
    [string]$Pattern
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }

  return (Select-String -Path $Path -Pattern $Pattern -AllMatches | Measure-Object).Count
}

function File-Info {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return [pscustomobject]@{
      Path = $Path
      Exists = $false
      Bytes = 0
      Lines = 0
      Styles = 0
      Scripts = 0
      Functions = 0
      Firebase = $false
      ServiceWorker = $false
    }
  }

  $item = Get-Item -LiteralPath $Path
  $content = Get-Content -LiteralPath $Path -Raw
  [pscustomobject]@{
    Path = $Path
    Exists = $true
    Bytes = $item.Length
    Lines = ($content -split "`r?`n").Count
    Styles = Count-Matches $Path '<style'
    Scripts = Count-Matches $Path '<script'
    Functions = Count-Matches $Path 'function |=>|window\.'
    Firebase = [bool]($content -match 'firebaseConfig|gstatic.com/firebasejs')
    ServiceWorker = [bool]($content -match 'serviceWorker|sw\.js')
  }
}

$desktop = Join-Path $Root 'Gestao\index.html'
$mobile = Join-Path $Root 'Gestao-Mobile\index.html'
$rules = Join-Path $Root 'firestore.rules'
$firebaseJson = Join-Path $Root 'firebase.json'

$files = @(
  File-Info $desktop
  File-Info $mobile
)

Write-Host ''
Write-Host 'App Pai - auditoria rapida'
Write-Host '========================='
Write-Host ''

$files | Format-Table Path, Exists, Bytes, Lines, Styles, Scripts, Functions, Firebase, ServiceWorker -AutoSize

Write-Host ''
Write-Host 'Ficheiros de seguranca'
Write-Host '----------------------'
Write-Host ("firestore.rules: {0}" -f (Test-Path -LiteralPath $rules))
Write-Host ("firebase.json:    {0}" -f (Test-Path -LiteralPath $firebaseJson))

Write-Host ''
Write-Host 'Avisos'
Write-Host '------'

foreach ($file in $files) {
  if ($file.Bytes -gt 250000) {
    Write-Host ("- {0} e muito grande; recomenda-se extrair CSS/JS por fases." -f $file.Path)
  }
  if (-not $file.ServiceWorker) {
    Write-Host ("- {0} tem manifest PWA, mas nao parece registar service worker." -f $file.Path)
  }
}

if (-not (Test-Path -LiteralPath $rules)) {
  Write-Host '- Falta firestore.rules.'
}

if (-not (Test-Path -LiteralPath $firebaseJson)) {
  Write-Host '- Falta firebase.json.'
}

Write-Host ''
