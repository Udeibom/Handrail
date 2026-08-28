/**
 * @file pharmacy-data.js
 * @description Deterministic fictional pharmacy dataset for RefillRx demo.
 * Strictly uses fictional identifiers, names, and medical data.
 */

export const PATIENT_PROFILE = Object.freeze({
  id: 'RX-PT-9042',
  name: 'Alex Morgan',
  dateOfBirth: '1982-04-15',
  allergies: ['Penicillin', 'Sulfa drugs'],
  insurancePlan: 'MedShield Silver (Group #4402)',
  preferredPharmacy: 'RefillRx - Downtown Hub (Store #104)',
  paymentMethod: 'Health Savings Account (Ending in 4091)',
});

export const INITIAL_PRESCRIPTIONS = Object.freeze([
  {
    id: 'RX-001',
    medication: 'Lisinopril',
    dosage: '10 mg',
    form: 'Oral Tablet',
    quantity: 30,
    price: 12.40,
    refillsRemaining: 2,
    eligible: true,
    prescriber: 'Dr. Elena Vance, MD',
    lastRefilled: '2025-01-10',
    instructions: 'Take 1 tablet by mouth daily in the morning for blood pressure.',
    category: 'Cardiovascular',
  },
  {
    id: 'RX-002',
    medication: 'Atorvastatin',
    dosage: '20 mg',
    form: 'Oral Tablet',
    quantity: 30,
    price: 18.75,
    refillsRemaining: 1,
    eligible: true,
    prescriber: 'Dr. Elena Vance, MD',
    lastRefilled: '2025-01-14',
    instructions: 'Take 1 tablet by mouth once daily at bedtime for cholesterol.',
    category: 'Cardiovascular',
  },
  {
    id: 'RX-003',
    medication: 'Metformin',
    dosage: '500 mg',
    form: 'Oral Tablet',
    quantity: 60,
    price: 9.50,
    refillsRemaining: 0,
    eligible: false,
    prescriber: 'Dr. Jordan Hayes, MD',
    lastRefilled: '2024-11-02',
    instructions: 'Take 1 tablet by mouth twice daily with meals for blood sugar control.',
    ineligibilityReason: '0 refills remaining. Requires physician renewal authorization.',
    category: 'Endocrine',
  },
]);

// Live mutable state for active session (can be reset via resetPharmacyState)
let activePrescriptions = JSON.parse(JSON.stringify(INITIAL_PRESCRIPTIONS));
let submittedRefillOrders = [];

/**
 * Resets the in-memory pharmacy state to baseline.
 */
export function resetPharmacyState() {
  activePrescriptions = JSON.parse(JSON.stringify(INITIAL_PRESCRIPTIONS));
  submittedRefillOrders = [];
}

/**
 * Returns all submitted refill order receipts.
 * @returns {Array<object>}
 */
export function getSubmittedRefills() {
  return JSON.parse(JSON.stringify(submittedRefillOrders));
}

/**
 * Returns a clone of all prescriptions in the active pharmacy database.
 * @returns {Array<object>}
 */
export function getPrescriptions() {
  return JSON.parse(JSON.stringify(activePrescriptions));
}

/**
 * Retrieves a single prescription by its ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getPrescriptionById(id) {
  const match = activePrescriptions.find((rx) => rx.id === id);
  return match ? JSON.parse(JSON.stringify(match)) : null;
}

/**
 * Executes a state-changing refill submission on approved prescriptions.
 * Decrements remaining refills and records the submitted order receipt.
 * @param {Array<string>} prescriptionIds
 * @param {object} [options={}]
 * @returns {object} Confirmed order receipt
 */
export function submitPrescriptionRefill(prescriptionIds, options = {}) {
  const calc = calculateRefillCalculation(prescriptionIds, options);
  const confirmationNumber = `RX-CONF-${Math.floor(100000 + Math.random() * 900000)}`;

  // Decrement refills remaining on active prescriptions
  for (const item of calc.items) {
    const rx = activePrescriptions.find((p) => p.id === item.id);
    if (rx && rx.refillsRemaining > 0) {
      rx.refillsRemaining -= 1;
      rx.lastRefilled = new Date().toISOString().split('T')[0];
      if (rx.refillsRemaining === 0) {
        rx.eligible = false;
        rx.ineligibilityReason = '0 refills remaining. Requires physician renewal authorization.';
      }
    }
  }

  let fulfillmentLocation = 'RefillRx Downtown Hub (Store #104)';
  let estimatedFulfillment = 'Ready for in-store pickup in 2 hours';
  if (options.deliveryMethod === 'delivery') {
    fulfillmentLocation = 'Patient Registered Address (Dispatched via Courier)';
    estimatedFulfillment = 'Expected delivery by tomorrow afternoon';
  } else if (options.deliveryMethod === 'mail') {
    fulfillmentLocation = 'USPS Priority Pharmacy Mail';
    estimatedFulfillment = 'Expected arrival in 3-5 business days';
  }

  const orderReceipt = {
    confirmationNumber,
    orderStatus: 'CONFIRMED_AND_PROCESSING',
    submittedAt: new Date().toISOString(),
    patientId: PATIENT_PROFILE.id,
    patientName: PATIENT_PROFILE.name,
    medications: calc.items.map((i) => `${i.medication} ${i.dosage}`),
    prescriptionIds,
    items: calc.items,
    quantity: calc.quantity,
    deliveryMethod: options.deliveryMethod || 'pickup',
    refillReason: options.refillReason || 'Routine maintenance renewal',
    patientNote: options.patientNote || '',
    urgency: options.urgency || 'standard',
    totalCharged: calc.totalCost,
    pickupLocation: fulfillmentLocation,
    estimatedReady: estimatedFulfillment,
    paymentMethod: PATIENT_PROFILE.paymentMethod,
    authoritativeSource: 'Structured WebMCP Tool Arguments',
  };

  submittedRefillOrders.unshift(orderReceipt);
  return orderReceipt;
}

/**
 * Returns the fictional patient profile.
 * @returns {object}
 */
export function getPatientProfile() {
  return { ...PATIENT_PROFILE };
}

/**
 * Performs structured search and filtering on the patient's prescriptions.
 * Does not modify any state.
 * @param {object} [filters={}]
 * @param {string} [filters.query] - Case-insensitive text search across medication name, ID, category, or prescriber.
 * @param {string} [filters.status] - 'all' | 'active' | 'eligible' | 'ineligible'
 * @param {string} [filters.category] - Clinical category filter (e.g. 'Cardiovascular', 'Endocrine')
 * @param {boolean} [filters.eligibleOnly] - When true, only returns refill-eligible prescriptions
 * @returns {Array<object>} Filtered prescription clones
 */
export function searchPrescriptions(filters = {}) {
  let list = getPrescriptions();

  if (filters.query && typeof filters.query === 'string') {
    const q = filters.query.toLowerCase().trim();
    if (q) {
      list = list.filter((rx) =>
        rx.medication.toLowerCase().includes(q) ||
        rx.id.toLowerCase().includes(q) ||
        rx.category.toLowerCase().includes(q) ||
        rx.prescriber.toLowerCase().includes(q) ||
        rx.instructions.toLowerCase().includes(q)
      );
    }
  }

  if (filters.status) {
    const s = String(filters.status).toLowerCase();
    if (s === 'eligible') {
      list = list.filter((rx) => rx.eligible === true);
    } else if (s === 'ineligible') {
      list = list.filter((rx) => rx.eligible === false);
    }
  }

  if (typeof filters.eligibleOnly === 'boolean') {
    if (filters.eligibleOnly) {
      list = list.filter((rx) => rx.eligible === true);
    }
  }

  if (filters.category && typeof filters.category === 'string') {
    const cat = filters.category.toLowerCase().trim();
    if (cat && cat !== 'all') {
      list = list.filter((rx) => rx.category.toLowerCase() === cat);
    }
  }

  return list;
}

/**
 * Calculates line items and total cost for an array of prescription IDs.
 * @param {Array<string>} prescriptionIds
 * @param {object} [options={}] - Optional structured parameters (quantity, deliveryMethod)
 * @returns {{ items: Array<object>, totalCost: number, invalidIds: Array<string>, ineligibleIds: Array<string>, deliveryMethod: string, quantity: number }}
 */
export function calculateRefillCalculation(prescriptionIds, options = {}) {
  const items = [];
  const invalidIds = [];
  const ineligibleIds = [];
  let totalCost = 0;
  const deliveryMethod = options.deliveryMethod || 'pickup';
  const customQuantity = typeof options.quantity === 'number' && options.quantity > 0 ? options.quantity : null;

  for (const id of prescriptionIds) {
    const rx = getPrescriptionById(id);
    if (!rx) {
      invalidIds.push(id);
      continue;
    }
    if (!rx.eligible) {
      ineligibleIds.push(id);
    }
    
    // Scale pricing if custom quantity is requested (e.g. 90 day supply = 3x 30-day base)
    const itemQuantity = customQuantity || rx.quantity;
    let itemPrice = rx.price;
    if (customQuantity && customQuantity !== rx.quantity && rx.quantity > 0) {
      itemPrice = Number(((rx.price / rx.quantity) * customQuantity).toFixed(2));
    }

    items.push({
      ...rx,
      requestedQuantity: itemQuantity,
      calculatedPrice: itemPrice,
      deliveryMethod,
    });
    totalCost += itemPrice;
  }

  return {
    items,
    totalCost: Number(totalCost.toFixed(2)),
    invalidIds,
    ineligibleIds,
    deliveryMethod,
    quantity: customQuantity || (items[0]?.quantity || 30),
  };
}
