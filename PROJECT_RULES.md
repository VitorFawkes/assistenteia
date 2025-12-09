# Project Rules & Context

This file serves as the "Long Term Memory" for the AI Assistant (Antigravity) working on this project.
**ALWAYS READ THIS FILE AT THE START OF A SESSION.**

## 1. Critical Technical Rules

### Date & Timezone Handling
**Context:** The application users are primarily in Brazil (GMT-3).
**Problem:** Dates stored as `YYYY-MM-DD` strings are often parsed by JavaScript `new Date()` as UTC midnight. When displayed in the user's local timezone (GMT-3), they shift to the previous day (e.g., `2024-12-01` becomes `2024-11-30 21:00`).
**RULE:**
*   **Parsing:** When parsing a date string that is purely a date (e.g., "2024-12-01"), **ALWAYS** force it to noon or handle the timezone offset explicitly to prevent day shifting.
    *   *Bad:* `new Date("2024-12-01")` -> Result: Nov 30 (in GMT-3)
    *   *Good:* `new Date("2024-12-01T12:00:00")` -> Result: Dec 01 (in GMT-3)
*   **Display:** Use `date-fns` with `ptBR` locale for formatting.
*   **Filtering:** Apply the same parsing logic to filters to ensure "This Month" includes the 1st of the month correctly.

## 2. Meta-Rules (AI Behavior)

### Lessons Learned Protocol
**Rule:** When a significant bug is fixed or a recurrent issue is identified, **YOU MUST** add a new entry to the "Lessons Learned" section below.
**Format:**
*   **Issue:** Brief description of the problem.
*   **Solution:** How it was fixed.
*   **Prevention:** Rule to follow to avoid recurrence.

## 3. Lessons Learned

### [2024-12-09] Date Off-by-One Error in Collections
*   **Issue:** Items with date "2024-12-01" were displaying as "30 nov" and failing "This Month" filters.
*   **Solution:** Implemented a `parseDate` helper in `CollectionsPage.tsx` that appends `T12:00:00` to `YYYY-MM-DD` strings.
*   **Prevention:** Always use the "Noon Strategy" or explicit timezone handling for date-only strings in frontend components.

### [2024-12-09] Responsive Design Integrity
*   **Issue:** Fixing mobile layout sometimes breaks desktop layout.
*   **Solution:** Use mobile-first Tailwind classes (e.g., `flex-col md:flex-row`) and verify both viewports.
*   **Prevention:** **NEVER** change a layout property without considering its impact on larger screens. Always use breakpoints (`md:`, `lg:`) when overriding for mobile.
