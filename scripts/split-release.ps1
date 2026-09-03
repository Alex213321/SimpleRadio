param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [string]$Version = '1.4.2',
  [int]$ExpectedTrackCount = 237
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
$archivePath = (Resolve-Path -LiteralPath $Archive).Path
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$programPath = Join-Path $outputPath "SimpleRadio-$Version-Program-x64.zip"
$musicPath = Join-Path $outputPath "SimpleRadio-$Version-Music.zip"
foreach($file in @($programPath,$musicPath)) { if (Test-Path -LiteralPath $file) { throw "Output exists; choose a new output directory: $file" } }
$source = [IO.Compression.ZipFile]::OpenRead($archivePath)
$program = [IO.Compression.ZipFile]::Open($programPath,[IO.Compression.ZipArchiveMode]::Create)
$music = [IO.Compression.ZipFile]::Open($musicPath,[IO.Compression.ZipArchiveMode]::Create)
$inventory = [Collections.Generic.List[object]]::new()
function Get-StreamHash($stream) {
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
  finally { $hasher.Dispose() }
}
try {
  foreach($entry in $source.Entries) {
    if (-not $entry.Name) { continue }
    $relative = $entry.FullName.Replace('\','/')
    if ($relative.StartsWith('/') -or $relative.Contains(':') -or ($relative.Split('/') | Where-Object { $_ -eq '..' -or $_ -eq '.' -or $_ -eq '' })) { throw "Unsafe ZIP path: $relative" }
    $group = if ($relative.StartsWith('resources/music-library/')) { 'Music' } else { 'Program' }
    $destination = if ($group -eq 'Music') { $music } else { $program }
    $newEntry = $destination.CreateEntry("SimpleRadio-$Version/$relative",[IO.Compression.CompressionLevel]::Optimal)
    $inputStream=$entry.Open(); $outputStream=$newEntry.Open()
    try { $inputStream.CopyTo($outputStream) } finally { $inputStream.Dispose(); $outputStream.Dispose() }
    $hashStream=$entry.Open()
    try { $hash=Get-StreamHash $hashStream } finally { $hashStream.Dispose() }
    $inventory.Add([ordered]@{ path=$relative; group=$group; size=$entry.Length; sha256=$hash })
  }
} finally { $program.Dispose(); $music.Dispose(); $source.Dispose() }
if (($inventory | Where-Object { $_.path -match '\.mp3$' }).Count -ne $ExpectedTrackCount) { throw "Expected exactly $ExpectedTrackCount MP3 files" }
if (-not ($inventory | Where-Object path -eq 'SimpleRadio.exe')) { throw 'Missing executable' }
$verified = [Collections.Generic.HashSet[string]]::new()
foreach($file in @($programPath,$musicPath)) {
  if ((Get-Item -LiteralPath $file).Length -ge 2GB) { throw 'Release asset exceeds GitHub 2 GiB limit' }
  $zip=[IO.Compression.ZipFile]::OpenRead($file)
  try {
    foreach($entry in $zip.Entries) {
      $relative=$entry.FullName.Substring("SimpleRadio-$Version/".Length)
      if (-not $verified.Add($relative)) { throw "Duplicate output file: $relative" }
      $expected=$inventory | Where-Object path -eq $relative
      if (-not $expected -or $expected.size -ne $entry.Length) { throw "Entry mismatch: $relative" }
      $stream=$entry.Open()
      try { $actual=Get-StreamHash $stream } finally { $stream.Dispose() }
      if ($actual -ne $expected.sha256) { throw "Content mismatch: $relative" }
    }
  } finally { $zip.Dispose() }
}
if ($verified.Count -ne $inventory.Count) { throw 'Incomplete split archive' }
$assets=@($programPath,$musicPath) | ForEach-Object { [ordered]@{name=[IO.Path]::GetFileName($_);size=(Get-Item -LiteralPath $_).Length;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash} }
$assets | ForEach-Object { "$($_.sha256)  $($_.name)" } | Set-Content -LiteralPath (Join-Path $outputPath 'SHA256SUMS.txt') -Encoding utf8
[ordered]@{version=$Version;sourceSha256=(Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash;verifiedFiles=$verified.Count;musicTracks=$ExpectedTrackCount;assets=$assets} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputPath 'release-validation.json') -Encoding utf8
$assets | Format-Table -AutoSize
"Verified $($verified.Count) files: split packages reproduce the original release exactly."
