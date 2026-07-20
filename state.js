"use strict";

function createDefaultAccount() {
    return { id: DEFAULT_ACCOUNT_ID, name: "Основной счёт", openingBalance: 0 };
}

function createInitialState() {
    return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        accounts: [createDefaultAccount()],
        transfers: [],
        transactions: [],
        goals: [],
        contributions: []
    };
}

let state = createInitialState();

function replaceState(nextState) {
    state = nextState;
    return state;
}

function resetState() {
    return replaceState(createInitialState());
}
