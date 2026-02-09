// Minimal crypto polyfill — only randomBytes is needed by @here-wallet/core
export function randomBytes(size) {
    var bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return {
        buffer: bytes.buffer,
        byteLength: bytes.byteLength,
        byteOffset: bytes.byteOffset,
        length: bytes.length,
        slice: function (a, b) { return bytes.slice(a, b); },
        toString: function (enc) {
            if (enc === "hex") {
                var hex = "";
                for (var i = 0; i < bytes.length; i++) {
                    hex += bytes[i].toString(16).padStart(2, "0");
                }
                return hex;
            }
            return String.fromCharCode.apply(null, bytes);
        },
        // Make it behave like Buffer
        0: bytes[0],
        [Symbol.iterator]: function () { return bytes[Symbol.iterator](); },
    };
}

export function createHash() {
    throw new Error("createHash not available — use js-sha256 directly");
}

export default { randomBytes, createHash };