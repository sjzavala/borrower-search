# ⚠️ SPOILERS — planted bugs

**Do not read this until after a practice run.** Knowing the answers destroys the
value of the exercise. Come back here to score yourself.

Ten bugs, spread across API math, filter semantics, rendering, data exposure, and
client state. A strong hour finds 5–7 of them.

---

### 1. Search is case-sensitive — `server/routes.js:38`

`b.lastName.includes(query)` compares raw strings. Searching `smith` returns 0 results;
`Smith` returns 3. **High** — users type lowercase.

### 2. Search query is not trimmed — `server/routes.js:38`

`Smith ` (trailing space) returns 0 results. Same line as #1 but a separate defect —
fixing the case sensitivity does not fix this. **Medium.**

### 3. Pagination drops one record per page — `server/routes.js:53`

`sorted.slice(start, start + limit - 1)` returns `limit - 1` rows while `start` still
advances by `limit`. Page 1 = ids 1–9, page 2 = ids 11–19. **Borrowers 10, 20, 30, 40,
50, 60 are unreachable through the UI.** **Critical** — silent data loss; a search that
should surface a match can miss it entirely.

### 4. `total` ignores all filters — `server/routes.js:61`

Always `borrowers.length` (60). Search `Smith` → 3 rows displayed but "60 borrowers" and
6 pages of pagination, 5 of them empty. **High.**

### 5. Minimum credit score is exclusive — `server/routes.js:47`

`b.creditScore > minScore` should be `>=`. Filtering at `700` excludes the two borrowers
whose score is exactly 700 (ids 6, 13). **High** — a lender filtering at a policy
threshold silently drops qualifying applicants.

### 6. Loan amount sorts as text — `server/routes.js:18`

`String(b.loanAmount).localeCompare(...)`. Descending sort puts `$125,000` above
`$1,025,000`, and `$100,000` lands at position 58 while `$90,000` sits at position 6.
**High.**

### 7. XSS in the empty state — `client/src/App.jsx:116`

`dangerouslySetInnerHTML` interpolates the raw query. Search
`<img src=x onerror=alert(1)>` and it executes. Also try `<b>test</b>` for a quieter
demo. **Critical** — reflected XSS.

### 8. Full SSN in the API response — `server/routes.js` / `client/src/App.jsx`

The UI masks SSNs to `***-**-1000`, but `GET /api/borrowers` returns the complete value
in every record. Visible in the network tab — the masking is cosmetic only. **Critical** —
PII exposure to anyone who can call the endpoint.

### 9. Stale responses overwrite newer ones — `client/src/App.jsx:39`

The `fetch` in `useEffect` has no sequencing guard or abort, and `server/routes.js:56`
makes shorter queries *slower* (`600 - query.length * 120` ms). Type `smith` quickly: the
`smith` response returns first, then the older `s` response lands and overwrites it. The
box says `smith` while the table shows results for `s`. **High** — intermittent, and the
kind of bug that gets closed as "can't reproduce".

### 10. Changing the search does not reset pagination — `client/src/App.jsx:69`

Every other control calls `setPage(1)`; the search input does not. Go to page 3, type a
search, and you get page 3 of the new result set — usually empty, with no indication
why. **Medium.**

---

## Scoring your practice run

| Found | Read |
|---|---|
| 8–10 | Excellent. Focus your remaining prep on speed and on report quality. |
| 5–7 | Solid. Check which category you missed — it's usually network-tab findings (#8) or state bugs (#9, #10). |
| 3–4 | You're probably clicking rather than hypothesizing. Read the Express route *first* next time; it hands you #3, #4, #5, and #6 in about ninety seconds. |

## The lesson to carry into the interview

Six of these ten (#1–#6) are visible by reading one 60-line file before touching the
browser. Reading the API layer first is the single highest-leverage habit you can
demonstrate — it turns exploratory testing from random clicking into hypothesis testing,
and that is exactly the difference the interviewers are watching for.
