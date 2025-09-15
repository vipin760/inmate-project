const mongoose = require('mongoose');

const financialSchema = new mongoose.Schema({
    inmateId: { type: String, required: true },
    custodyType: {type: String, required: true},
    transaction: { type: String },
    workAssignId: { type: mongoose.Schema.Types.ObjectId,ref:'Department', default: ""},
    hoursWorked: { type: Number,  default: 0},
    wageAmount: { type: Number, default: 0},
    depositName: { type: String },
    relationShipId: { type: String},
    depositAmount: { type: Number, default: 0 },
    depositType:{ type:String},
    type: { type: String, required: true },
    status: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Financial',financialSchema);