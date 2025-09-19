// models/Location.js
const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  path: { type: String, required: true },
  updatedBy: { type: String },  
}, { timestamps: true });

module.exports = mongoose.model("Location", locationSchema);
