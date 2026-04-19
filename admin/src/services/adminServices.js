/**
 Admin paneldeki bussiness logic'i UI'dan ayırarak test edilebilir hale getirmek için
 */
export function validateAdminLogin(email, password) {
  const trimmedEmail = (email || '').trim();
  const trimmedPwd = (password || '').trim();

  if (!trimmedEmail) {
    return { valid: false, error: 'Email is required.' };
  }
  if (!trimmedPwd) {
    return { valid: false, error: 'Password is required.' };
  }
  return { valid: true, email: trimmedEmail, password: trimmedPwd };
}

/**
 * Check if a user document confirms admin authorization.
 * In the real flow: after auth, we check if uid exists in Admin collection.
 */
export function isAdminAuthorized(adminDocExists) {
  return adminDocExists === true;
}

/* ═══════════════════════════════════════════════
   PENDING USER MANAGEMENT
   ═══════════════════════════════════════════════ */

/**
 * Pick the first non-empty field from data by key list.
 */
export function pickField(data, keys, fallback = '') {
  for (const k of keys) {
    if (data && data[k] != null && String(data[k]).trim() !== '') return data[k];
  }
  return fallback;
}

/**
 * Normalize an operator request document from Firestore.
 */
export function normalizeRequest(docId, data) {
  const name = pickField(data, ['name', 'Name'], '—');
  const surname = pickField(data, ['surname', 'Surname'], '');
  const email = pickField(data, ['email', 'Email', 'E-mail'], '—');
  const status = pickField(data, ['status', 'Status'], 'pending');
  const createdAt = data?.createdAt ?? data?.CreatedAt ?? null;
  return { id: docId, name, surname, email, status, createdAt };
}

/**
 * Filter requests to only pending ones, with optional search.
 */
export function filterPendingRequests(requests, searchQuery = '') {
  const q = (searchQuery || '').trim().toLowerCase();
  return requests
    .filter(r => (r.status || '').toLowerCase() === 'pending')
    .filter(r => {
      if (!q) return true;
      return (
        String(`${r.name} ${r.surname}` || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q) ||
        String(r.id || '').toLowerCase().includes(q)
      );
    });
}

/**
 * Build the Operator document for an approved request.
 */
export function buildApprovalDocument(request) {
  return {
    Name: request.name || '',
    Surname: request.surname || '',
    Email: request.email || '',
    Role: 'operator',
    Status: 'Active',
    RequestedAt: request.createdAt || null
  };
}

/* ═══════════════════════════════════════════════
   USER MANAGEMENT
   ═══════════════════════════════════════════════ */

/**
 * Normalize a user document from any collection (Admin/Carrier/Operator).
 */
export function normalizeUser(role, uid, data) {
  const name = pickField(data, ['Name', 'name'], '—');
  const surname = pickField(data, ['Surname', 'surname'], '');
  const fullName = (String(name || '') + (surname ? ` ${surname}` : '')).trim() || '—';
  const email = pickField(data, ['E-mail', 'Email', 'email'], '—');
  return { uid, role, name: fullName, email: String(email || '—') };
}

/**
 * Filter and search users list.
 */
export function filterUsers(allUsers, queryStr = '', roleFilter = 'all') {
  const q = (queryStr || '').trim().toLowerCase();
  let list = allUsers;

  if (roleFilter !== 'all') {
    list = list.filter(u => u.role === roleFilter);
  }

  if (q) {
    list = list.filter(u => {
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q)
      );
    });
  }

  return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * Map role name to Firestore collection name.
 */
export function roleToCollection(role) {
  if (role === 'admin') return 'Admin';
  if (role === 'operator') return 'Operator';
  return 'Carrier';
}

/**
 * Generate badge CSS class for a role.
 */
export function roleBadgeClass(role) {
  if (role === 'admin') return 'badge-admin';
  if (role === 'operator') return 'badge-operator';
  return 'badge-carrier';
}

/* ═══════════════════════════════════════════════
   BLOCK / UNBLOCK CARRIER
   ═══════════════════════════════════════════════ */

/**
 * Normalize a carrier document from Firestore.
 */
export function normalizeCarrier(docId, data) {
  const name = String(data?.Name ?? data?.name ?? '—');
  const plate = String(data?.Vehicle_Plate ?? data?.plate ?? '—');
  const carrierId = String(data?.Carrier_ID ?? data?.id ?? docId);
  const status = String(data?.Status ?? 'Active');
  const reason = String(data?.BlockReason ?? data?.reason ?? '');
  const until = String(data?.BlockUntil ?? data?.until ?? '');
  return { id: docId, name, plate, carrierId, status, reason, until };
}

/**
 * Compute the "block until" ISO date string from duration in days.
 * Returns '' for indefinite (0 or negative).
 */
export function computeBlockUntilDate(durationDays, fromDate = new Date()) {
  const dur = parseInt(durationDays, 10);
  if (!dur || dur <= 0) return '';
  const d = new Date(fromDate);
  d.setDate(d.getDate() + dur);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}

/**
 * Build block carrier update object for Firestore.
 */
export function buildBlockPayload(reason, message, until, adminUid) {
  return {
    Status: 'Blocked',
    BlockReason: reason,
    BlockMessage: (message || '').trim(),
    BlockUntil: until,
    UpdatedByUid: adminUid
  };
}

/**
 * Build unblock carrier update object for Firestore.
 */
export function buildUnblockPayload(adminUid) {
  return {
    Status: 'Active',
    BlockReason: '',
    BlockMessage: '',
    BlockUntil: '',
    UpdatedByUid: adminUid
  };
}

/**
 * Filter carriers by search query.
 */
export function filterCarriers(carriers, query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return carriers;
  return carriers.filter(c => {
    return (
      String(c.name ?? '').toLowerCase().includes(q) ||
      String(c.plate ?? '').toLowerCase().includes(q) ||
      String(c.carrierId ?? '').toLowerCase().includes(q)
    );
  });
}

/**
 * Check if a carrier's block period has expired.
 * Returns true if the carrier is Blocked AND BlockUntil date is in the past.
 * Indefinite blocks (empty BlockUntil) never expire automatically.
 */
export function isBlockExpired(carrier, now = new Date()) {
  if ((carrier.status || '').toLowerCase() !== 'blocked') return false;
  const until = (carrier.until || '').trim();
  if (!until) return false;
  const expiry = new Date(until + 'T23:59:59');
  if (Number.isNaN(expiry.getTime())) return false;
  return now > expiry;
}

/**
 * Return carriers whose block period has expired.
 */
export function getExpiredCarriers(carriers, now = new Date()) {
  return carriers.filter(c => isBlockExpired(c, now));
}

/* ═══════════════════════════════════════════════
   ADD / REMOVE STATION
   ═══════════════════════════════════════════════ */

/**
 * Parse a coordinate string. Handles comma as decimal separator.
 */
export function parseCoordinate(value) {
  return parseFloat(String(value).replace(',', '.'));
}

/**
 * Validate add-station form inputs.
 */
export function validateStationInput(longitude, latitude, stationId, status, type) {
  const lon = parseCoordinate(longitude);
  const lat = parseCoordinate(latitude);

  if (Number.isNaN(lon) || Number.isNaN(lat)) {
    return { valid: false, error: 'Invalid coordinates' };
  }
  if (!stationId || !String(stationId).trim()) {
    return { valid: false, error: 'Station ID is required' };
  }
  if (!status || !String(status).trim()) {
    return { valid: false, error: 'Status is required' };
  }
  if (!type || !String(type).trim()) {
    return { valid: false, error: 'Type is required' };
  }
  return { valid: true, longitude: lon, latitude: lat, stationId: String(stationId).trim(), status: String(status).trim(), type: String(type).trim() };
}

/**
 * Build the station document for Firestore.
 */
export function buildStationDocument({ longitude, latitude, status, type, stationId, contactName, phone, createdByUid }) {
  return {
    longitude,
    latitude,
    status,
    type,
    stationId,
    StationId: stationId,
    contactName: contactName || '',
    phone: phone || '',
    createdBy: createdByUid || ''
  };
}

/* ═══════════════════════════════════════════════
   FACILITY INFORMATION UPDATE
   ═══════════════════════════════════════════════ */

/**
 * Build the facility update object for Firestore.
 */
export function buildFacilityUpdate({ name, address, capacity, status, contactName, phone, weekdayStart, weekdayEnd, weekendStart, weekendEnd }) {
  return {
    Name: (name || '').trim(),
    Adress: (address || '').trim(),    // Note: "Adress" typo preserved to match existing Firestore data
    Capacity: parseInt(capacity, 10) || 0,
    Status: status || 'Active',
    contactName: (contactName || '').trim(),
    phone: (phone || '').trim(),
    weekdayStart: weekdayStart || '',
    weekdayEnd: weekdayEnd || '',
    weekendStart: weekendStart || '',
    weekendEnd: weekendEnd || ''
  };
}

/* ═══════════════════════════════════════════════
   ISSUE MANAGEMENT (view/solve)
   ═══════════════════════════════════════════════ */

/**
 * Normalize an issue document from Firestore.
 */
export function normalizeIssue(raw) {
  return {
    id: raw.id || raw.Id || raw.issueId || '-',
    Title: raw.Title ?? raw.title ?? 'Untitled',
    Description: raw.Description ?? raw.description ?? '',
    Facility: raw.Facility ?? raw.station ?? raw.facility ?? '',
    Priority: raw.Priority ?? raw.priority ?? 'Medium',
    Status: raw.Status ?? raw.status ?? 'Waiting',
    CreatedByUid: raw.CreatedByUid ?? raw.createdByUid ?? raw.reporterUid ?? null
  };
}

/**
 * Filter issues by mode:
 * - 'self': only issues created by the current user
 * - 'view': unresolved issues
 * - 'solve': resolved/solved issues
 */
export function filterIssuesByMode(issues, mode, currentUserUid = null) {
  let list = issues;

  if (mode === 'self' && currentUserUid) {
    list = list.filter(i => i.CreatedByUid === currentUserUid);
  }
  if (mode === 'view') {
    list = list.filter(i =>
      !['resolved', 'closed', 'solved'].includes(String(i.Status || '').toLowerCase())
    );
  }
  if (mode === 'solve') {
    list = list.filter(i =>
      ['resolved', 'closed', 'solved'].includes(String(i.Status || '').toLowerCase())
    );
  }

  return list;
}

/* ═══════════════════════════════════════════════
   STATISTICS / REPORTS
   ═══════════════════════════════════════════════ */

/**
 * Filter stations by search query (for station removal).
 */
export function filterStations(stations, query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return stations;
  return stations.filter(s => {
    const type = String(s.type || '').toLowerCase();
    const status = String(s.status || '').toLowerCase();
    const stationId = String(s.stationId || s.StationId || '').toLowerCase();
    return type.includes(q) || status.includes(q) || s.id.toLowerCase().includes(q) || stationId.includes(q);
  });
}
