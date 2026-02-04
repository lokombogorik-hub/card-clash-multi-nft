@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   Card Clash - NEAR Testnet Deploy
echo ========================================
echo.

REM Set new RPC endpoint
set NEAR_ENV=testnet
set NEAR_NODE_URL=https://rpc.testnet.near.org

set OWNER_ACCOUNT=digitalbunny.testnet
set TREASURY_ACCOUNT=digitalbunny.testnet

echo Using account: %OWNER_ACCOUNT%
echo.

echo ========================================
echo Building NFT contract...
echo ========================================

cd /d "%~dp0\..\contracts\near\nft_collection"

set RUSTFLAGS=-C link-arg=-s
cargo build --target wasm32-unknown-unknown --release

if %errorlevel% neq 0 (
    echo NFT build failed!
    pause
    exit /b 1
)

if not exist res mkdir res
copy target\wasm32-unknown-unknown\release\cardclash_nft.wasm res\

echo.
echo ========================================
echo Building Escrow contract...
echo ========================================

cd /d "%~dp0\..\contracts\near\escrow"

set RUSTFLAGS=-C link-arg=-s
cargo build --target wasm32-unknown-unknown --release

if %errorlevel% neq 0 (
    echo Escrow build failed!
    pause
    exit /b 1
)

if not exist res mkdir res
copy target\wasm32-unknown-unknown\release\cardclash_escrow.wasm res\

cd /d "%~dp0\.."

echo.
echo Generating random contract names...
set /a RAND1=%random% %% 99999
set /a RAND2=%random% %% 99999
set NFT_ACCOUNT=cardclash-nft-%RAND1%.testnet
set ESCROW_ACCOUNT=escrow-%RAND2%.testnet

echo NFT Account: %NFT_ACCOUNT%
echo Escrow Account: %ESCROW_ACCOUNT%
echo.

echo Creating NFT contract account...
near create-account %NFT_ACCOUNT% --masterAccount %OWNER_ACCOUNT% --initialBalance 3 --nodeUrl https://rpc.testnet.near.org

if %errorlevel% neq 0 (
    echo Failed to create NFT account!
    echo.
    echo Possible reasons:
    echo 1. Not enough balance on %OWNER_ACCOUNT%
    echo 2. Credentials not found - run: near login
    echo.
    pause
    exit /b 1
)

echo.
echo Deploying NFT contract...
near deploy %NFT_ACCOUNT% contracts\near\nft_collection\res\cardclash_nft.wasm --nodeUrl https://rpc.testnet.near.org

if %errorlevel% neq 0 (
    echo NFT deploy failed!
    pause
    exit /b 1
)

echo.
echo Initializing NFT contract...
near call %NFT_ACCOUNT% new "{\"owner_id\": \"%OWNER_ACCOUNT%\", \"treasury\": \"%TREASURY_ACCOUNT%\"}" --accountId %OWNER_ACCOUNT% --nodeUrl https://rpc.testnet.near.org

echo.
echo Creating Escrow contract account...
near create-account %ESCROW_ACCOUNT% --masterAccount %OWNER_ACCOUNT% --initialBalance 2 --nodeUrl https://rpc.testnet.near.org

if %errorlevel% neq 0 (
    echo Failed to create Escrow account!
    pause
    exit /b 1
)

echo.
echo Deploying Escrow contract...
near deploy %ESCROW_ACCOUNT% contracts\near\escrow\res\cardclash_escrow.wasm --nodeUrl https://rpc.testnet.near.org

if %errorlevel% neq 0 (
    echo Escrow deploy failed!
    pause
    exit /b 1
)

echo.
echo Initializing Escrow contract...
near call %ESCROW_ACCOUNT% new "{}" --accountId %OWNER_ACCOUNT% --nodeUrl https://rpc.testnet.near.org

echo.
echo ========================================
echo   Testnet Deployment Complete!
echo ========================================
echo.
echo NFT Contract: %NFT_ACCOUNT%
echo Escrow Contract: %ESCROW_ACCOUNT%
echo.
echo Update frontend\.env with:
echo VITE_NEAR_NFT_CONTRACT_ID=%NFT_ACCOUNT%
echo VITE_NEAR_ESCROW_CONTRACT_ID=%ESCROW_ACCOUNT%
echo VITE_NEAR_NETWORK_ID=testnet
echo VITE_NEAR_RPC_URL=https://rpc.testnet.near.org
echo.
pause