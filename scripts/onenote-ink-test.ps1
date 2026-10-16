<#
  Reads the original ink of OneNote pages (read-only, through OneNote's COM API) and
  1) runs Windows' own handwriting recognizer on each page (the engine REA-StarNote uses on Windows), and
  2) saves each page's strokes as JSON (page coordinates, in points) for the later OneNote importer.
  Nothing is changed in OneNote. The output stays in -Out; it holds the owner's notes, so keep it private (never commit it).

  Run in Windows PowerShell 5.1 (not PowerShell 7: it lacks the WinRT bridge), with OneNote (desktop) installed:
    powershell -ExecutionPolicy Bypass -File scripts\onenote-ink-test.ps1 -Section "sample-zx-calculus" -Out C:\qa\ink
    ... -Section "sample-quantum-info" -Pages "1-11,40-41" -Out C:\qa\ink
  -Section matches a section name (a substring); -Pages picks pages by their number in the section (default: all);
  -Lang picks the recognizer by name ("ko" -> the Korean one, "en" -> English), falling back to the default one.
  The file is plain ASCII on purpose (Windows PowerShell 5.1 misreads non-ASCII in scripts saved without a BOM).
#>
param(
  [Parameter(Mandatory = $true)][string]$Section,
  [string]$Pages = "",
  [string]$Out = ".\ink-test",
  [string]$Lang = "ko"
)
$ErrorActionPreference = "Stop"
if ($PSVersionTable.PSVersion.Major -ge 6) { throw "Use Windows PowerShell 5.1 (powershell.exe), not PowerShell 7." }

# --- WinRT from PowerShell 5.1: types, and a way to wait for async calls
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.UI.Input.Inking.InkStrokeContainer, Windows.UI.Input.Inking, ContentType = WindowsRuntime]
$null = [Windows.UI.Input.Inking.InkRecognizerContainer, Windows.UI.Input.Inking, ContentType = WindowsRuntime]
$null = [Windows.UI.Input.Inking.InkStrokeBuilder, Windows.UI.Input.Inking, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataWriter, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 }
function Wait-Op($op, [Type]$result) {
  $m = ($asTask | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0].MakeGenericMethod($result)
  $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
function Wait-ActionProgress($op, [Type]$progress) {
  $m = ($asTask | Where-Object { $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' })[0].MakeGenericMethod($progress)
  $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null
}

# --- the recognizer: by language name, else Windows' default
$recognizers = New-Object Windows.UI.Input.Inking.InkRecognizerContainer
$all = @($recognizers.GetRecognizers())
Write-Host ("Recognizers installed: " + (($all | ForEach-Object { $_.Name }) -join ", "))
if ($all.Count -eq 0) { throw "Windows has no handwriting recognizer installed." }
$u = { param($e) [regex]::Unescape($e) }   # Korean names written as escapes: "Hangul", "Korean (language)", "English"
$hints = @{ "ko" = @((& $u '\ud55c\uae00'), (& $u '\ud55c\uad6d\uc5b4'), "Korean"); "en" = @("English", (& $u '\uc601\uc5b4')) }[$Lang]
$pick = $all | Where-Object { $n = $_.Name; $hints | Where-Object { $n.Contains($_) } } | Select-Object -First 1
if ($pick) { $recognizers.SetDefaultRecognizer($pick); Write-Host "Using: $($pick.Name)" } else { Write-Host "No '$Lang' recognizer: using Windows' default." }

# --- OneNote: find the section and its pages (read-only)
$one = New-Object -ComObject OneNote.Application
$ns = "http://schemas.microsoft.com/office/onenote/2013/onenote"
$h = ""; $one.GetHierarchy("", 4, [ref]$h, 2)        # 4 = hsPages, 2 = xs2013
[xml]$hx = $h
$nm = New-Object System.Xml.XmlNamespaceManager($hx.NameTable); $nm.AddNamespace("one", $ns)
$sec = @($hx.SelectNodes("//one:Section", $nm) | Where-Object { $_.name -like "*$Section*" -and $_.isInRecycleBin -ne "true" })
if ($sec.Count -eq 0) { throw "No section matching '$Section'." }
if ($sec.Count -gt 1) { Write-Host ("Several sections match; using the first: " + (($sec | ForEach-Object { $_.name }) -join " | ")) }
$pageNodes = @($sec[0].SelectNodes("one:Page", $nm))
$want = @{}
if ($Pages) { foreach ($part in $Pages.Split(",")) { $a, $b = $part.Split("-"); if (-not $b) { $b = $a }; ([int]$a)..([int]$b) | ForEach-Object { $want[$_] = $true } } }
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Write-Host "Section '$($sec[0].name)': $($pageNodes.Count) pages"

# ISF bytes -> strokes ([x, y] lists, device-independent pixels relative to the ink)
function Read-Isf([byte[]]$bytes) {
  $mem = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $w = New-Object Windows.Storage.Streams.DataWriter($mem)
  $w.WriteBytes($bytes)
  $null = Wait-Op ($w.StoreAsync()) ([UInt32])
  $null = $w.DetachStream()
  $c = New-Object Windows.UI.Input.Inking.InkStrokeContainer
  Wait-ActionProgress ($c.LoadAsync($mem.GetInputStreamAt(0))) ([UInt64])
  @($c.GetStrokes() | ForEach-Object { , @($_.GetInkPoints() | ForEach-Object { , @([double]$_.Position.X, [double]$_.Position.Y) }) })
}

$summary = @()
$builder = New-Object Windows.UI.Input.Inking.InkStrokeBuilder
for ($i = 0; $i -lt $pageNodes.Count; $i++) {
  $no = $i + 1
  if ($Pages -and -not $want[$no]) { continue }
  $px = ""; $one.GetPageContent($pageNodes[$i].ID, [ref]$px, 1, 2)   # 1 = piBinaryData (the ink is in the XML), 2 = xs2013
  [xml]$p = $px
  $pm = New-Object System.Xml.XmlNamespaceManager($p.NameTable); $pm.AddNamespace("one", $ns)
  $strokes = New-Object System.Collections.ArrayList
  $drawings = 0; $skipped = 0
  foreach ($d in $p.SelectNodes("//one:InkDrawing", $pm)) {
    $data = $d.SelectSingleNode("one:Data", $pm); $pos = $d.SelectSingleNode("one:Position", $pm)
    if (-not $data -or -not $pos) { $skipped++; continue }
    $drawings++
    $ink = Read-Isf ([Convert]::FromBase64String($data.InnerText))
    # place the drawing at its OneNote position (points): its ink's top-left goes to Position, DIPs -> points (x0.75)
    $minX = [double]::MaxValue; $minY = [double]::MaxValue
    foreach ($s in $ink) { foreach ($q in $s) { if ($q[0] -lt $minX) { $minX = $q[0] }; if ($q[1] -lt $minY) { $minY = $q[1] } } }
    foreach ($s in $ink) {
      $pts = @($s | ForEach-Object { , @([math]::Round([double]$pos.x + ($_[0] - $minX) * 0.75, 2), [math]::Round([double]$pos.y + ($_[1] - $minY) * 0.75, 2)) })
      if ($pts.Count) { [void]$strokes.Add($pts) }
    }
  }
  $inkWords = $p.SelectNodes("//one:InkWord", $pm).Count
  # recognize the whole page in one call: Windows splits it into words/lines itself (results come with their rectangles)
  $lines = @()
  if ($strokes.Count) {
    $page = New-Object Windows.UI.Input.Inking.InkStrokeContainer
    foreach ($s in $strokes) {
      $list = New-Object 'System.Collections.Generic.List[Windows.Foundation.Point]'
      foreach ($q in $s) { $list.Add((New-Object Windows.Foundation.Point($q[0] / 0.75, $q[1] / 0.75))) }
      $page.AddStroke($builder.CreateStroke($list))
    }
    $res = Wait-Op ($recognizers.RecognizeAsync($page, [Windows.UI.Input.Inking.InkRecognitionTarget]::All)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Input.Inking.InkRecognitionResult]])
    foreach ($r in $res) {
      $c = @($r.GetTextCandidates())
      if ($c.Count) { $lines += [pscustomobject]@{ y = [math]::Round($r.BoundingRect.Y * 0.75); x = [math]::Round($r.BoundingRect.X * 0.75); text = $c[0] } }
    }
  }
  $title = $pageNodes[$i].name
  $file = Join-Path $Out ("page-{0:D2}" -f $no)
  @{ section = $sec[0].name; page = $no; title = $title; units = "pt"; strokes = $strokes } | ConvertTo-Json -Depth 6 -Compress | Set-Content -Encoding UTF8 "$file.json"
  ($lines | Sort-Object y, x | ForEach-Object { "{0,6} {1,6}  {2}" -f $_.y, $_.x, $_.text }) | Set-Content -Encoding UTF8 "$file.recognized.txt"
  $summary += [pscustomobject]@{ page = $no; title = $title; drawings = $drawings; strokes = $strokes.Count; inkWords = $inkWords; skipped = $skipped; recognized = $lines.Count }
  Write-Host ("page {0,2}: {1} drawings, {2} strokes, {3} recognized pieces  ({4})" -f $no, $drawings, $strokes.Count, $lines.Count, $title)
}
$summary | Format-Table | Out-String | Set-Content -Encoding UTF8 (Join-Path $Out "summary.txt")
Write-Host "Done: $Out (page-NN.json = strokes, page-NN.recognized.txt = what Windows read, summary.txt). Keep it private."
