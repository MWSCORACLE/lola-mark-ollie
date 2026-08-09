// The affordability engine for the rental hunt.
// Pure reads over the same SQLite database — shared by the web API and the MCP server.
import { db, getSetting } from "./db.js";

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);

/** Every monthly cost of living in a place, not just the rent. */
export function monthlyCost(r) {
  const parts = {
    rent: Number(r.rent) || 0,
    utilities: Number(r.utilities) || 0,
    internet: Number(r.internet) || 0,
    insurance: Number(r.insurance) || 0,
    pet_rent: Number(r.pet_rent) || 0,
    parking: Number(r.parking) || 0,
    other_monthly: Number(r.other_monthly) || 0,
    commute: Number(r.commute) || 0,
  };
  return { ...parts, total: round(Object.values(parts).reduce((a, b) => a + b, 0)) };
}

/** What you hand over before you get the keys (first month's rent included). */
export function moveInCost(r) {
  const parts = {
    first_month: Number(r.rent) || 0,
    deposit: Number(r.deposit) || 0,
    pet_deposit: Number(r.pet_deposit) || 0,
    application_fee: Number(r.application_fee) || 0,
    move_in_other: Number(r.move_in_other) || 0,
  };
  return { ...parts, total: round(Object.values(parts).reduce((a, b) => a + b, 0)) };
}

export function householdFinances() {
  const incomeRows = db.prepare("SELECT * FROM incomes ORDER BY who, id").all();
  const expenseRows = db.prepare("SELECT * FROM expenses ORDER BY category, id").all();

  const net = round(sum(incomeRows, "amount"));
  // Gross is optional per row; fall back to take-home so the ratio still means something.
  const gross = round(
    incomeRows.reduce((t, r) => t + (Number(r.gross_amount) || Number(r.amount) || 0), 0)
  );
  const anyGross = incomeRows.some((r) => Number(r.gross_amount) > 0);

  // Expenses tied to where you live now disappear the day you move, so they never
  // count against a place you're considering.
  const ongoing = expenseRows.filter((e) => !e.replaced_by_move);
  const replaced = expenseRows.filter((e) => e.replaced_by_move);
  const essential = ongoing.filter((e) => e.essential);
  const flexible = ongoing.filter((e) => !e.essential);

  return {
    income: {
      rows: incomeRows,
      net,
      gross,
      basis: anyGross ? gross : net,
      basis_label: anyGross ? "gross" : "take-home",
    },
    expenses: {
      rows: expenseRows,
      ongoing_total: round(sum(ongoing, "amount")),
      essential_total: round(sum(essential, "amount")),
      flexible_total: round(sum(flexible, "amount")),
      replaced_total: round(sum(replaced, "amount")),
      flexible_rows: flexible,
    },
  };
}

/**
 * Cheapest-to-your-life way to close a monthly gap: cut the biggest flexible
 * expenses first, so you give up as few things as possible.
 */
function cutbackPlan(gap, flexibleRows) {
  if (gap <= 0) return { needed: 0, cuts: [], covered: true, still_short: 0 };
  const cuts = [];
  let remaining = gap;
  for (const e of [...flexibleRows].sort((a, b) => b.amount - a.amount)) {
    if (remaining <= 0.5) break;
    const saves = Math.min(Number(e.amount) || 0, remaining);
    if (saves <= 0) continue;
    cuts.push({
      id: e.id,
      name: e.name,
      category: e.category,
      monthly: round(Number(e.amount) || 0),
      // A partial cut means trimming the category, not dropping it entirely.
      cut: round(saves),
      partial: saves < (Number(e.amount) || 0) - 0.005,
    });
    remaining -= saves;
  }
  return {
    needed: round(gap),
    cuts,
    covered: remaining <= 0.5,
    still_short: round(Math.max(0, remaining)),
  };
}

/** Score one place against the household's real numbers. */
export function evaluateRental(rental, finances, rules) {
  const monthly = monthlyCost(rental);
  const moveIn = moveInCost(rental);
  const { income, expenses } = finances;

  const leftover = round(income.net - monthly.total - expenses.ongoing_total);
  const gap = round(rules.savings_target - leftover);
  const housingRatio = income.basis > 0 ? monthly.total / income.basis : null;
  const rentRatio = income.basis > 0 ? (Number(rental.rent) || 0) / income.basis : null;

  let verdict;
  if (leftover < 0) verdict = "over";
  else if (gap > 0 || (housingRatio !== null && housingRatio > rules.ratio_target)) verdict = "tight";
  else verdict = "comfortable";

  return {
    ...rental,
    monthly,
    move_in: moveIn,
    leftover,
    savings_gap: Math.max(0, gap),
    housing_ratio: housingRatio === null ? null : round(housingRatio),
    rent_ratio: rentRatio === null ? null : round(rentRatio),
    over_ratio_by: // dollars/month above the rule-of-thumb share of income
      income.basis > 0
        ? round(Math.max(0, monthly.total - rules.ratio_target * income.basis))
        : 0,
    verdict,
    cutbacks: cutbackPlan(gap, expenses.flexible_rows),
    // Months of leftover it takes to save the move-in cash.
    months_to_save_move_in:
      leftover > 0 ? Math.ceil(moveIn.total / leftover) : null,
  };
}

export function affordability({ status } = {}) {
  const finances = householdFinances();
  const rules = {
    ratio_target: Number(getSetting("rent_ratio_target")) || 0.3,
    savings_target: Number(getSetting("savings_target")) || 0,
  };

  const rentals = (
    status
      ? db.prepare("SELECT * FROM rentals WHERE status = ? ORDER BY id").all(status)
      : db.prepare("SELECT * FROM rentals ORDER BY id").all()
  ).map((r) => evaluateRental(r, finances, rules));

  const { income, expenses } = finances;
  // Two ceilings: the rule of thumb, and what's actually left after your life.
  const byRatio = round(rules.ratio_target * income.basis);
  const byBudget = round(income.net - expenses.ongoing_total - rules.savings_target);

  return {
    rules,
    income,
    expenses: {
      rows: expenses.rows,
      ongoing_total: expenses.ongoing_total,
      essential_total: expenses.essential_total,
      flexible_total: expenses.flexible_total,
      replaced_total: expenses.replaced_total,
    },
    headline: {
      max_housing_by_ratio: byRatio,
      max_housing_by_budget: byBudget,
      // The honest number: the tighter of the two, floored at zero.
      max_housing: round(Math.max(0, Math.min(byRatio, byBudget))),
      // Same, if you cut every flexible expense you have.
      max_housing_if_cut_everything: round(
        Math.max(0, Math.min(byRatio, byBudget + expenses.flexible_total))
      ),
    },
    rentals,
  };
}
