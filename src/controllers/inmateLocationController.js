const InmateLocation = require("../model/inmateLocationModel");
const UserSchema = require("../model/userModel")

// exports.AddLocation = async (req, res) => {
//     try {
//         const { locationName, depositLimit, spendLimit } = req.body
//         const checkLocationName = locationName.toLowerCase()
//         if (!locationName) {
//             return res.status(404).send({ success: false, message: "Location name is required" });
//         }
//         const findLocation = await InmateLocation.findOne({locationName:checkLocationName})
//         if(findLocation){
//             return res.status(403).send({success:false,message:"location already existing"})
//         }
//        const adminAccess = await UserSchema.findById(req.user.id);
        
//         const saveLocation = new InmateLocation({
//             locationName:checkLocationName, depositLimit, spendLimit, createdBy: req.user.id, updatedBy: req.user.id
//         })
        
//         const result = await saveLocation.save()
//         if (!depositLimit) {
//             return res.status(200).send({
//                 success: true,
//                 message: "Location created successfully, but no deposit limit has been set. Be cautious, as inmates can deposit unlimited amounts."
//             });
//         }
//         if(!adminAccess.location_id){
//             await UserSchema.findByIdAndUpdate(req.user.id,{location_id:result._id})
//         }
//         if (!spendLimit) {
//             return res.status(200).send({
//                 success: true,
//                 message: "Location created successfully, but no spend limit has been set. Be cautious, as inmates can withdraw unlimited amounts."
//             });
//         }
//         return res.status(200).send({ success: true,data:result, message: "location data added successfully" })
//     } catch (error) {
//         res.status(500).send({ success: false, message: "internal server down",error:error.message })
//     }
// }

exports.AddLocation = async (req, res) => {
    try {
        const { locationName, custodyLimits } = req.body;
        if (!locationName) {
            return res.status(400).json({ success: false, message: "Location name is required." });
          }
          if (!Array.isArray(custodyLimits) || custodyLimits.length === 0) {
            return res.status(400).json({ success: false, message: "At least one custody limit is required." });
          }
      
          const checkLocationName = locationName.trim().toLowerCase();
          const existing = await InmateLocation.findOne({ locationName: checkLocationName });
          if (existing) {
            return res.status(409).json({ success: false, message: "Location already exists." });
          }

          const allowedTypes = ['remand_prisoner', 'under_trail', 'remand_of_court'];
          for (const c of custodyLimits) {
            if (!allowedTypes.includes(c.custodyType)) {
              return res.status(400).json({ success: false, message: `Invalid custodyType: ${c.custodyType}` });
            }
          }

          const location = new InmateLocation({
            locationName: checkLocationName,
            custodyLimits,
            createdBy: req.user.id,
            updatedBy: req.user.id
          });

          const result = await location.save();

          const adminAccess = await UserSchema.findById(req.user.id);
          if (!adminAccess.location_id) {
            await UserSchema.findByIdAndUpdate(req.user.id, { location_id: result._id });
          }

          return res.status(201).json({
            success: true,
            data: result,
            message: "Location with custody limits created successfully."
          });
    } catch (error) {
        res.status(500).send({ success: false, message: "internal server down",error:error.message })
    }
}

// exports.updateLocation = async (req, res) => {
//     try {
//         const { locationName, depositLimit, spendLimit } = req.body;
//         const { id } = req.params;
//         if (!locationName || depositLimit == null || spendLimit == null) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Please provide locationName, depositLimit, and spendLimit.",
//             });
//         }

//         const existingLocation = await InmateLocation.findById(id);
//         if (!existingLocation) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Location not found with the provided ID.",
//             });
//         }

//         const updateData = { locationName, depositLimit, spendLimit,updatedBy: req.user.id };
//         const updatedLocation = await InmateLocation.findByIdAndUpdate(id, updateData, {
//             new: true,
//             runValidators: true,
//         });

//         if (!updatedLocation) {
//             return res.status(500).json({
//                 success: false,
//                 message: "Failed to update the location. Please try again.",
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "Location updated successfully.",
//             data: updatedLocation,
//         });

//     } catch (error) {
//         console.error("Error updating location:", error);
//         return res.status(500).json({
//             success: false,
//             message: "Internal server error. Please try again later.",
//         });
//     }
// };

exports.updateLocation = async (req, res) => {
    try {
        const { id } = req.params;
    const { locationName, custodyLimits } = req.body;

    // --- 1. Validate request ---
    if (!locationName && !custodyLimits) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update: locationName or custodyLimits."
      });
    }

    // --- 2. Check existence ---
    const existingLocation = await InmateLocation.findById(id);
    if (!existingLocation) {
      return res.status(404).json({
        success: false,
        message: "Location not found with the provided ID."
      });
    }

    // --- 3. Prepare update data ---
    const updateData = { updatedBy: req.user.id };
    if (locationName) updateData.locationName = locationName.trim().toLowerCase();

    if (custodyLimits) {
      if (!Array.isArray(custodyLimits) || custodyLimits.length === 0) {
        return res.status(400).json({
          success: false,
          message: "custodyLimits must be a non-empty array."
        });
      }

      const allowedTypes = ['remand_prisoner', 'under_trail', 'remand_of_court'];
      for (const c of custodyLimits) {
        if (!allowedTypes.includes(c.custodyType)) {
          return res.status(400).json({
            success: false,
            message: `Invalid custodyType: ${c.custodyType}`
          });
        }
      }

      // Replace entire custodyLimits array
      updateData.custodyLimits = custodyLimits;
    }

    // --- 4. Update document ---
    const updatedLocation = await InmateLocation.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    });

    return res.status(200).json({
      success: true,
      message: "Location updated successfully.",
      data: updatedLocation
    });

    } catch (error) {
        console.error("Error updating location:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error. Please try again later.",
        });
    }
};


exports.getAllLocation = async (req, res) => {
    try {
        const response = await InmateLocation.find().populate({ path: 'createdBy', select: 'fullname' }).populate({ path: 'updatedBy', select: 'fullname' })
        if (!response.length) {
            res.status(404).send({ success: false, data: response, message: "could not find location" })
        }
        res.status(200).send({ success: true, data: response, message: "location fetch successfully" })
    } catch (error) {
        res.status(500).send({ success: false, message: "internal server down" })
    }
}

exports.deleteLocation = async (req, res) => {
    try {
        const { id } = req.params;

        const deletedLocation = await InmateLocation.findByIdAndDelete(id);

        if (!deletedLocation) {
            return res.status(404).json({
                success: false,
                message: "Location not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Location deleted successfully.",
        });
    } catch (error) {
        console.error("Delete Location Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
};
