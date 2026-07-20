"use strict";

        function exportData() {
            const exportObject = {
                application: "Семейный бюджет",
                version: CURRENT_SCHEMA_VERSION,
                exportedAt: new Date().toISOString(),
                data: state
            };

            const json = JSON.stringify(exportObject, null, 2);
            const blob = new Blob([json], {
                type: "application/json;charset=utf-8"
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `family-budget-${getToday()}.json`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(url);

            showToast("Резервная копия создана.");
        }

        /**
         * Читает выбранный JSON-файл и заменяет текущие данные.
         */
        function importData(event) {
            const file = event.target.files?.[0];

            if (!file) {
                return;
            }

            const maximumImportSize = 5 * 1024 * 1024;
            if (file.size > maximumImportSize) {
                showToast("Backup file is too large. Maximum size is 5 MB.", "error");
                elements.importFileInput.value = "";
                return;
            }

            const reader = new FileReader();

            reader.onload = () => {
                try {
                    const parsed = JSON.parse(reader.result);
                    const migratedBackup = migrateImportedBackupMoney(parsed);
                    const importedState = validateAccountsAndTransfers(migratedBackup, validateImportedBackup(migratedBackup));
const confirmed = window.confirm(
                        "Импорт заменит текущие данные. Продолжить?"
                    );

                    if (!confirmed) {
                        return;
                    }

                    replaceState({
                        schemaVersion: CURRENT_SCHEMA_VERSION,
                        accounts: importedState.accounts,
                        transfers: importedState.transfers,
                        transactions: importedState.transactions,
                        goals: importedState.goals,
                        contributions: importedState.contributions
                    });

                    resetAllForms();
                    commitChanges();
                    showToast("Данные успешно импортированы.");
                } catch (error) {
                    console.error("Ошибка импорта:", error);
                    if (error instanceof ImportValidationError) {
                        showToast(`Файл отклонён: ${error.message}`, "error");
                        return;
                    }
                    showToast(
                        "Не удалось импортировать файл. Проверьте его формат.",
                        "error"
                    );
                } finally {
                    elements.importFileInput.value = "";
                }
            };

            reader.onerror = () => {
                showToast("Ошибка чтения файла.", "error");
                elements.importFileInput.value = "";
            };

            reader.readAsText(file, "UTF-8");
        }

        function resetAllData() {
            const confirmed = window.confirm(
                "Удалить все операции, финансовые цели и вклады? " +
                "Это действие нельзя отменить."
            );

            if (!confirmed) {
                return;
            }

            resetState();

            localStorage.removeItem(STORAGE_KEY);
            resetAllForms();
            renderAll();

            showToast("Все данные удалены.");
        }
