"use strict";

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getToday() {
    return getLocalDateString();
}

function getYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getLocalDateString(yesterday);
}

function parseUtcDate(dateString) {
    const parts = String(dateString || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addUtcMonths(date, months, preferredDay) {
    const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(preferredDay, lastDay));
    return result;
}

function getMonthsUntil(dateString) {
    if (!dateString) return null;
    const deadline = new Date(`${dateString}T23:59:59`);
    const difference = deadline.getTime() - Date.now();
    if (difference <= 0) return 0;
    return Math.max(1, Math.ceil(difference / (1000 * 60 * 60 * 24 * 30.44)));
}
