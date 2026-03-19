@echo off
echo Building Escrow contract...

set RUSTFLAGS=-C link-arg=-s
cargo build --target wasm32-unknown-unknown --release

if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

if not exist res mkdir res
copy target\wasm32-unknown-unknown\release\cardclash_escrow.wasm res\

echo Build complete: res\cardclash_escrow.wasm