const FIRST = [
  'James', 'Maria', 'Robert', 'Linda', 'Michael', 'Patricia', 'David', 'Jennifer',
  'William', 'Elizabeth', 'Richard', 'Barbara', 'Joseph', 'Susan', 'Thomas',
  'Jessica', 'Charles', 'Sarah', 'Daniel', 'Karen',
];

const LAST = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', "O'Brien", 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Nguyen', 'Taylor', 'Moore', 'Jackson', 'Martin',
];

const STATES = ['CA', 'TX', 'NY', 'FL', 'WA', 'CO', 'IL', 'GA', 'AZ', 'NC'];
const STATUSES = ['Approved', 'Pending', 'Denied', 'Withdrawn'];

// Deterministic dataset — no randomness, so expected values in test cases stay stable.
function build() {
  const rows = [];
  for (let i = 0; i < 60; i++) {
    // First and last name lists are the same length, so a plain `i % len` on both
    // would lock them in step and every "Smith" would also be a "James". Offsetting
    // the first name by the cycle count keeps the combinations varied.
    const first = FIRST[(i + Math.floor(i / LAST.length)) % FIRST.length];
    const last = LAST[i % LAST.length];
    rows.push({
      id: i + 1,
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}${i + 1}@example.com`,
      ssn: `${100 + i}-${10 + (i % 89)}-${String(1000 + i * 7).slice(-4)}`,
      creditScore: 580 + ((i * 37) % 241),
      loanAmount: 50000 + ((i * 17) % 40) * 25000,
      state: STATES[i % STATES.length],
      status: STATUSES[i % STATUSES.length],
      submittedAt: `2026-0${(i % 6) + 1}-${String((i % 27) + 1).padStart(2, '0')}`,
    });
  }

  // Fixed anchor values so boundary cases are exact and repeatable.
  rows[5].creditScore = 700;   // Patricia Garcia  — exactly at a common filter boundary
  rows[12].creditScore = 700;  // Joseph Gonzalez  — second borrower at the boundary
  rows[3].loanAmount = 90000;  // Linda Brown      — sorts after 100000 if compared as text
  rows[7].loanAmount = 100000; // Jennifer Davis
  rows[9].loanAmount = 950000; // Elizabeth Martinez

  return rows;
}

export const borrowers = build();
