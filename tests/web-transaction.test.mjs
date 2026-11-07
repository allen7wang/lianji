import test from 'node:test';
import assert from 'node:assert/strict';
import { withWriteTransaction } from '../src/lib/write-transaction.web.ts';
test('browser writes cannot interleave and a failed write does not block the next transaction', async () => {
  const events = [];
  const db = { withTransactionAsync: async callback => { events.push('begin'); try { await callback(); events.push('commit'); } catch (error) { events.push('rollback'); throw error; } } };
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const first = withWriteTransaction(db, async transaction => { assert.equal(transaction, db); events.push('first'); await held; });
  const second = withWriteTransaction(db, async () => { events.push('second'); throw Error('write failed'); });
  const failed = assert.rejects(second, /write failed/);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ['begin', 'first']);
  release(); await first; await failed;
  await withWriteTransaction(db, async () => events.push('third'));
  assert.deepEqual(events, ['begin','first','commit','begin','second','rollback','begin','third','commit']);
});
