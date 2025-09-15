const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {type:String,required: true},
    fullname: {type: String},
    password: {type:String,required: true},
    role: { type: String, required:true },
    location_id:{type:mongoose.Schema.Types.ObjectId ,ref:"InmateLocation"},
    inmateId:{type:String},
    descriptor:[Number]
},{timestamps: true});

module.exports = mongoose.model('User',userSchema);