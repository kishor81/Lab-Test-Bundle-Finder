import { useEffect, useMemo, useState } from 'react';
import { ApiError, fetchPlan, fetchTests, type Plan, type Test } from './api';

type PlanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; plan: Plan }
  | { status: 'error'; message: string };

const baht = (n: number) => `฿${n.toLocaleString('en-US')}`;
const list = (xs: string[]) => xs.join(', ');

function describeError(e: unknown, nameOf: (id: string) => string): string {
  if (e instanceof ApiError) {
    const names = list(e.testIds.map(nameOf));
    switch (e.code) {
      case 'EMPTY_SELECTION':
        return 'Pick at least one test to see a plan.';
      case 'INVALID_TESTS':
        return `These tests can't be booked any more: ${names}. Remove them to continue.`;
      case 'NOT_AVAILABLE':
        return `We can't offer ${names} right now. Remove ${e.testIds.length > 1 ? 'them' : 'it'} to see a plan for the rest.`;
    }
  }
  return "We couldn't work out a plan. Check your connection and try again.";
}

export default function App() {
  const [tests, setTests] = useState<Test[]>([]);
  const [testsState, setTestsState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [reloadTests, setReloadTests] = useState(0);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [planState, setPlanState] = useState<PlanState>({ status: 'idle' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setTestsState('loading');
    fetchTests(ctrl.signal)
      .then((t) => {
        setTests(t);
        setTestsState('ok');
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setTestsState('error');
      });
    return () => ctrl.abort();
  }, [reloadTests]);

  const byId = useMemo(() => new Map(tests.map((t) => [t.id, t])), [tests]);
  const nameOf = (id: string) => byId.get(id)?.name ?? 'another test';

  // Live plan. Each change aborts the previous request, and the cleanup flag means a
  // slow, older response can never overwrite a newer one.
  useEffect(() => {
    if (selected.length === 0) {
      setPlanState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    setPlanState({ status: 'loading' });
    fetchPlan(selected, ctrl.signal)
      .then((plan) => {
        if (!ctrl.signal.aborted) setPlanState({ status: 'ok', plan });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setPlanState({ status: 'error', message: describeError(e, nameOf) });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, retry, byId]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter(
      (t) => !selected.includes(t.id) && (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)),
    );
  }, [tests, selected, query]);

  const add = (id: string) => setSelected((s) => (s.includes(id) ? s : [...s, id]));
  const remove = (id: string) => setSelected((s) => s.filter((x) => x !== id));

  return (
    <main className="page">
      <header className="head">
        <h1>Find the cheapest way to book your tests</h1>
        <p>Pick the tests your doctor asked for. We compare packages and single tests and show the lowest price.</p>
      </header>

      <section className="panel" aria-labelledby="pick-h">
        <h2 id="pick-h">Your tests</h2>

        {selected.length > 0 && (
          <ul className="chips" aria-label="Selected tests">
            {selected.map((id) => (
              <li key={id}>
                <span>{nameOf(id)}</span>
                <button type="button" onClick={() => remove(id)} aria-label={`Remove ${nameOf(id)}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="field">
          <span>Search by name or code</span>
          <input
            type="search"
            value={query}
            placeholder="e.g. HbA1c or LIPID"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                add(matches[0].id);
                setQuery('');
              }
            }}
          />
        </label>

        {testsState === 'loading' && <p className="note">Loading tests…</p>}
        {testsState === 'error' && (
          <p className="note error" role="alert">
            We couldn't load the list of tests.{' '}
            <button type="button" className="link" onClick={() => setReloadTests((n) => n + 1)}>
              Try again
            </button>
          </p>
        )}
        {testsState === 'ok' && (
          <ul className="results">
            {matches.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => add(t.id)}>
                  <span className="r-name">{t.name}</span>
                  <span className="r-meta">
                    {t.code} · {t.price === null ? 'in packages only' : baht(t.price)}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="note">{query ? `No tests match “${query}”.` : 'You have selected every available test.'}</li>
            )}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="plan-h" aria-live="polite" aria-busy={planState.status === 'loading'}>
        <h2 id="plan-h">Your cheapest plan</h2>

        {planState.status === 'idle' && <p className="note">Choose one or more tests above and your plan will show up here.</p>}
        {planState.status === 'loading' && <p className="note">Finding the lowest price…</p>}
        {planState.status === 'error' && (
          <div className="note error" role="alert">
            <p>{planState.message}</p>
            {!planState.message.includes('Remove') && (
              <button type="button" className="link" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </button>
            )}
          </div>
        )}
        {planState.status === 'ok' && <PlanView plan={planState.plan} nameOf={nameOf} />}
      </section>
    </main>
  );
}

function PlanView({ plan, nameOf }: { plan: Plan; nameOf: (id: string) => string }) {
  return (
    <div>
      <ol className="ledger">
        {plan.items.map((item) => (
          <li key={item.id}>
            <div className="row">
              <span className="item-name">
                {item.name} <em>{item.type === 'package' ? 'Package' : 'Single test'}</em>
              </span>
              <span className="leader" aria-hidden="true" />
              <span className="price">{baht(item.price)}</span>
            </div>
            <p className="covers">Covers {list(item.covers.map(nameOf))}</p>
          </li>
        ))}
      </ol>

      {plan.extraTests.length > 0 && (
        <p className="bonus">Also included: {list(plan.extraTests.map(nameOf))}</p>
      )}

      <div className="row total">
        <span>Total</span>
        <span className="leader" aria-hidden="true" />
        <span className="price">{baht(plan.total)}</span>
      </div>

      {plan.savings !== null && plan.savings > 0 && (
        <p className="savings">
          You save {baht(plan.savings)} compared with buying each test on its own ({baht(plan.individualTotal!)}).
        </p>
      )}
      {plan.individualTotal === null && (
        <p className="note">Some of your tests are only sold inside packages, so there is no single-test price to compare.</p>
      )}
    </div>
  );
}
