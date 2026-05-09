/**
 * Unit Tests — Operator Panel Feature Tests
 * ──────────────────────────────────────────
 * Aligned with CNG492 Test Plan Section 5.1 — Operator Interface:
 *   - TC-OP-01: Login
 *   - TC-OP-02: Viewing station-based queues
 *   - TC-OP-03: Queue details
 *   - TC-OP-04: Starting service
 *   - TC-OP-05: Completing service
 *   - TC-OP-06: Marking no-show
 *   - TC-OP-07: Updating facility status
 *   - TC-OP-08: Creating issue reports
 *   - TC-OP-09: Error handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateLoginInput,
  buildStationUpdate,
  countStationStatuses,
  validateIssueInput,
  buildIssueDocument,
  isIssueResolved,
} from '../../operator/src/services/operatorServices.js';


/* ═══════════════════════════════════════════════
   TC-OP-01: Operator Login
   "Validate that an operator can login only with valid credentials"
   ═══════════════════════════════════════════════ */
describe('UT-OP-01: Operator Login Validation', () => {

  it('rejects empty email and password', () => {
    const result = validateLoginInput('', '');
    assert.equal(result.valid, false);
    assert.equal(result.error, 'Please enter email and password.');
  });

  it('rejects empty email with valid password', () => {
    const result = validateLoginInput('', 'password123');
    assert.equal(result.valid, false);
  });

  it('rejects valid email with empty password', () => {
    const result = validateLoginInput('test@example.com', '');
    assert.equal(result.valid, false);
  });

  it('rejects email without @ symbol', () => {
    const result = validateLoginInput('notanemail', 'password123');
    assert.equal(result.valid, false);
    assert.ok(result.error.toLowerCase().includes('valid email'));
  });

  it('accepts valid email and password', () => {
    const result = validateLoginInput('operator@facility.com', 'securepass');
    assert.equal(result.valid, true);
    assert.equal(result.email, 'operator@facility.com');
    assert.equal(result.password, 'securepass');
  });

  it('trims whitespace from inputs', () => {
    const result = validateLoginInput('  user@test.com  ', '  pass  ');
    assert.equal(result.valid, true);
    assert.equal(result.email, 'user@test.com');
    assert.equal(result.password, 'pass');
  });

  it('converts email to lowercase', () => {
    const result = validateLoginInput('Admin@Facility.COM', 'pass');
    assert.equal(result.email, 'admin@facility.com');
  });

  it('rejects null inputs', () => {
    const result = validateLoginInput(null, null);
    assert.equal(result.valid, false);
  });

});


/* ═══════════════════════════════════════════════
   TC-OP-07: Updating Facility Status
   "Validate that the operator can update facility status"
   ═══════════════════════════════════════════════ */
describe('UT-OP-02: Updating Station Information', () => {
  it('builds complete station update object', () => {
    const update = buildStationUpdate('Operational', 'John Doe', '555-1234');
    assert.deepEqual(update, {
      status: 'active',
      contactName: 'John Doe',
      phone: '555-1234'
    });
  });

  it('trims whitespace in contact and phone', () => {
    const update = buildStationUpdate('Maintenance', '  Jane  ', '  555  ');
    assert.equal(update.contactName, 'Jane');
    assert.equal(update.phone, '555');
  });

  it('counts station statuses correctly', () => {
    const stations = [
      { status: 'Operational' },
      { status: 'Operational' },
      { status: 'Maintenance' },
      { status: 'Paused' },
      { status: 'Operational' }
    ];
    const counts = countStationStatuses(stations);
    assert.equal(counts.total, 5);
    assert.equal(counts.operational, 3);
    assert.equal(counts.maintenance, 1);
    assert.equal(counts.paused, 1);
  });

  it('returns zero counts for empty array', () => {
    const counts = countStationStatuses([]);
    assert.equal(counts.total, 0);
    assert.equal(counts.operational, 0);
  });
});


/* ═══════════════════════════════════════════════
   TC-OP-08: Creating Issue Reports
   "Validate that the operator can create and submit issue reports"
   ═══════════════════════════════════════════════ */
describe('UT-OP-03: Creating Issue Reports', () => {

  it('validates: rejects empty title', () => {
    const result = validateIssueInput('', 'ST-1');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Title'));
  });

  it('validates: rejects whitespace-only title', () => {
    const result = validateIssueInput('   ', 'ST-1');
    assert.equal(result.valid, false);
  });

  it('validates: rejects empty station', () => {
    const result = validateIssueInput('Scanner failure', '');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('Station'));
  });

  it('validates: accepts valid title and station', () => {
    const result = validateIssueInput('Power outage', 'ST-2');
    assert.equal(result.valid, true);
  });

  it('builds issue document with all fields', () => {
    const doc = buildIssueDocument({
      title: 'Scanner broken',
      station: 'ST-1',
      priority: 'High',
      reporter: 'Jane',
      description: 'The barcode scanner stopped working',
      timestamp: '2025-06-15 09:00'
    });

    assert.equal(doc.Title, 'Scanner broken');
    assert.equal(doc.Facility, 'ST-1');
    assert.equal(doc.Priority, 'High');
    assert.equal(doc.Status, 'Waiting');
    assert.equal(doc.reporter, 'Jane');
    assert.equal(doc.description, 'The barcode scanner stopped working');
    assert.equal(doc.comments.length, 1);
    assert.equal(doc.comments[0].by, 'Jane');
  });

  it('uses default description when none provided', () => {
    const doc = buildIssueDocument({ title: 'Test', station: 'ST-1', priority: 'Low' });
    assert.equal(doc.description, 'Operator created issue.');
  });

  it('uses default reporter when none provided', () => {
    const doc = buildIssueDocument({ title: 'Test', station: 'ST-1' });
    assert.equal(doc.reporter, 'Operator Desk');
  });
});


/* ═══════════════════════════════════════════════
   TC-OP-09: Error Handling
   "Validate that appropriate error messages are displayed"
   ═══════════════════════════════════════════════ */
describe('UT-OP-04: Error Handling', () => {

  it('login validation returns descriptive error for empty fields', () => {
    const r = validateLoginInput('', '');
    assert.equal(r.valid, false);
    assert.ok(typeof r.error === 'string');
    assert.ok(r.error.length > 0);
  });

  it('login validation returns descriptive error for invalid email', () => {
    const r = validateLoginInput('bademail', 'pass');
    assert.equal(r.valid, false);
    assert.ok(r.error.length > 0);
  });

  it('issue validation returns specific error for missing title', () => {
    const r = validateIssueInput('', 'ST-1');
    assert.ok(r.error.includes('Title'));
  });

  it('issue validation returns specific error for missing station', () => {
    const r = validateIssueInput('Test issue', '');
    assert.ok(r.error.includes('Station'));
  });

  it('station status count handles empty array without error', () => {
    const counts = countStationStatuses([]);
    assert.equal(counts.total, 0);
  });

});
