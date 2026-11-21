$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

$PythonBin = if ($env:PYTHON_BIN) { $env:PYTHON_BIN } else { "python" }
& $PythonBin -c "import sys; assert sys.version_info >= (3, 11), 'Python >= 3.11 required'"

& $PythonBin -m venv "services\pipeline\.venv"
$VenvPython = Join-Path $RootDir "services\pipeline\.venv\Scripts\python.exe"

& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -e "services/pipeline[dev]"

Write-Host "Bootstrap complete."
