const vendorPurchaseModel = require("../model/vendorPurchase")
const storeItemModel = require("../model/storeInventory")
const tuckShopModel = require("../model/tuckShopModel")
const CanteenInventory = require("../model/canteenInventory")
exports.addInventoryStock = async(req,res)=>{
    try {
        const {date,invoiceNo,vendorName,contact,status,storeItems} = req.body
        if(!date || !invoiceNo || !vendorName || !storeItems){
            return res.status(400).send({success:false,message:"all fields are required"})
        }
        const isExistInvoice = await vendorPurchaseModel.findOne({invoiceNo})
        if(isExistInvoice){
            return res.status(400).send({success:false,message:"invoice already exists"})
        }
        const vendorPurchase = await vendorPurchaseModel.create({date,invoiceNo,vendorName,contact,status})
        let storeItem
        for(const item of storeItems){
         storeItem = await storeItemModel.create({vendorPurchase:vendorPurchase._id,itemName:item.itemName,itemNo:item.itemNo,amount:item.amount,stock:item.stock,sellingPrice:item.sellingPrice,category:item.category,status:item.status})
          const itemExist = await tuckShopModel.findOne({itemNo:item.itemNo})
          if(!itemExist){
            await tuckShopModel.create({itemName:item.itemName, price:item.sellingPrice, stockQuantity:0, category:item.category,itemNo:item.itemNo,status:item.status})
          }
        }
        return res.send({success:true,data:storeItem,message:"inventory added successfully"})
    } catch (error) {
        return res.status(500).send({success:false,message:"internal server down",error:error.message})
    }
}

exports.getInventoryStock = async(req,res)=>{
    try {
        const result = await storeItemModel.aggregate([
            {
              $lookup: {
                from: "vendorpurchases",
                localField: "vendorPurchase",
                foreignField: "_id",
                as: "vendorPurchase"
              }
            },
            { $unwind: "$vendorPurchase" },
          
            {
              $group: {
                _id: "$vendorPurchase._id",
                vendorPurchase: { $first: "$vendorPurchase" },
                totalAmount: { $sum: "$amount" },
          
                items: {
                  $push: {
                    _id: "$_id",
                    itemName: "$itemName",
                    itemNo: "$itemNo",
                    amount: "$amount",
                    stock: "$stock",
                    sellingPrice: "$sellingPrice",
                    category: "$category",
                    status: "$status",
                    createdAt: "$createdAt",
                    updatedAt: "$updatedAt"
                  }
                }
              }
            },
            {
              $project: {
                _id: 0,
                vendorPurchase: 1,
                totalAmount: 1,
                items: 1
              }
            }
          ]);
          
        if(result.length === 0){
            return res.status(404).send({success:false,message:"inventory stock not found"})
        }
        return res.send({success:true,data:result,message:"inventory stock fetched successfully"})
    } catch (error) {
        return res.status(500).send({success:false,message:"internal server down",error:error.message})
    }
}

exports.getInventoryStockById = async(req,res)=>{
    try {
        const {id} = req.params
        const result = await storeItemModel.findById(id).populate("vendorPurchase")
        if(!result){
            return res.status(404).send({success:false,message:"inventory stock not found"})
        }
        return res.send({success:true,data:result,message:"inventory stock fetched successfully"})
    } catch (error) {
        return res.status(500).send({success:false,message:"internal server down",error:error.message})
    }
}

exports.updateInventoryProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, invoiceNo, vendorName, contact, status, storeItems = [] } = req.body;

    // 1️⃣ Check vendor purchase
    const vendorDoc = await vendorPurchaseModel.findById(id);
    if (!vendorDoc) {
      return res.status(404).json({ success: false, message: "Vendor purchase not found" });
    }

    // 2️⃣ Update vendor details
    await vendorPurchaseModel.findByIdAndUpdate(
      id,
      { date, invoiceNo, vendorName, contact, status },
      { new: true }
    );

    // 3️⃣ Upsert store items and update tuck-shop items
    for (const item of storeItems) {
      const { itemName, itemNo, amount, stock, sellingPrice, category, status } = item;

      // --- StoreInventory upsert ---
      const existingStore = await storeItemModel.findOne({ vendorPurchase: id, itemNo });
      if (existingStore) {
        await storeItemModel.findByIdAndUpdate(existingStore._id, {
          itemName, amount, stock, sellingPrice, category, status
        });
      } else {
        await storeItemModel.create({
          vendorPurchase: id,
          itemName, itemNo, amount, stock, sellingPrice, category, status
        });
      }

      // --- TuckShop upsert (create or update) ---
      await tuckShopModel.findOneAndUpdate(
        { itemNo },                               
        {
          itemName,
          category,
          price: sellingPrice,
          status
        },
        { upsert: true, new: true }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Vendor and items updated, tuck-shop synced"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.transferInventoryToCanteenInventory1 = async(req,res)=>{
    try {
         const { itemName, category, itemNo, transferQty } = req.body;
    if (!itemNo || !transferQty) {
      return res.status(400).json({
        success: false,
        message: "itemName, category, itemNo and transferQty are required"
      });
    }

    const qty = Number(transferQty);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        success: false,
        message: "transferQty must be a positive number"
      });
    }

    // ✅ 2. Find total stock available in StoreInventory
    const totalStore = await storeItemModel.aggregate([
      {
        $match: { itemName, category, itemNo }
      },
      {
        $group: { _id: null, totalQty: { $sum: "$stock" } }
      }
    ]);

    const availableStock = totalStore.length ? totalStore[0].totalQty : 0;
    if (availableStock < qty) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} units available in store`
      });
    }

    // ✅ 3. Deduct quantity from StoreInventory (oldest-first or just first found)
    //    Here we simply deduct across items until qty fulfilled
    let remaining = qty;
    const storeItems = await storeItemModel.find({ itemName, category, itemNo }).sort({ createdAt: 1 });
    for (const item of storeItems) {
      if (remaining <= 0) break;
      const deduct = Math.min(item.stock, remaining);
      await storeItemModel.findByIdAndUpdate(item._id, { $inc: { stock: -deduct } });
      remaining -= deduct;
    }

    // ✅ 4. Upsert canteen inventory
    const canteenItem = await CanteenInventory.findOne({ itemNo });
    if (canteenItem) {
      await CanteenInventory.findByIdAndUpdate(
        canteenItem._id,
        { 
          $inc: { currentStock: qty, totalStock: qty },
          itemNo,
          status: "Active"
        },
        { new: true }
      );
    } else {
      await CanteenInventory.create({
        itemNo,
        storeItem: storeItems[0]._id, // reference to first store item
        currentStock: qty,
        totalStock: qty,
        status: "Active"
      });
    }

    // ✅ 5. Update TuckShop stockQuantity as well
    const tuck = await tuckShopModel.findOne({ itemNo });
    if (tuck) {
      await tuckShopModel.findByIdAndUpdate(tuck._id, {
        $inc: { stockQuantity: qty }
      });
    } else {
      // optional: if not found, create it
      await tuckShopModel.create({
        itemName,
        category,
        itemNo,
        price: 0,
        stockQuantity: qty,
        status: "Active"
      });
    }

    return res.status(200).json({
      success: true,
      message: `Transferred ${qty} units of ${itemName} to canteen successfully`
    });
    } catch (error) {
        return res.status(500).send({success:false,message:"internal server down",error:error.message})
    }
}

exports.transferInventoryToCanteenInventory2 = async(req,res)=>{
  try {
       const { itemName, category, itemNo, transferQty } = req.body;
  if (!itemNo || !transferQty) {
    return res.status(400).json({
      success: false,
      message: "itemName, category, itemNo and transferQty are required"
    });
  }

  const storeItems = await storeItemModel
      .find({ itemNo, stock: { $gt: 0 } })
      .sort({ createdAt: -1 });

      if (!storeItems.length) {
        return res.status(400).json({
          success: false,
          message: "No stock available in store for this item",
        });
      }

      const totalAvailable = storeItems.reduce((sum, i) => sum + i.stock, 0);

      if (totalAvailable < transferQty) {
        return res.status(400).json({
          success: false,
          message: `Only ${totalAvailable} units available, cannot transfer ${transferQty}`,
        });
      }

      let remaining = transferQty;
      const bulkOps = [];


      for (const doc of storeItems) {
        if (remaining <= 0) break;
  
        if (doc.stock <= remaining) {
          // Deplete entire doc stock
          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $set: { stock: 0 } },
            },
          });
          remaining -= doc.stock;
        } else {
          // Partially reduce stock
          bulkOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: { $inc: { stock: -remaining } },
            },
          });
          remaining = 0;
        }
      }


      await storeItemModel.bulkWrite(bulkOps);

      await tuckShopModel.updateOne(
        { itemNo },
        {
          $setOnInsert: { itemName, category, status: "Active" },
          $inc: { stockQuantity: transferQty },
        },
        { upsert: true }
      );


      return res.status(200).json({
        success: true,
        message: `Transferred ${transferQty} units of ${itemName} to canteen successfully`,
      });
  } catch (error) {
      return res.status(500).send({success:false,message:"internal server down",error:error.message})
  }
}

exports.transferInventoryToCanteenInventory = async (req, res) => {
  try {
    const { itemNo, transferQty } = req.body;

    if (!itemNo || !transferQty) {
      return res.status(400).json({
        success: false,
        message: "itemNo and transferQty are required",
      });
    }

    // Fetch store stock (only items with stock > 0)
    const storeItems = await storeItemModel
      .find({ itemNo, stock: { $gt: 0 } })
      .sort({ createdAt: -1 });

    if (!storeItems.length) {
      return res.status(400).json({
        success: false,
        message: "No stock available in store for this item",
      });
    }

    const totalAvailable = storeItems.reduce((sum, i) => sum + i.stock, 0);
    if (totalAvailable < transferQty) {
      return res.status(400).json({
        success: false,
        message: `Only ${totalAvailable} units available, cannot transfer ${transferQty}`,
      });
    }

    // ✅ pick reference data (all docs share same itemName/itemNo/category)
    const { itemName, category, sellingPrice } = storeItems[0];

    let remaining = transferQty;
    const bulkOps = [];

    for (const doc of storeItems) {
      if (remaining <= 0) break;

      if (doc.stock <= remaining) {
        bulkOps.push({
          updateOne: { filter: { _id: doc._id }, update: { $set: { stock: 0 } } },
        });
        remaining -= doc.stock;
      } else {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: { $inc: { stock: -remaining } },
          },
        });
        remaining = 0;
      }
    }

    await storeItemModel.bulkWrite(bulkOps);

    // ✅ Update or create tuck shop record
    await tuckShopModel.updateOne(
      { itemNo },
      {
        $setOnInsert: {
          itemName,
          category: category || "General",
          price: sellingPrice,         // use sellingPrice as canteen price
          status: "Active",
          description: "",
        },
        $inc: { stockQuantity: transferQty },
      },
      { upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Transferred ${transferQty} units of ${itemName} to canteen successfully`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


exports.deleteStoreData = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Delete the StoreInventory record
    const result = await storeItemModel.findByIdAndDelete(id);
    if (!result) {
      return res
        .status(404)
        .send({ success: false, message: "Inventory stock not found" });
    }

    return res.send({
      success: true,
      data: result,
      message: "Inventory stock and tuck-shop item deleted successfully"
    });
  } catch (error) {
    return res.status(500).send({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.deleteInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Check vendor exists
    const vendor = await vendorPurchaseModel.findById(id);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor purchase not found"
      });
    }

    // 2️⃣ Find all related store inventory items first
    const storeItems = await storeItemModel.find({ vendorPurchase: id });

    // 4️⃣ Delete all related store inventory items
    await storeItemModel.deleteMany({ vendorPurchase: id });

    // 5️⃣ Delete the vendor purchase itself
    await vendorPurchaseModel.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Vendor purchase, store items, and tuck-shop items deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

exports.getAllCanteenItem = async (req, res) => {
  try {
    const {
      page,
      limit,
      sortField = "createdAt",
      sortOrder = "desc",
      itemName,
      category,
      status,
    } = req.query;

    /* 1️⃣ Build filter for TuckShop */
    const filter = {};
    if (itemName) filter.itemName = { $regex: itemName, $options: "i" };
    if (category) filter.category = { $regex: `^${category}$`, $options: "i" };
    if (status) filter.status = status;

    /* 2️⃣ Build base query */
    const query = tuckShopModel.find(filter);

    /* 3️⃣ Sorting */
    const sort = {};
    sort[sortField] = sortOrder.toLowerCase() === "asc" ? 1 : -1;
    query.sort(sort);

    /* 4️⃣ Pagination */
    let paginated = false;
    if (page && limit) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      query.skip(skip).limit(parseInt(limit));
      paginated = true;
    }

    const items = await query.exec();
    if (!items.length) {
      return res.status(404).json({ success: false, message: "No data found" });
    }

    /* 5️⃣ Aggregate total stock ONLY for the returned items */
    const itemNos = items.map(i => i.itemNo);      // gather itemNo's for match
    const inventoryTotals = await storeItemModel.aggregate([
      { $match: { itemNo: { $in: itemNos } } },    // <— key fix: match first
      {
        $group: {
          _id: {
            itemName: "$itemName",
            itemNo: "$itemNo",
            category: "$category",
          },
          totalQty: { $sum: "$stock" },
        },
      },
    ]);

    /* 6️⃣ Lookup map */
    const totalMap = new Map();
    inventoryTotals.forEach(doc => {
      const key = `${doc._id.itemName}|${doc._id.itemNo}|${doc._id.category}`;
      totalMap.set(key, doc.totalQty);
    });

    /* 7️⃣ Attach totalQty to each tuck item */
    const withTotals = items.map(item => {
      const key = `${item.itemName}|${item.itemNo}|${item.category}`;
      return { ...item.toObject(), totalQty: totalMap.get(key) || 0 };
    });

    /* 8️⃣ If paginated, send meta info */
    if (paginated) {
      const totalCount = await tuckShopModel.countDocuments(filter);
      return res.status(200).json({
        success: true,
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        data: withTotals,
      });
    }

    /* 9️⃣ Otherwise return all */
    return res.status(200).json({ success: true, data: withTotals });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "internal server dow",
      error: error,
    });
  }
};

exports.getCanteenItemListOptions = async(req,res)=>{
    try {
      const { itemNo } = req.query
      const filter = { status: "Active" };
      if (itemNo) {
        filter.itemNo = { $regex: itemNo, $options: "i" };
      }
      const items = await tuckShopModel.find(filter);
      return res.status(200).json({ success: true, data: items });
    } catch (error) {
        return res.status(500).json({ success: false, message: "internal server down", error: error });
    }
}


