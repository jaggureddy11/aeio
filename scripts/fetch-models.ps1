# Aeio — Model Fetch & Integrity Verification Script (Windows PowerShell)
# Downloads and validates pinned weights for all-MiniLM-L6-v2 (Apache 2.0)
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$targetDir = Join-Path $projectRoot "src-tauri\resources\models\all-MiniLM-L6-v2"

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

$models = @(
    @{
        Name = "config.json";
        Url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/raw/main/config.json";
        Sha256 = "953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41"
    },
    @{
        Name = "tokenizer.json";
        Url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json";
        Sha256 = "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037"
    },
    @{
        Name = "model.safetensors";
        Url = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/model.safetensors";
        Sha256 = "53aa51172d142c89d9012cce15ae4d6cc0ca6895895114379cacb4fab128d9db"
    }
)

Write-Host "=== Aeio: Fetching & Verifying Semantic Embedding Models (Windows) ==="

foreach ($item in $models) {
    $filePath = Join-Path $targetDir $item.Name
    $tempPath = "$filePath.tmp"

    if (Test-Path $filePath) {
        $hash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
        if ($hash -eq $item.Sha256.ToLower()) {
            Write-Host "[aeio::models] $($item.Name) already verified (SHA256: $($item.Sha256))"
            continue
        }
        Write-Host "[aeio::models] $($item.Name) hash mismatch! Re-downloading..."
        Remove-Item -Force $filePath
    }

    Write-Host "[aeio::models] Downloading $($item.Name) from $($item.Url) ..."
    Invoke-WebRequest -Uri $item.Url -OutFile $tempPath -UseBasicParsing

    $downloadedHash = (Get-FileHash -Path $tempPath -Algorithm SHA256).Hash.ToLower()
    if ($downloadedHash -ne $item.Sha256.ToLower()) {
        Write-Error "[aeio::models] FATAL: Checksum mismatch for $($item.Name)! Expected: $($item.Sha256), Actual: $downloadedHash"
        Remove-Item -Force $tempPath
        exit 1
    }

    Move-Item -Force $tempPath $filePath
    Write-Host "[aeio::models] Verified $($item.Name) successfully."
}

Write-Host "=== Model integrity verification passed. Ready for build. ==="
