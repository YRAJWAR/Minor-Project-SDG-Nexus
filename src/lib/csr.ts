// CSR obligation (Companies Act 2013, s.135): spend at least 2% of the average net profit of the last three
// financial years. Indian financial years run 1 April – 31 March.

/** Start (inclusive) and end (exclusive) of the financial year containing `at`, with its label, e.g. "2026-27". */
export function financialYear(at: Date) {
    const y = at.getMonth() >= 3 ? at.getFullYear() : at.getFullYear() - 1;
    return { start: new Date(y, 3, 1), end: new Date(y + 1, 3, 1), label: `${y}-${String((y + 1) % 100).padStart(2, '0')}` };
}

export function csrObligation(avgNetProfit: number | null, releasedThisYear: number) {
    if (avgNetProfit === null || avgNetProfit <= 0) return null; // not entered: no obligation shown, never guessed
    const required = Math.round(avgNetProfit * 0.02);
    return { required, released: releasedThisYear, remaining: Math.max(0, required - releasedThisYear), met: releasedThisYear >= required };
}
