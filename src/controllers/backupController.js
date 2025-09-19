const backupLocationModel = require("../model/backupLocationModel")
exports.addBackupLocation = async(req,res)=>{
    try{
        const { path } = req.body
        const pathExist = await backupLocationModel.findOne({path})
        if(pathExist){
            await backupLocationModel.updateOne({path},{$set:{path,updatedBy:req.user.id}})
            return res.send({success:true,data:pathExist,message:"backup location updated successfully"})
        }
        const backupLocation = await backupLocationModel.create({path,updatedBy:req.user.id})
        return res.send({success:true,data:backupLocation,message:"backup location added successfully"})
    }catch(error){
        res.status(500).send({success:false,message:"internal server down",error:error.message})
    }
}
    