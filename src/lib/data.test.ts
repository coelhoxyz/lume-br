import assert from 'node:assert/strict';
import test from 'node:test';
import { deputies } from '../../tests/fixtures/demo.ts';
import {
  defaultPeriod,
  buildPeriods,
  resolvePeriod,
  normalizeSearch,
  selectExpenses,
  selectVotes,
  selectProposals,
  expenseTotalCents,
  expenseMonths,
  expenseCategories,
  latestActivity,
  selectAmendments,
  sumKnown,
  type Deputy,
} from './data.ts';

const periods = buildPeriods(new Date('2026-10-05T12:00:00Z'));

test('six fictional SP profiles have complete, uniquely identified records', () => {
  assert.equal(deputies.length, 6);
  assert.equal(new Set(deputies.map((deputy) => deputy.id)).size, 6);
  for (const deputy of deputies) {
    assert.equal(deputy.state, 'SP');
    assert.equal(deputy.mandate, '2023–2027');
    assert.equal(deputy.sourceLabel, 'Dados fictícios para demonstração');
    assert.equal(deputy.photo, `/images/${deputy.id}.webp`);
    assert.equal(deputy.amendments.length, 3);
    assert.ok(deputy.expenses.length >= 6);
    assert.ok(deputy.votes.length >= 5);
    assert.ok(deputy.proposals.length >= 3);
    const records = [...deputy.expenses, ...deputy.votes, ...deputy.proposals, ...deputy.amendments];
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
    assert.ok(deputy.expenses.every((expense) => Number.isInteger(expense.amountCents) && expense.amountCents! >= 0 && expense.receiptUrl === null && expense.date.endsWith('-01')));
    assert.ok(deputy.votes.every((vote) => vote.proposalCode.startsWith('EXEMPLO-') && vote.sourceUrl === null));
    assert.ok(deputy.proposals.every((proposal) => proposal.code.startsWith('EXEMPLO-') && proposal.sourceUrl === null));
  }
});

test('period resolution and accented searches are stable', () => {
  assert.equal(resolvePeriod(), defaultPeriod);
  assert.equal(resolvePeriod('quarter').id, 'quarter');
  assert.equal(resolvePeriod('invalid'), defaultPeriod);
  assert.equal(normalizeSearch('  LÚCIA   Bittencourt  '), 'lucia bittencourt');
  assert.deepEqual(periods.map(({ start, end }) => [start, end]), [
    ['2026-04-01', '2026-09-30'], ['2026-07-01', '2026-09-30'], ['2026-09-01', '2026-09-30'],
  ]);
  assert.equal(buildPeriods(new Date('2027-01-01T02:00:00Z'))[0]?.start, '2026-06-01');
});

test('all time selections are inclusive, bounded, and date ordered', () => {
  const helena = deputies[0]!;
  for (const period of periods) {
    for (const records of [selectExpenses(helena, period), selectVotes(helena, period), selectProposals(helena, period)]) {
      assert.ok(records.every((record) => record.date >= period.start && record.date <= period.end));
      assert.deepEqual(records.map((record) => record.date), [...records.map((record) => record.date)].sort().reverse());
    }
  }
  assert.equal(selectExpenses(helena, periods[2]!).length, 2);
  assert.equal(selectVotes(helena, periods[2]!).length, 1);
  assert.equal(selectProposals(helena, periods[2]!).length, 1);
});

test('expense category and month totals reconcile with filtered cents', () => {
  for (const deputy of deputies) {
    for (const period of periods) {
      const expenses = selectExpenses(deputy, period);
      const total = expenseTotalCents(expenses);
      const months = expenseMonths(expenses, period);
      const categories = expenseCategories(expenses);
      assert.equal(months.reduce((sum, month) => sum + month.totalCents, 0), total);
      assert.equal(categories.reduce((sum, category) => sum + category.totalCents, 0), total);
      assert.equal(categories.reduce((sum, category) => sum + category.count, 0), expenses.length);
      assert.equal(months.length, period.id === 'six-months' ? 6 : period.id === 'quarter' ? 3 : 1);
    }
  }
  const helena = deputies[0]!;
  assert.equal(expenseTotalCents(selectExpenses(helena, periods[2]!)), 567300);
  assert.deepEqual(expenseMonths([], periods[0]!).map((month) => month.totalCents), [0, 0, 0, 0, 0, 0]);
});

test('latest activity uses the latest actual record in a period', () => {
  const helena = deputies[0]!;
  assert.deepEqual(latestActivity(helena, periods[2]!), {
    type: 'proposal', id: 'hm-p3', title: 'Formação para educadores rurais', date: '2026-09-25',
  });
  const empty = { ...helena, expenses: [], votes: [], proposals: [] } satisfies Deputy;
  assert.equal(latestActivity(empty, periods[0]!), null);
});

test('amendment snapshots respect the cutoff and distinguish unknown from zero', () => {
  const helena = deputies[0]!;
  const before = selectAmendments(helena, '2026-04-30');
  assert.ok(before.every((amendment) => amendment.latestSnapshot === null));
  const august = selectAmendments(helena, '2026-08-31');
  assert.equal(august[0]?.latestSnapshot?.paidCents, 8000000);
  assert.equal(august[1]?.latestSnapshot?.paidCents, 0);
  assert.equal(august[2]?.latestSnapshot?.paidCents, null);
  const september = selectAmendments(helena, '2026-09-30');
  assert.equal(september[0]?.latestSnapshot?.paidCents, 18000000);
  assert.equal(september[1]?.latestSnapshot?.paidCents, 0);
  assert.equal(september[2]?.latestSnapshot?.paidCents, null);
  assert.deepEqual(sumKnown(september.map((amendment) => amendment.latestSnapshot?.paidCents ?? null)), {
    totalCents: 18000000, missingCount: 1,
  });
  assert.deepEqual(sumKnown([null, 0, 1200, null]), { totalCents: 1200, missingCount: 2 });
});
