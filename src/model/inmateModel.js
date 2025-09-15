const mongoose = require('mongoose');

const inmateSchema = new mongoose.Schema({
  inmateId: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  custodyType: { type: String, required: true },
  cellNumber: { type: String, required: true },
  balance: { type: Number, default: 0 },
  user_id:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  dateOfBirth: { type: Date, required: true },
  admissionDate: { type: Date, required: true },
  crimeType: { type: String, required: true },
  status: { type: String, required: true },
  is_blocked:{type:String,default:false},
  location_id: { type: mongoose.Schema.Types.ObjectId,ref: 'InmateLocation',required:true }
}, { timestamps: true });

module.exports = mongoose.model('Inmate', inmateSchema);