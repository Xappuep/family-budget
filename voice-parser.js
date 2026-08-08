"use strict";

/**
 * Чистый локальный разбор голосовой команды для Quick Add.
 * Без DOM, state, toast и создания операций.
 */

const VOICE_PREPOSITIONS = Object.freeze([
    "с",
    "со",
    "на",
    "от",
    "из"
]);

const VOICE_EXPENSE_MARKERS = Object.freeze([
    "расход",
    "потратил",
    "потратила",
    "потратили",
    "заплатил",
    "заплатила",
    "оплатил",
    "оплатила",
    "купил",
    "купила"
]);

const VOICE_INCOME_MARKERS = Object.freeze([
    "доход",
    "получил",
    "получила",
    "получили",
    "поступило",
    "пришло",
    "зарплата",
    "подработка",
    "продажи"
]);

const VOICE_CATEGORY_ALIASES = Object.freeze({
    еда: "Продукты",
    продукт: "Продукты",
    продукты: "Продукты",
    коммуналка: "Коммунальные услуги",
    такси: "Транспорт",
    аптека: "Здоровье",
    учеба: "Образование",
    учёба: "Образование",
    кредит: "Кредиты",
    кредиты: "Кредиты",
    зарплата: "Зарплата",
    подработка: "Подработка",
    продажи: "Продажи",
    подарки: "Подарки",
    транспорт: "Транспорт",
    жилье: "Жильё",
    жильё: "Жильё",
    здоровье: "Здоровье",
    образование: "Образование",
    дети: "Дети",
    одежда: "Одежда",
    развлечения: "Развлечения",
    путешествия: "Путешествия",
    другое: "Другое"
});

const VOICE_UNITS = Object.freeze({
    ноль: 0,
    один: 1,
    одна: 1,
    одно: 1,
    два: 2,
    две: 2,
    три: 3,
    четыре: 4,
    пять: 5,
    шесть: 6,
    семь: 7,
    восемь: 8,
    девять: 9
});

const VOICE_TEENS = Object.freeze({
    десять: 10,
    одиннадцать: 11,
    двенадцать: 12,
    тринадцать: 13,
    четырнадцать: 14,
    пятнадцать: 15,
    шестнадцать: 16,
    семнадцать: 17,
    восемнадцать: 18,
    девятнадцать: 19
});

const VOICE_TENS = Object.freeze({
    двадцать: 20,
    тридцать: 30,
    сорок: 40,
    пятьдесят: 50,
    шестьдесят: 60,
    семьдесят: 70,
    восемьдесят: 80,
    девяносто: 90
});

const VOICE_HUNDREDS = Object.freeze({
    сто: 100,
    двести: 200,
    триста: 300,
    четыреста: 400,
    пятьсот: 500,
    шестьсот: 600,
    семьсот: 700,
    восемьсот: 800,
    девятьсот: 900
});

function normalizeVoiceText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/\u00a0/g, " ")
        .replace(/[«»"']/g, "")
        .replace(/[.,!?;:()[\]{}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function addDaysToDateString(dateString, days) {
    const parts = String(dateString || "").split("-").map(Number);

    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
        return dateString;
    }

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    date.setUTCDate(date.getUTCDate() + days);

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function tokenizeVoiceText(normalized) {
    return String(normalized || "")
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean);
}

function isVoiceNumberWord(token) {
    return Boolean(
        Object.prototype.hasOwnProperty.call(VOICE_UNITS, token) ||
            Object.prototype.hasOwnProperty.call(VOICE_TEENS, token) ||
            Object.prototype.hasOwnProperty.call(VOICE_TENS, token) ||
            Object.prototype.hasOwnProperty.call(VOICE_HUNDREDS, token) ||
            token === "тысяча" ||
            token === "тысячи" ||
            token === "тысяч"
    );
}

/**
 * Разбирает последовательность русских числительных в целое число.
 * Поддерживает единицы, 10–19, десятки, сотни, тысячи.
 */
function parseRussianNumberWords(tokens) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return null;
    }

    let total = 0;
    let current = 0;
    let matched = false;

    for (const token of tokens) {
        if (Object.prototype.hasOwnProperty.call(VOICE_UNITS, token)) {
            current += VOICE_UNITS[token];
            matched = true;
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(VOICE_TEENS, token)) {
            current += VOICE_TEENS[token];
            matched = true;
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(VOICE_TENS, token)) {
            current += VOICE_TENS[token];
            matched = true;
            continue;
        }

        if (Object.prototype.hasOwnProperty.call(VOICE_HUNDREDS, token)) {
            current += VOICE_HUNDREDS[token];
            matched = true;
            continue;
        }

        if (token === "тысяча" || token === "тысячи" || token === "тысяч") {
            if (current === 0) {
                current = 1;
            }

            total += current * 1000;
            current = 0;
            matched = true;
            continue;
        }

        return null;
    }

    if (!matched) {
        return null;
    }

    return total + current;
}

function extractVoiceAmount(normalized) {
    const currencyPattern =
        /(\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:рублей|рубля|руб|р|₽)/u;
    const currencyMatch = normalized.match(currencyPattern);

    if (currencyMatch) {
        const whole = currencyMatch[1].replace(/ /g, "");
        const fraction = currencyMatch[2] || "0";
        const amount = Number(`${whole}.${fraction}`);

        if (Number.isFinite(amount) && amount > 0) {
            return {
                amount,
                matchedText: currencyMatch[0]
            };
        }
    }

    const tokens = tokenizeVoiceText(normalized);
    const currencyIndex = tokens.findIndex((token) =>
        ["рублей", "рубля", "руб", "р", "₽"].includes(token)
    );

    if (currencyIndex > 0) {
        let start = currencyIndex - 1;

        while (start >= 0 && isVoiceNumberWord(tokens[start])) {
            start -= 1;
        }

        const numberTokens = tokens.slice(start + 1, currencyIndex);
        const wordAmount = parseRussianNumberWords(numberTokens);

        if (Number.isFinite(wordAmount) && wordAmount > 0) {
            return {
                amount: wordAmount,
                matchedText: numberTokens.concat(tokens[currencyIndex]).join(" ")
            };
        }
    }

    const bareDigitMatch = normalized.match(
        /(?:^|\s)(\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?=\s|$)/u
    );

    if (bareDigitMatch) {
        const whole = bareDigitMatch[1].replace(/ /g, "");
        const fraction = bareDigitMatch[2] || "0";
        const amount = Number(`${whole}.${fraction}`);

        if (Number.isFinite(amount) && amount > 0) {
            return {
                amount,
                matchedText: bareDigitMatch[0].trim()
            };
        }
    }

    return {
        amount: null,
        matchedText: ""
    };
}

function extractVoiceComment(normalized) {
    const markerMatch = normalized.match(
        /(?:^|\s)(?:комментарий|примечание)\s+(.+)$/u
    );

    if (!markerMatch) {
        return {
            comment: "",
            matchedText: ""
        };
    }

    return {
        comment: markerMatch[1].trim(),
        matchedText: markerMatch[0].trim()
    };
}

function extractVoiceDate(normalized, today) {
    if (/(?:^|\s)позавчера(?:\s|$)/u.test(normalized)) {
        return {
            date: addDaysToDateString(today, -2),
            recognized: true,
            matchedText: "позавчера"
        };
    }

    if (/(?:^|\s)вчера(?:\s|$)/u.test(normalized)) {
        return {
            date: addDaysToDateString(today, -1),
            recognized: true,
            matchedText: "вчера"
        };
    }

    if (/(?:^|\s)сегодня(?:\s|$)/u.test(normalized)) {
        return {
            date: today,
            recognized: true,
            matchedText: "сегодня"
        };
    }

    return {
        date: today,
        recognized: false,
        matchedText: ""
    };
}

function collectCategoryCandidates(categories) {
    const expense = Array.isArray(categories?.expense) ? categories.expense : [];
    const income = Array.isArray(categories?.income) ? categories.income : [];
    return [...new Set([...expense, ...income])];
}

function extractVoiceCategory(normalized, categories) {
    const candidates = collectCategoryCandidates(categories)
        .slice()
        .sort((first, second) => second.length - first.length);

    for (const category of candidates) {
        const needle = normalizeVoiceText(category);

        if (needle && normalized.includes(needle)) {
            return {
                category,
                recognized: true
            };
        }
    }

    const tokens = tokenizeVoiceText(normalized);

    for (const token of tokens) {
        if (Object.prototype.hasOwnProperty.call(VOICE_CATEGORY_ALIASES, token)) {
            return {
                category: VOICE_CATEGORY_ALIASES[token],
                recognized: true
            };
        }
    }

    // Частичные совпадения вроде «продукт» внутри «продукты» уже покрыты aliases.
    for (const [alias, category] of Object.entries(VOICE_CATEGORY_ALIASES)) {
        if (alias.length >= 4 && normalized.includes(alias)) {
            return {
                category,
                recognized: true
            };
        }
    }

    return {
        category: "",
        recognized: false
    };
}

function significantAccountTokens(name) {
    return tokenizeVoiceText(normalizeVoiceText(name)).filter(
        (token) => !VOICE_PREPOSITIONS.includes(token) && token.length > 1
    );
}

function isAccountTypeToken(token) {
    const value = normalizeVoiceText(token);
    return (
        value.startsWith("счет") ||
        value.startsWith("карт") ||
        value.startsWith("кошел")
    );
}

/**
 * Упрощённый stem для падежей: основного→основн, счета→счет, карты→карт.
 */
function stemVoiceToken(token) {
    const value = normalizeVoiceText(token);

    if (!value) {
        return "";
    }

    if (value.startsWith("счет")) {
        return "счет";
    }

    if (value.startsWith("карт")) {
        return "карт";
    }

    if (value.startsWith("кошел")) {
        return "кошел";
    }

    const endings = [
        "ого",
        "ему",
        "ому",
        "ыми",
        "ими",
        "ой",
        "ей",
        "ая",
        "ое",
        "ые",
        "ие",
        "ый",
        "ий",
        "ов",
        "ев",
        "ам",
        "ям",
        "ах",
        "ях",
        "ом",
        "ем",
        "у",
        "ю",
        "а",
        "я",
        "е",
        "и",
        "ы"
    ];

    for (const ending of endings) {
        if (
            value.length - ending.length >= 4 &&
            value.endsWith(ending)
        ) {
            return value.slice(0, -ending.length);
        }
    }

    return value;
}

function voiceTokensMatch(accountToken, speechToken) {
    const left = normalizeVoiceText(accountToken);
    const right = normalizeVoiceText(speechToken);

    if (!left || !right) {
        return false;
    }

    if (left === right) {
        return true;
    }

    const leftStem = stemVoiceToken(left);
    const rightStem = stemVoiceToken(right);

    if (leftStem && leftStem === rightStem && leftStem.length >= 4) {
        return true;
    }

    if (left.length < 4 || right.length < 4) {
        return false;
    }

    const prefixLength = Math.min(left.length, right.length, 6);

    return (
        left.slice(0, prefixLength) === right.slice(0, prefixLength) ||
        left.startsWith(right.slice(0, 4)) ||
        right.startsWith(left.slice(0, 4))
    );
}

function scoreAccountMatch(normalizedSpeech, account) {
    const accountTokens = significantAccountTokens(account?.name || "");
    const speechTokens = tokenizeVoiceText(normalizedSpeech).filter(
        (token) => !VOICE_PREPOSITIONS.includes(token) && token.length > 1
    );

    if (accountTokens.length === 0 || speechTokens.length === 0) {
        return 0;
    }

    let score = 0;

    for (const accountToken of accountTokens) {
        const matched = speechTokens.some((speechToken) =>
            voiceTokensMatch(accountToken, speechToken)
        );

        if (!matched) {
            continue;
        }

        // Descriptor (основной, тестовая, резерв) весит больше type-noun (счёт, карта).
        score += isAccountTypeToken(accountToken) ? 1 : 3;
    }

    return score;
}

function extractVoiceAccount(normalized, accounts, preferredAccountId) {
    const list = Array.isArray(accounts) ? accounts : [];

    if (list.length === 0) {
        return {
            accountId: preferredAccountId || "",
            recognized: false,
            ambiguous: false
        };
    }

    const scored = list
        .map((account) => ({
            account,
            score: scoreAccountMatch(normalized, account)
        }))
        .filter((item) => item.score > 0)
        .sort((first, second) => second.score - first.score);

    if (scored.length === 0) {
        return {
            accountId: preferredAccountId || list[0].id,
            recognized: false,
            ambiguous: false
        };
    }

    const best = scored[0];
    const tied = scored.filter((item) => item.score === best.score);

    if (tied.length > 1) {
        return {
            accountId: preferredAccountId || best.account.id,
            recognized: false,
            ambiguous: true
        };
    }

    return {
        accountId: best.account.id,
        recognized: true,
        ambiguous: false
    };
}

function categoryMembership(category, categories) {
    if (!category) {
        return {
            inExpense: false,
            inIncome: false
        };
    }

    const expense = Array.isArray(categories?.expense) ? categories.expense : [];
    const income = Array.isArray(categories?.income) ? categories.income : [];

    return {
        inExpense: expense.includes(category),
        inIncome: income.includes(category)
    };
}

/**
 * Явные markers имеют приоритет. Иначе type по membership в
 * context.categories.expense / income (без отдельного expense hardcode).
 */
function extractVoiceType(normalized, category, categories) {
    const hasExpense = VOICE_EXPENSE_MARKERS.some((marker) =>
        normalized.includes(marker)
    );
    const hasIncome = VOICE_INCOME_MARKERS.some((marker) =>
        normalized.includes(marker)
    );

    if (hasIncome && !hasExpense) {
        return {
            type: "income",
            recognized: true
        };
    }

    if (hasExpense && !hasIncome) {
        return {
            type: "expense",
            recognized: true
        };
    }

    if (hasIncome && hasExpense) {
        return {
            type: "expense",
            recognized: false
        };
    }

    const membership = categoryMembership(category, categories);

    if (membership.inExpense && !membership.inIncome) {
        return {
            type: "expense",
            recognized: true
        };
    }

    if (membership.inIncome && !membership.inExpense) {
        return {
            type: "income",
            recognized: true
        };
    }

    return {
        type: "expense",
        recognized: false
    };
}

/**
 * @param {string} text исходный transcript
 * @param {object} context
 * @param {Array<{id:string,name:string}>} context.accounts
 * @param {string} [context.preferredAccountId]
 * @param {string} context.today YYYY-MM-DD
 * @param {{expense:string[],income:string[]}} context.categories
 */
function parseVoiceTransaction(text, context = {}) {
    const transcript = String(text || "").trim();
    const normalized = normalizeVoiceText(transcript);
    const today = context.today || "1970-01-01";
    const accounts = Array.isArray(context.accounts) ? context.accounts : [];
    const preferredAccountId = context.preferredAccountId || "";
    const categories = context.categories || {};

    const warnings = [];
    const amountInfo = extractVoiceAmount(normalized);
    const commentInfo = extractVoiceComment(normalized);
    const dateInfo = extractVoiceDate(normalized, today);
    const categoryInfo = extractVoiceCategory(normalized, categories);
    const accountInfo = extractVoiceAccount(
        normalized,
        accounts,
        preferredAccountId
    );
    const typeInfo = extractVoiceType(
        normalized,
        categoryInfo.category,
        categories
    );

    if (!typeInfo.recognized) {
        warnings.push("Тип операции не распознан — выбран расход.");
    }

    if (amountInfo.amount === null) {
        warnings.push("Не удалось определить сумму.");
    }

    if (!categoryInfo.recognized) {
        warnings.push("Категория не распознана — выберите её вручную.");
    }

    if (accountInfo.ambiguous) {
        warnings.push("Не удалось однозначно определить счёт.");
    } else if (!accountInfo.recognized) {
        const preferred =
            accounts.find((account) => account.id === accountInfo.accountId) ||
            accounts.find((account) => account.id === preferredAccountId) ||
            accounts[0];
        const preferredName = preferred?.name || "последний использованный";
        warnings.push(
            `Счёт не распознан — выбран последний использованный: ${preferredName}.`
        );
    }

    return {
        transcript,
        type: typeInfo.type,
        amount: amountInfo.amount,
        category: categoryInfo.category,
        accountId: accountInfo.accountId,
        date: dateInfo.date,
        comment: commentInfo.comment,
        recognized: {
            type: typeInfo.recognized,
            amount: amountInfo.amount !== null,
            category: categoryInfo.recognized,
            account: accountInfo.recognized && !accountInfo.ambiguous,
            date: dateInfo.recognized,
            comment: Boolean(commentInfo.comment)
        },
        warnings
    };
}
