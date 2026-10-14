$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
python (Join-Path $PSScriptRoot "pack.py")
