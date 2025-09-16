const financialModel = require("../model/financialModel");
const InmateLocation = require("../model/inmateLocationModel");
const inmateModel = require("../model/inmateModel");

// exports.checkTransactionLimit = async (inmateId, amount, type) => {
//   try {
//        // First day of the current month
//     const monthStart = new Date();
//     monthStart.setDate(1); // Set to first day
//     monthStart.setHours(0, 0, 0, 0); // Start of the day

//     var typeFilter;
//      const typeFilter =
//       type === "deposit" || type === "wages"
//         ? { $in: ["deposit", "wages"] }
//         : type;

//     const transactions = await financialModel.find({
//       inmateId: inmateId,
//       type: typeFilter,
//       createdAt: { $gte: monthStart }
//     });

//     let totalAmount = 0;
//     if (type === "wages" || type === "deposit") {
//        totalAmount = transactions.reduce((sum, tx) => {
//         return sum + (tx.wageAmount || 0) + (tx.depositAmount || 0);
//       }, 0);

//     } else if (type === "spend") {
//       totalAmount = transactions.reduce((sum, tx) => sum + (tx.spendAmount || 0), 0);
//     }
//     const inmateData = await inmateModel.findOne({ inmateId }).populate('location_id');
//     if (!inmateData || !inmateData.location_id) {
//       return { status: false, message: "Inmate or location data not found" };
//     }

//     const location = inmateData.location_id;
//     const newTotal = totalAmount + amount;

//     if (type === "deposit" || type === "wages") {
//       if (location.depositLimit !== undefined && newTotal > location.depositLimit) {
//         return {
//           status: false,
//           message: `Deposit limit exceeded. Limit: ₹${location.depositLimit}, Attempted: ₹${newTotal}`
//         };
//       }
//     } else if (type === "spend") {
//       if (location.spendLimit !== undefined && newTotal > location.spendLimit) {
//         return {
//           status: false,
//           message: `Spend limit exceeded. Limit: ₹${location.spendLimit}, Attempted: ₹${newTotal}`
//         };
//       }
//     }

//     return {
//       status: true,
//       message: "Transaction allowed"
//     };

//   } catch (error) {
//     return { status: false, message: "Internal server error" };
//   }
// };

exports.checkTransactionLimit = async (inmateId, amount, type) => {
  try {
       // First day of the current month
    const monthStart = new Date();
    monthStart.setDate(1); // Set to first day
    monthStart.setHours(0, 0, 0, 0); // Start of the day

     const typeFilter =
      type === "deposit" || type === "wages"
        ? { $in: ["deposit", "wages"] }
        : type;
        
    const transactions = await financialModel.find({
      inmateId: inmateId,
      type: typeFilter,
      createdAt: { $gte: monthStart }
    });

    let totalAmount = 0;
    if (type === "wages" || type === "deposit") {
       totalAmount = transactions.reduce((sum, tx) => {
        return sum + (tx.wageAmount || 0) + (tx.depositAmount || 0);
      }, 0);

    } else if (type === "spend") {
      totalAmount = transactions.reduce((sum, tx) => sum + (tx.spendAmount || 0), 0);
    }
    const inmateData = await inmateModel.findOne({ inmateId }).populate('location_id');
    if (!inmateData || !inmateData.location_id) {
      return { status: false, message: "Inmate or location data not found" };
    }
    if(inmateData.is_blocked === "true"){
      return { status: false, message: `Inmate ${inmateData.inmateId} is currently blocked` };
    }

    const location = inmateData.location_id;
    
    const normalizedCustody = inmateData.custodyType
      .toLowerCase()
      .replace(/\s+/g, "_");
      
    const limitObj = location.custodyLimits?.find(
      (c) => {
        return c.custodyType.toLowerCase() === normalizedCustody
      }    );

     if (!limitObj) {
      return {
        status: false,
        message: `No limits configured for custody type "${normalizedCustody}"`,
      };
    }

    const newTotal = totalAmount + amount;

    if ((type === "deposit" || type === "wages") && limitObj.depositLimit != null) {
      if (newTotal > limitObj.depositLimit) {
        return {
          status: false,
          message: `Deposit limit exceeded for ${normalizedCustody}. Limit: ₹${limitObj.depositLimit}, Attempted total: ₹${newTotal}`,
        };
      }
    }

    if (type === "spend" && limitObj.spendLimit != null) {
      if (newTotal > limitObj.spendLimit) {
        return {
          status: false,
          message: `Spend limit exceeded for ${limitObj.custodyType}. Limit: ₹${limitObj.spendLimit}, Attempted total: ₹${newTotal}`,
        };
      }
    }

    return {
      status: true,
      message: "Transaction allowed"
    };

  } catch (error) {
    console.log("<><>error inmateTranscation",error);
    
    return { status: false, message: "Internal server error" };
  }
};

