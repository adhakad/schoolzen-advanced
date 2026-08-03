'use strict';
const mongoose = require('mongoose');
const DeviceSchema = new mongoose.Schema(
  {
    // ── WDMS identity (immutable once set) ──────────────────────
    terminalSn: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    deviceCompanyId: { type: String },
    model: { type: String },   // terminal_name from WDMS
    alias: { type: String },
    firmware: { type: String },
    ipAddress: { type: String },

    // ── School assignment (sales only) ───────────────────────────
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'admin-users',
      default: null,
      index: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      default: null,
      index: true,
    },

    // ── State machine ────────────────────────────────────────────
    status: {
      type: String,
      enum: ['IMPORTED', 'ASSIGNED', 'ACTIVE', 'DISABLED'],
      default: 'IMPORTED',
      index: true,
    },

    assignedBy: { type: String },   // sales user email / id
    assignedAt: { type: Date },

    activatedBy: { type: String },
    activatedAt: { type: Date },

    disabledBy: { type: String },
    disabledAt: { type: Date },
  },
  { timestamps: true }
);

DeviceSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('Device', DeviceSchema);
