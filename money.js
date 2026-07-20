"use strict";

function toPositiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function rublesToMinor(value) {
    const rubles = Number(value);
    return Number.isFinite(rubles) ? Math.round(rubles * 100) : NaN;
}

function minorToRubles(value) {
    const minor = Number(value);
    return Number.isFinite(minor) ? minor / 100 : 0;
}
