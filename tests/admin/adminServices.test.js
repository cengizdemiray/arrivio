/**
 * Unit Tests — Admin Panel Feature Tests
 * ───────────────────────────────────────
 * Aligned with CNG492 Test Plan Section 5.1 — Admin Interface:
 *   - TC-AD-01: Login
 *   - TC-AD-02: Pending user management (approve/reject)
 *   - TC-AD-03: User management (roles, filtering)
 *   - TC-AD-04: Blocking/unblocking carriers
 *   - TC-AD-05: Adding/removing stations
 *   - TC-AD-06: Updating facility information
 *   - TC-AD-07: Viewing reports and statistics (via adminUtils)
 *   - TC-AD-08: Resolving issues
 *   - TC-AD-09: Error handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAdminLogin,
  isAdminAuthorized,
  normalizeRequest,
  filterPendingRequests,
  buildApprovalDocument,
  normalizeUser,
  filterUsers,
  normalizeCarrier,
  computeBlockUntilDate,
  buildBlockPayload,
  buildUnblockPayload,
  filterCarriers,
  isBlockExpired,
  getExpiredCarriers,
  parseCoordinate,
  validateStationInput,
  buildStationDocument,
  buildFacilityUpdate,
  normalizeIssue,
  filterIssuesByMode,
  filterStations
} from '../../admin/src/services/adminServices.js';


/* ═══════════════════════════════════════════════
   TC-AD-01: Admin Login
   "Validate that an admin can login only with valid credentials"
   ═══════════════════════════════════════════════ */
describe('TC-AD-01: Admin Login', () => {

  it('rejects empty email', () => {
    const r = validateAdminLogin('', 'pass');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('Email'));
  });

  it('rejects empty password', () => {
    const r = validateAdminLogin('admin@test.com', '');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('Password'));
  });

  it('rejects both empty', () => {
    const r = validateAdminLogin('', '');
    assert.equal(r.valid, false);
  });

  it('accepts valid credentials', () => {
    const r = validateAdminLogin('admin@facility.com', 'securepass');
    assert.equal(r.valid, true);
    assert.equal(r.email, 'admin@facility.com');
  });

  it('trims whitespace', () => {
    const r = validateAdminLogin('  admin@test.com  ', '  pass  ');
    assert.equal(r.email, 'admin@test.com');
    assert.equal(r.password, 'pass');
  });

  it('authorizes when admin doc exists', () => {
    assert.equal(isAdminAuthorized(true), true);
  });

  it('denies when admin doc does not exist', () => {
    assert.equal(isAdminAuthorized(false), false);
  });

  it('denies when admin doc check is undefined', () => {
    assert.equal(isAdminAuthorized(undefined), false);
  });
});


/* ═══════════════════════════════════════════════
   TC-AD-02: Pending User Management
   "Validate that admin can view, approve, and reject pending user registrations"
   ═══════════════════════════════════════════════ */
describe('TC-AD-02: Pending User Management', () => {

  describe('normalizeRequest', () => {
    it('normalizes a standard request document', () => {
      const r = normalizeRequest('doc-1', { name: 'Ali', surname: 'Yilmaz', email: 'ali@test.com', status: 'pending' });
      assert.equal(r.id, 'doc-1');
      assert.equal(r.name, 'Ali');
      assert.equal(r.surname, 'Yilmaz');
      assert.equal(r.email, 'ali@test.com');
      assert.equal(r.status, 'pending');
    });

    it('handles alternative field casing (Name, Email)', () => {
      const r = normalizeRequest('doc-2', { Name: 'Fatma', Email: 'fatma@x.com', Status: 'pending' });
      assert.equal(r.name, 'Fatma');
      assert.equal(r.email, 'fatma@x.com');
    });

    it('defaults to — for missing name/email', () => {
      const r = normalizeRequest('doc-3', {});
      assert.equal(r.name, '—');
      assert.equal(r.email, '—');
      assert.equal(r.status, 'pending');
    });
  });

  describe('filterPendingRequests', () => {
    const requests = [
      { id: '1', name: 'Ali', surname: 'K', email: 'ali@test.com', status: 'pending' },
      { id: '2', name: 'Fatma', surname: 'Y', email: 'fatma@test.com', status: 'approved' },
      { id: '3', name: 'Can', surname: 'D', email: 'can@test.com', status: 'pending' }
    ];

    it('shows only pending requests', () => {
      const result = filterPendingRequests(requests);
      assert.equal(result.length, 2);
      assert.ok(result.every(r => r.status === 'pending'));
    });

    it('filters by search query on name', () => {
      const result = filterPendingRequests(requests, 'Ali');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'Ali');
    });

    it('filters by search query on email', () => {
      const result = filterPendingRequests(requests, 'can@test');
      assert.equal(result.length, 1);
    });

    it('returns empty for no matches', () => {
      const result = filterPendingRequests(requests, 'xyz');
      assert.equal(result.length, 0);
    });
  });

  describe('buildApprovalDocument', () => {
    it('builds correct operator document for approved request', () => {
      const req = { name: 'Ali', surname: 'K', email: 'ali@test.com', createdAt: '2025-01-01' };
      const doc = buildApprovalDocument(req);
      assert.equal(doc.Name, 'Ali');
      assert.equal(doc.Surname, 'K');
      assert.equal(doc.Email, 'ali@test.com');
      assert.equal(doc.Role, 'operator');
      assert.equal(doc.Status, 'Active');
    });
  });
});


/* ═══════════════════════════════════════════════
   TC-AD-03: User Management
   "Validate that admin can view and manage users (including blocking/unblocking and assigning roles)"
   ═══════════════════════════════════════════════ */
describe('TC-AD-03: User Management', () => {

  describe('normalizeUser', () => {
    it('normalizes admin user', () => {
      const u = normalizeUser('admin', 'uid-1', { Name: 'Admin User', Email: 'admin@test.com' });
      assert.equal(u.uid, 'uid-1');
      assert.equal(u.role, 'admin');
      assert.equal(u.name, 'Admin User');
      assert.equal(u.email, 'admin@test.com');
    });

    it('combines Name + Surname', () => {
      const u = normalizeUser('carrier', 'uid-2', { Name: 'John', Surname: 'Doe', Email: 'jd@test.com' });
      assert.equal(u.name, 'John Doe');
    });

    it('defaults to — for missing fields', () => {
      const u = normalizeUser('operator', 'uid-3', {});
      assert.equal(u.name, '—');
      assert.equal(u.email, '—');
    });
  });

  describe('filterUsers', () => {
    const users = [
      { uid: '1', role: 'admin', name: 'Admin Ali', email: 'ali@admin.com' },
      { uid: '2', role: 'carrier', name: 'Carrier Can', email: 'can@carrier.com' },
      { uid: '3', role: 'operator', name: 'Op Fatma', email: 'fatma@op.com' },
      { uid: '4', role: 'carrier', name: 'Carrier Deniz', email: 'deniz@carrier.com' }
    ];

    it('returns all users when no filters', () => {
      const result = filterUsers(users);
      assert.equal(result.length, 4);
    });

    it('filters by role', () => {
      const result = filterUsers(users, '', 'carrier');
      assert.equal(result.length, 2);
      assert.ok(result.every(u => u.role === 'carrier'));
    });

    it('searches by name', () => {
      const result = filterUsers(users, 'Fatma');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'Op Fatma');
    });

    it('searches by email', () => {
      const result = filterUsers(users, 'deniz@carrier');
      assert.equal(result.length, 1);
    });

    it('searches by uid', () => {
      const result = filterUsers(users, '3');
      assert.equal(result.length, 1);
      assert.equal(result[0].uid, '3');
    });

    it('combines role filter and search', () => {
      const result = filterUsers(users, 'Can', 'carrier');
      assert.equal(result.length, 1);
    });

    it('returns sorted by name', () => {
      const result = filterUsers(users);
      assert.ok(result[0].name <= result[1].name);
    });
  });

});


/* ═══════════════════════════════════════════════
   TC-AD-04: Blocking/Unblocking Carriers
   "Validate that admin can block and unblock carriers"
   ═══════════════════════════════════════════════ */
describe('TC-AD-04: Blocking/Unblocking Carriers', () => {

  describe('normalizeCarrier', () => {
    it('normalizes standard carrier document', () => {
      const c = normalizeCarrier('doc-1', { Name: 'ABC Transport', Vehicle_Plate: '34 TR 123', Carrier_ID: 'C-001', Status: 'Active' });
      assert.equal(c.id, 'doc-1');
      assert.equal(c.name, 'ABC Transport');
      assert.equal(c.plate, '34 TR 123');
      assert.equal(c.carrierId, 'C-001');
      assert.equal(c.status, 'Active');
    });

    it('handles blocked carrier with reason and until', () => {
      const c = normalizeCarrier('doc-2', { Name: 'XYZ', Status: 'Blocked', BlockReason: 'Safety Violation', BlockUntil: '2025-07-01' });
      assert.equal(c.status, 'Blocked');
      assert.equal(c.reason, 'Safety Violation');
      assert.equal(c.until, '2025-07-01');
    });

    it('defaults to Active when Status missing', () => {
      const c = normalizeCarrier('doc-3', { Name: 'Test' });
      assert.equal(c.status, 'Active');
    });

    it('uses docId as carrierId fallback', () => {
      const c = normalizeCarrier('doc-id-fallback', {});
      assert.equal(c.carrierId, 'doc-id-fallback');
    });
  });

  describe('computeBlockUntilDate', () => {
    const baseDate = new Date(2025, 5, 15); // June 15, 2025

    it('computes 7-day block date', () => {
      const result = computeBlockUntilDate(7, baseDate);
      assert.equal(result, '2025-06-22');
    });

    it('computes 1-day block date', () => {
      const result = computeBlockUntilDate(1, baseDate);
      assert.equal(result, '2025-06-16');
    });

    it('computes 30-day block date', () => {
      const result = computeBlockUntilDate(30, baseDate);
      assert.equal(result, '2025-07-15');
    });

    it('returns empty string for indefinite (0)', () => {
      assert.equal(computeBlockUntilDate(0), '');
    });

    it('returns empty string for negative duration', () => {
      assert.equal(computeBlockUntilDate(-5), '');
    });

    it('handles string input', () => {
      const result = computeBlockUntilDate('7', baseDate);
      assert.equal(result, '2025-06-22');
    });
  });

  describe('buildBlockPayload', () => {
    it('builds correct block payload', () => {
      const payload = buildBlockPayload('Safety Violation', 'Repeated offense', '2025-07-01', 'admin-uid');
      assert.equal(payload.Status, 'Blocked');
      assert.equal(payload.BlockReason, 'Safety Violation');
      assert.equal(payload.BlockMessage, 'Repeated offense');
      assert.equal(payload.BlockUntil, '2025-07-01');
      assert.equal(payload.UpdatedByUid, 'admin-uid');
    });

    it('trims message whitespace', () => {
      const payload = buildBlockPayload('Other', '  some reason  ', '', 'admin');
      assert.equal(payload.BlockMessage, 'some reason');
    });
  });

  describe('buildUnblockPayload', () => {
    it('builds correct unblock payload', () => {
      const payload = buildUnblockPayload('admin-uid');
      assert.equal(payload.Status, 'Active');
      assert.equal(payload.BlockReason, '');
      assert.equal(payload.BlockMessage, '');
      assert.equal(payload.BlockUntil, '');
      assert.equal(payload.UpdatedByUid, 'admin-uid');
    });
  });

  describe('filterCarriers', () => {
    const carriers = [
      { name: 'ABC Transport', plate: '34 TR 123', carrierId: 'C-001' },
      { name: 'XYZ Logistics', plate: '06 AN 456', carrierId: 'C-002' },
      { name: 'Fast Cargo', plate: '35 IZ 789', carrierId: 'C-003' }
    ];

    it('returns all carriers with empty query', () => {
      assert.equal(filterCarriers(carriers, '').length, 3);
    });

    it('filters by name', () => {
      const result = filterCarriers(carriers, 'ABC');
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'ABC Transport');
    });

    it('filters by plate', () => {
      const result = filterCarriers(carriers, '06 AN');
      assert.equal(result.length, 1);
    });

    it('filters by carrierId', () => {
      const result = filterCarriers(carriers, 'C-003');
      assert.equal(result.length, 1);
    });

    it('is case insensitive', () => {
      const result = filterCarriers(carriers, 'fast cargo');
      assert.equal(result.length, 1);
    });
  });

  describe('isBlockExpired', () => {
    const now = new Date('2025-03-15T10:00:00');

    it('returns true when block date is in the past', () => {
      const c = { status: 'Blocked', until: '2025-03-10' };
      assert.equal(isBlockExpired(c, now), true);
    });

    it('returns false when block date is in the future', () => {
      const c = { status: 'Blocked', until: '2025-04-01' };
      assert.equal(isBlockExpired(c, now), false);
    });

    it('returns false for indefinite blocks (empty until)', () => {
      const c = { status: 'Blocked', until: '' };
      assert.equal(isBlockExpired(c, now), false);
    });

    it('returns false for active carriers', () => {
      const c = { status: 'Active', until: '2025-01-01' };
      assert.equal(isBlockExpired(c, now), false);
    });

    it('returns false for invalid date string', () => {
      const c = { status: 'Blocked', until: 'not-a-date' };
      assert.equal(isBlockExpired(c, now), false);
    });

    it('returns false on the expiry day itself (expires end of day)', () => {
      const c = { status: 'Blocked', until: '2025-03-15' };
      assert.equal(isBlockExpired(c, now), false);
    });
  });

  describe('getExpiredCarriers', () => {
    const now = new Date('2025-03-15T10:00:00');
    const carriers = [
      { id: '1', status: 'Blocked', until: '2025-03-10' },
      { id: '2', status: 'Blocked', until: '2025-04-01' },
      { id: '3', status: 'Active', until: '' },
      { id: '4', status: 'Blocked', until: '' },
      { id: '5', status: 'Blocked', until: '2025-02-01' }
    ];

    it('returns only carriers with expired blocks', () => {
      const result = getExpiredCarriers(carriers, now);
      assert.equal(result.length, 2);
      assert.equal(result[0].id, '1');
      assert.equal(result[1].id, '5');
    });

    it('returns empty array when no blocks expired', () => {
      const future = new Date('2024-01-01');
      assert.equal(getExpiredCarriers(carriers, future).length, 0);
    });
  });
});


/* ═══════════════════════════════════════════════
   TC-AD-05: Adding and Removing Stations
   "Validate that admin can add and remove stations"
   ═══════════════════════════════════════════════ */
describe('TC-AD-05: Adding/Removing Stations', () => {

  describe('parseCoordinate', () => {
    it('parses standard float', () => {
      assert.equal(parseCoordinate('32.85'), 32.85);
    });

    it('handles comma as decimal separator', () => {
      assert.equal(parseCoordinate('32,85'), 32.85);
    });

    it('returns NaN for invalid input', () => {
      assert.ok(Number.isNaN(parseCoordinate('abc')));
    });

    it('parses negative coordinates', () => {
      assert.equal(parseCoordinate('-73.9857'), -73.9857);
    });
  });

  describe('validateStationInput', () => {
    it('accepts valid inputs', () => {
      const r = validateStationInput('32.85', '39.92', 'ST-NEW', 'active', 'Load');
      assert.equal(r.valid, true);
      assert.equal(r.longitude, 32.85);
      assert.equal(r.latitude, 39.92);
      assert.equal(r.stationId, 'ST-NEW');
      assert.equal(r.status, 'active');
      assert.equal(r.type, 'Load');
    });

    it('rejects invalid longitude', () => {
      const r = validateStationInput('abc', '39.92', 'ST-1', 'active', 'Load');
      assert.equal(r.valid, false);
      assert.ok(r.error.includes('coordinates'));
    });

    it('rejects invalid latitude', () => {
      const r = validateStationInput('32.85', 'xyz', 'ST-1', 'active', 'Load');
      assert.equal(r.valid, false);
    });

    it('rejects empty station ID', () => {
      const r = validateStationInput('32.85', '39.92', '', 'active', 'Load');
      assert.equal(r.valid, false);
      assert.ok(r.error.includes('Station ID'));
    });

    it('handles comma decimal separator', () => {
      const r = validateStationInput('32,85', '39,92', 'ST-1', 'active', 'Load');
      assert.equal(r.valid, true);
      assert.equal(r.longitude, 32.85);
    });

    it('rejects empty status', () => {
      const r = validateStationInput('32.85', '39.92', 'ST-1', '', 'Load');
      assert.equal(r.valid, false);
      assert.ok(r.error.includes('Status'));
    });

    it('rejects empty type', () => {
      const r = validateStationInput('32.85', '39.92', 'ST-1', 'active', '');
      assert.equal(r.valid, false);
      assert.ok(r.error.includes('Type'));
    });
  });

  describe('buildStationDocument', () => {
    it('builds complete station document', () => {
      const doc = buildStationDocument({
        longitude: 32.85,
        latitude: 39.92,
        status: 'active',
        type: 'Load',
        stationId: 'ST-5',
        contactName: 'Manager',
        phone: '555-0000',
        createdByUid: 'admin-1'
      });
      assert.equal(doc.longitude, 32.85);
      assert.equal(doc.latitude, 39.92);
      assert.equal(doc.stationId, 'ST-5');
      assert.equal(doc.StationId, 'ST-5');
      assert.equal(doc.type, 'Load');
      assert.equal(doc.createdBy, 'admin-1');
    });

    it('defaults optional fields (contactName, phone)', () => {
      const doc = buildStationDocument({ longitude: 0, latitude: 0, stationId: 'ST-1', status: 'active', type: 'Load' });
      assert.equal(doc.contactName, '');
      assert.equal(doc.phone, '');
      assert.equal(doc.createdBy, '');
    });
  });

});


/* ═══════════════════════════════════════════════
   TC-AD-06: Updating Facility Information
   "Validate that admin can update facility information"
   ═══════════════════════════════════════════════ */
describe('TC-AD-06: Updating Facility Information', () => {

  it('builds correct facility update object', () => {
    const update = buildFacilityUpdate({
      name: 'Main Facility',
      address: '123 Industrial Ave',
      capacity: '50',
      status: 'Active',
      contactName: 'John',
      phone: '555-1234',
      weekdayStart: '08:00',
      weekdayEnd: '18:00',
      weekendStart: '10:00',
      weekendEnd: '14:00'
    });

    assert.equal(update.Name, 'Main Facility');
    assert.equal(update.Adress, '123 Industrial Ave');
    assert.equal(update.Capacity, 50);
    assert.equal(update.Status, 'Active');
    assert.equal(update.contactName, 'John');
    assert.equal(update.weekdayStart, '08:00');
  });

  it('parses capacity as integer', () => {
    const update = buildFacilityUpdate({ capacity: '75' });
    assert.equal(update.Capacity, 75);
    assert.equal(typeof update.Capacity, 'number');
  });

  it('defaults capacity to 0 for invalid input', () => {
    const update = buildFacilityUpdate({ capacity: 'abc' });
    assert.equal(update.Capacity, 0);
  });

  it('defaults status to Active', () => {
    const update = buildFacilityUpdate({});
    assert.equal(update.Status, 'Active');
  });

});


/* ═══════════════════════════════════════════════
   TC-AD-08: Resolving Issues
   "Validate that admin can view and resolve issue reports"
   ═══════════════════════════════════════════════ */
describe('TC-AD-08: Resolving Issues', () => {

  describe('normalizeIssue', () => {
    it('normalizes a standard issue document', () => {
      const issue = normalizeIssue({ id: 'i1', Title: 'Broken scanner', Description: 'Desc', Facility: 'ST-1', Priority: 'High', Status: 'Waiting' });
      assert.equal(issue.id, 'i1');
      assert.equal(issue.Title, 'Broken scanner');
      assert.equal(issue.Priority, 'High');
      assert.equal(issue.Status, 'Waiting');
    });

    it('handles alternative field casing', () => {
      const issue = normalizeIssue({ id: 'i2', title: 'Test', description: 'desc', station: 'ST-2', priority: 'Low', status: 'Solved' });
      assert.equal(issue.Title, 'Test');
      assert.equal(issue.Facility, 'ST-2');
      assert.equal(issue.Status, 'Solved');
    });

    it('defaults missing fields', () => {
      const issue = normalizeIssue({});
      assert.equal(issue.id, '-');
      assert.equal(issue.Title, 'Untitled');
      assert.equal(issue.Priority, 'Medium');
      assert.equal(issue.Status, 'Waiting');
    });
  });

  describe('filterIssuesByMode', () => {
    const issues = [
      { id: '1', Title: 'A', Status: 'Waiting', CreatedByUid: 'user-1' },
      { id: '2', Title: 'B', Status: 'Solved', CreatedByUid: 'user-2' },
      { id: '3', Title: 'C', Status: 'Waiting', CreatedByUid: 'user-1' },
      { id: '4', Title: 'D', Status: 'Resolved', CreatedByUid: 'user-3' },
      { id: '5', Title: 'E', Status: 'Closed', CreatedByUid: 'user-1' }
    ];

    it('view mode: shows only unresolved issues', () => {
      const result = filterIssuesByMode(issues, 'view');
      assert.equal(result.length, 2);
      assert.ok(result.every(i => i.Status === 'Waiting'));
    });

    it('solve mode: shows only resolved/solved/closed issues', () => {
      const result = filterIssuesByMode(issues, 'solve');
      assert.equal(result.length, 3);
    });

    it('self mode: shows only issues created by current user', () => {
      const result = filterIssuesByMode(issues, 'self', 'user-1');
      assert.equal(result.length, 3);
      assert.ok(result.every(i => i.CreatedByUid === 'user-1'));
    });

    it('self mode without uid: returns all issues', () => {
      const result = filterIssuesByMode(issues, 'self', null);
      assert.equal(result.length, 5);
    });

    it('unknown mode: returns all issues', () => {
      const result = filterIssuesByMode(issues, 'unknown');
      assert.equal(result.length, 5);
    });
  });
});


/* ═══════════════════════════════════════════════
   TC-AD-09: Error Handling
   "Validate that appropriate error messages are displayed when an error occurs"
   ═══════════════════════════════════════════════ */
describe('TC-AD-09: Error Handling', () => {

  it('admin login returns specific error for empty email', () => {
    const r = validateAdminLogin('', 'pass');
    assert.ok(r.error.includes('Email'));
  });

  it('admin login returns specific error for empty password', () => {
    const r = validateAdminLogin('a@b.com', '');
    assert.ok(r.error.includes('Password'));
  });

  it('station validation returns error for invalid coordinates', () => {
    const r = validateStationInput('invalid', '39.92', 'ST-1', 'active', 'Load');
    assert.equal(r.valid, false);
    assert.ok(r.error.toLowerCase().includes('coordinates'));
  });

  it('station validation returns error for missing station ID', () => {
    const r = validateStationInput('32.85', '39.92', '', 'active', 'Load');
    assert.equal(r.valid, false);
    assert.ok(r.error.includes('Station ID'));
  });

  it('normalizeCarrier handles completely empty data', () => {
    const c = normalizeCarrier('id', {});
    assert.equal(c.name, '—');
    assert.equal(c.plate, '—');
    assert.equal(c.status, 'Active');
  });

  it('normalizeCarrier handles null data', () => {
    const c = normalizeCarrier('id', null);
    assert.equal(c.name, '—');
  });

  it('normalizeRequest handles null data', () => {
    const r = normalizeRequest('id', null);
    assert.equal(r.name, '—');
    assert.equal(r.email, '—');
  });

  it('filterUsers handles empty array', () => {
    const result = filterUsers([], 'search');
    assert.equal(result.length, 0);
  });

  it('filterCarriers handles empty array', () => {
    const result = filterCarriers([], 'search');
    assert.equal(result.length, 0);
  });

  it('buildFacilityUpdate handles all undefined inputs', () => {
    const update = buildFacilityUpdate({});
    assert.equal(update.Name, '');
    assert.equal(update.Capacity, 0);
    assert.equal(update.Status, 'Active');
  });

  it('normalizeIssue handles null/undefined fields gracefully', () => {
    const issue = normalizeIssue({ id: null, Title: undefined });
    assert.equal(issue.Title, 'Untitled');
  });
});
