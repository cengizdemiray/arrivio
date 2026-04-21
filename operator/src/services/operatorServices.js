/**
 * operatorServices.js
 * ───────────────────
 * Business logic functions for the Operator panel, extracted for testability.
 * These functions contain the core logic without DOM dependencies.
 * Firestore-calling functions accept `db` and Firestore helpers as parameters.
 */

/* ═══════════════════════════════════════════════
   LOGIN VALIDATION
   ═══════════════════════════════════════════════ */

/**
 * Validate operator login inputs.
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateLoginInput(email, password) {
  const trimmedEmail = (email || '').trim();
  const trimmedPwd = (password || '').trim();

  if (!trimmedEmail || !trimmedPwd) {
    return { valid: false, error: 'Please enter email and password.' };
  }

  // Basic email format check
  if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  return { valid: true, email: trimmedEmail.toLowerCase(), password: trimmedPwd };
}

/**
 * Build operator session data from Firebase auth user.
 */
export function buildOperatorSession(user, email) {
  const operatorId = user?.uid || email;
  const operatorEmail = user?.email || email;
  const operatorName = (user?.displayName || email.split('@')[0] || 'Operator').trim();

  return { operatorId, operatorEmail, operatorName };
}

/* ═══════════════════════════════════════════════
   FACILITY STATUS UPDATE
   ═══════════════════════════════════════════════ */

/**
 * Map UI station status to Firestore storage value.
 * UI shows: 'Operational', 'Maintenance', 'Paused'
 * Firestore stores: 'active', 'maintenance', 'inactive'
 */
export function mapStatusToFirestore(uiStatus) {
  if (uiStatus === 'Operational') return 'active';
  if (uiStatus === 'Maintenance') return 'maintenance';
  return 'inactive';
}

/**
 * Build the update object for saving a station to Firestore.
 */
export function buildStationUpdate(newStatus, newContact, newPhone) {
  return {
    status: mapStatusToFirestore(newStatus),
    contactName: (newContact || '').trim(),
    phone: (newPhone || '').trim()
  };
}

/**
 * Determine the CSS pill class for a facility status.
 */
export function facilityPillClass(status) {
  if (status === 'Active') return 'operational';
  if (status === 'Maintenance') return 'maintenance';
  return 'paused';
}

/**
 * Count station statuses from a stations array.
 */
export function countStationStatuses(stations) {
  const operational = stations.filter(s => s.status === 'Operational').length;
  const maintenance = stations.filter(s => s.status === 'Maintenance').length;
  const paused = stations.filter(s => s.status === 'Paused').length;
  return { total: stations.length, operational, maintenance, paused };
}

/* ═══════════════════════════════════════════════
   ISSUE CREATION
   ═══════════════════════════════════════════════ */

/**
 * Validate issue form inputs.
 */
export function validateIssueInput(title, station) {
  if (!title || !title.trim()) {
    return { valid: false, error: 'Title is required.' };
  }
  if (!station) {
    return { valid: false, error: 'Station is required.' };
  }
  return { valid: true };
}

/**
 * Build the issue document for Firestore.
 */
export function buildIssueDocument({ title, station, priority, reporter, description, timestamp }) {
  return {
    Title: title.trim(),
    Description: (description || '').trim() || 'Operator created issue.',
    Facility: station,
    Priority: priority || 'Medium',
    Status: 'Waiting',
    title: title.trim(),
    station,
    reporter: reporter || 'Operator Desk',
    created: timestamp || '',
    priority: priority || 'Medium',
    status: 'Waiting',
    description: (description || '').trim() || 'Operator created issue.',
    comments: [{ by: reporter || 'Operator Desk', text: 'Issue logged from operator panel.', time: timestamp || '' }]
  };
}

/**
 * Check if an issue status is resolved.
 */
export function isIssueResolved(issue) {
  return ['resolved', 'solved'].includes(
    String(issue?.status || issue?.Status || '').toLowerCase()
  );
}

