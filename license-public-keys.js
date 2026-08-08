"use strict";

/** Public JWKs for FB2 license token verification (no private material). */
const LICENSE_PUBLIC_KEYS = Object.freeze({
    K1: Object.freeze({
        "key_ops": [
            "verify"
        ],
        "ext": true,
        "kty": "EC",
        "x": "zFIjqKcFRZugf2VCVXHll4_2xZJiHXHZO9TTEqzBIzk",
        "y": "d5YeFHkxShFYtN0obVxbc2GQgbaP7vNxVmZ7dT_ogVk",
        "crv": "P-256"
    })
});
