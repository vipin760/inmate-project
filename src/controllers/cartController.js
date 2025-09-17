const POSShoppingCart = require("../model/posShoppingCart");
const TuckShop = require("../model/tuckShopModel");
const Inmate = require("../model/inmateModel");
const mongoose = require("mongoose");
const logAudit = require("../utils/auditlogger");
const { checkTransactionLimit, checkProductsLimit } = require("../utils/inmateTransactionLimiter");
const userModel = require("../model/userModel");
const InmateLocation = require("../model/inmateLocationModel");
const inmateModel = require("../model/inmateModel");

const createPOSCart = async (req, res) => {
  try {
    const { inmateId, totalAmount, products } = req.body;
    const userData = await userModel.findById(req.user.id).populate("location_id")
    location_id=userData.location_id
    if(!userData.location_id){
      return res.status(404).send({success:false,message:"This user has no location"})
    }
    if(userData.location_id.purchaseStatus === "denied"){
        return res.status(403).send({success:false,message:"Our application is undergoing maintenance. Please try again in a little while"})
    }
      const depositLim = await checkTransactionLimit(inmateId,totalAmount,type="spend");
         if(!depositLim.status){
          return res.status(400).send({success:false,message:depositLim.message});
         }
    const checkRechargeTransactionLim = await checkProductsLimit(inmateId,products)
    if(!checkRechargeTransactionLim.status){
      return res.status(400).send({success:false,message:checkRechargeTransactionLim.message});
    }

    if (!inmateId || totalAmount === undefined || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    for (const item of products) {
      if (!item.productId || !item.quantity) {
        return res.status(400).json({ message: "Each product must have productId and quantity" });
      }
    }

    // Check inmate existence
    const existingInmate = await Inmate.findOne({ inmateId });
    if (!existingInmate) {
      return res.status(400).json({ success: false, message: "Inmate ID does not exist" });
    }

    // Check sufficient balance
    if (existingInmate.balance < totalAmount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // Check stock availability
    for (const item of products) {
      const tuckItem = await TuckShop.findById(item.productId);
      if (!tuckItem) {
        return res.status(404).json({ message: `Product with ID ${item.productId} not found` });
      }

      if (tuckItem.stockQuantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for item "${tuckItem.itemName}". Available: ${tuckItem.stockQuantity}, Requested: ${item.quantity}`
        });
      }
    }

    // Deduct stock from TuckShop
    for (const item of products) {
      await TuckShop.findByIdAndUpdate(item.productId, {
        $inc: { stockQuantity: -item.quantity }
      });
    }

    // Create POS cart
    const newCart = new POSShoppingCart({ inmateId, totalAmount, products });
    const savedCart = await newCart.save();

    // Deduct balance
    existingInmate.balance -= totalAmount;
    await existingInmate.save();

    // Audit log
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      inmateId: inmateId,
      action: 'CREATE',
      targetModel: 'POSShoppingCart',
      targetId: savedCart._id,
      description: `Created POS cart for inmate ${inmateId}`,
      changes: { totalAmount, products, inmateId, custodyType: existingInmate.custodyType }
    });

    res.status(201).json({ success: true, data: savedCart, message: "Cart created successfully" });

  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getAllPOSCarts = async (req, res) => {
  try {
    const carts = await POSShoppingCart.find().populate("products.productId").sort({ createdAt: -1 });

    if (!carts || carts.length === 0) {
      return res.status(404).json({ success: false, message: "No carts found", data: [] });
    }

    res.status(200).json({ success: true, data: carts });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const getPOSCartById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid cart ID format" });
    }

    const cart = await POSShoppingCart.findById(id).populate("products.productId");

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    res.status(200).json({ success: true, data: cart });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const updatePOSCart = async (req, res) => {
  try {
    const { id } = req.params;
    const updateBody = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const updatedCart = await POSShoppingCart.findByIdAndUpdate(id, updateBody, {
      new: true,
      runValidators: true,
    });

    if (!updatedCart) {
      return res.status(404).json({ message: "POS cart not found" });
    }

    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'UPDATE',
      targetModel: 'POSShoppingCart',
      targetId: updatedCart._id,
      description: `Updated POS cart for inmate ${updatedCart.inmateID}`,
      changes: updateBody
    });

    res.status(200).json({ success: true, data: updatedCart, message: "POS cart updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const deletePOSCart = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid ID format" });
    }

    const deletedCart = await POSShoppingCart.findByIdAndDelete(id);

    if (!deletedCart) {
      return res.status(404).json({ message: "POS cart not found" });
    }
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'DELETE',
      targetModel: 'POSShoppingCart',
      targetId: deletedCart._id,
      description: `Deleted POS cart for inmate ${deletedCart.inmateID}`,
      changes: deletedCart
    });
    res.status(200).json({ success: true, message: "POS cart deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

const reversePOSCart = async (req, res) => {
  try {
    const { id } = req.params;
    if(req.user.role != "ADMIN") return res.status(404).send({success:false,message:"Only admins are allowed to use this feature"})
    const posCartData = await POSShoppingCart.findById(id);
    if (!posCartData) {
      return res.status(404).json({ success: false, message: "POS cart not found" });
    }

    if (posCartData.is_reversed) {
      return res.status(400).json({ success: false, message: "This order is already reversed" });
    }

    const inmateData = await Inmate.findOne({ inmateId: posCartData.inmateId });
    if (!inmateData) {
      return res.status(404).json({ success: false, message: "Inmate not found" });
    }

    for (const item of posCartData.products) {
      await TuckShop.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: item.quantity } },
        { new: true }
      );
    }

    inmateData.balance += posCartData.totalAmount;
    await inmateData.save();

    posCartData.is_reversed = true;
    await posCartData.save();

   await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: "DELETE",
      targetModel: "POSShoppingCart",
      targetId: posCartData._id,
      description: `Reversed POS cart for inmate ${posCartData.inmateId} (Custody Type: ${inmateData.custodyType})`,
      changes: {
        ...posCartData.toObject(),
        custodyType: inmateData.custodyType   
      }
    });

    return res.json({
      success: true,
      message: "POS order reversed successfully",
      data: {
        posCartData,
        updatedInmateBalance: inmateData.balance
      }
    });
  } catch (error) {
    console.error("Reverse POS error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};
module.exports = { createPOSCart, getPOSCartById, getAllPOSCarts, updatePOSCart, deletePOSCart,reversePOSCart };
