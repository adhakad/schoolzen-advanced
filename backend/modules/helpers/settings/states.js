'use strict';

// The states a state-specific field can be bound to (settings/errors.md VALIDATION_FAILED:
// "Select a valid state for this field"). Every Indian state and union territory, spelled the
// way the school record stores it — the admission-form-fields.html reference's ten
// state-ID states (Madhya Pradesh, Uttar Pradesh, Bihar, …) are all in here.
const STATES = Object.freeze([
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
    'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]);

const norm = (value) => String(value || '').trim().toLowerCase();

/** The canonical spelling for a state name, or null when it isn't one. */
const canonicalState = (value) => STATES.find((state) => norm(state) === norm(value)) || null;

module.exports = { STATES, canonicalState };
