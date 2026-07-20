"use strict";

function formatMoney(valueMinor) {
    return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "RUB",
        maximumFractionDigits: 2
    }).format(minorToRubles(valueMinor));
}

function formatPercent(value) {
    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function formatDate(dateString) {
    if (!dateString) return "Не указан";
    const [year, month, day] = dateString.split("-").map(Number);
    return new Intl.DateTimeFormat("ru-RU").format(new Date(year, month - 1, day));
}
