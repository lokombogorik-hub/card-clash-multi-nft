@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Card Clash - NEAR Mainnet Deploy
echo ========================================
echo WARNING: This will deploy to MAINNET!
echo Make sure you have enough NEAR balance.
echo.
pause

set /p OWNER_ACCOUNT="Enter your mainnet account (e.g., yourname.near): "
set /p TREASURY_ACCOUNT="Enter treasury account (can be same): "

echo.
echo ========================================
echo Building NFT contract...
echo ========================================

cd /d "%~dp0\..\contracts\near\nft_collection"

if not exist "build.bat" (
    echo Creating build.bat...
    echo @echo off > build.bat
    echo set RUSTFLAGS=-C link-arg=-s >> build.bat
    echo cargo build --target wasm32-unknown-unknown --release >> build.bat
    echo if not exist res mkdir res >> build.bat
    echo copy target\wasm32-unknown-unknown\release\cardclash_nft.wasm res\ >> build.bat
)

call build.bat
if %errorlevel% neq 0 (
    echo NFT build failed!
    pause
    exit /b 1
)

echo.
echo ========================================
echo Building Escrow contract...
echo ========================================

cd /d "%~dp0\..\contracts\near\escrow"

if not exist "build.bat" (
    echo Creating build.bat...
    echo @echo off > build.bat
    echo set RUSTFLAGS=-C link-arg=-s >> build.bat
    echo cargo build --target wasm32-unknown-unknown --release >> build.bat
    echo if not exist res mkdir res >> build.bat
    echo copy target\wasm32-unknown-unknown\release\cardclash_escrow.wasm res\ >> build.bat
)

call build.bat
if %errorlevel% neq 0 (
    echo Escrow build failed!
    pause
    exit /b 1
)

cd /d "%~dp0\.."

set NFT_ACCOUNT=cardclash-nft.near
set ESCROW_ACCOUNT=escrow.cardclash.near

echo.
echo ========================================
echo Deploying to Mainnet
echo ========================================
echo NFT Account: %NFT_ACCOUNT%
echo Escrow Account: %ESCROW_ACCOUNT%
echo Owner: %OWNER_ACCOUNT%
echo Treasury: %TREASURY_ACCOUNT%
echo.
echo This will create subaccounts and deploy contracts.
pause

echo.
echo Creating NFT contract account...
near create-account %NFT_ACCOUNT% --masterAccount %OWNER_ACCOUNT% --initialBalance 10

if %errorlevel% neq 0 (
    echo Failed to create NFT account!
    echo Maybe account already exists? Try deploying directly.
    set /p CONTINUE="Continue with deployment? (y/n): "
    if /i not "!CONTINUE!"=="y" exit /b 1
)

echo.
echo Deploying NFT contract...
near deploy %NFT_ACCOUNT% contracts\near\nft_collection\res\cardclash_nft.wasm

if %errorlevel% neq 0 (
    echo NFT deploy failed!
    pause
    exit /b 1
)

echo.
echo Initializing NFT contract...
near call %NFT_ACCOUNT% new "{\"owner_id\": \"%OWNER_ACCOUNT%\", \"treasury\": \"%TREASURY_ACCOUNT%\"}" --accountId %OWNER_ACCOUNT%

echo.
echo Creating Escrow contract account...
near create-account %ESCROW_ACCOUNT% --masterAccount %OWNER_ACCOUNT% --initialBalance 5

if %errorlevel% neq 0 (
    echo Failed to create Escrow account!
    echo Maybe account already exists? Try deploying directly.
    set /p CONTINUE="Continue with deployment? (y/n): "
    if /i not "!CONTINUE!"=="y" exit /b 1
)

echo.
echo Deploying Escrow contract...
near deploy %ESCROW_ACCOUNT% contracts\near\escrow\res\cardclash_escrow.wasm

if %errorlevel% neq 0 (
    echo Escrow deploy failed!
    pause
    exit /b 1
)

echo.
echo Initializing Escrow contract...
near call %ESCROW_ACCOUNT% new "{}" --accountId %OWNER_ACCOUNT%

echo.
echo ========================================
echo   MAINNET Deployment Complete!
echo ========================================
echo.
echo NFT Contract: %NFT_ACCOUNT%
echo Escrow Contract: %ESCROW_ACCOUNT%
echo.
echo Update frontend\.env with:
echo VITE_NEAR_NFT_CONTRACT_ID=%NFT_ACCOUNT%
echo VITE_NEAR_ESCROW_CONTRACT_ID=%ESCROW_ACCOUNT%
echo VITE_NEAR_NETWORK_ID=mainnet
echo VITE_NEAR_RPC_URL=https://rpc.mainnet.near.org
echo.
pause