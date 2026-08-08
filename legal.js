"use strict";

/* =========================================================
   Legal UI helpers — Version 8.1
   Legal copy lives in index.html <details> sections
   (copyright / privacy / terms / third-party).
   ========================================================= */

function openLegalSection(sectionId) {
    const section = document.getElementById(sectionId);

    if (!section) {
        return;
    }

    if (typeof setMobileTab === "function") {
        setMobileTab("more", { scrollToTop: false });
    }

    const legalPanel =
        (typeof elements !== "undefined" && elements.legalPanel) ||
        document.getElementById("legalPanel");

    if (legalPanel) {
        legalPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (section.tagName === "DETAILS") {
        section.open = true;
    }

    section.focus?.();
}
