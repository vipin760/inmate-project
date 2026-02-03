const mongoose = require('mongoose');

const inmateSchema = new mongoose.Schema({
  inmateId: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
   status: { type: String, required: true },
  custodyType: { type: String },
  cellNumber: { type: String },
  balance: { type: Number, default: 0 },
  user_id:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  dateOfBirth: { type: Date },
  admissionDate: { type: Date },
  crimeType: { type: String},
  is_blocked:{type:String,default:false},
  phonenumber:{type:String,required:true},
  location_id: { type: mongoose.Schema.Types.ObjectId,ref: 'InmateLocation',required:true }
}, { timestamps: true });

module.exports = mongoose.model('Inmate', inmateSchema);