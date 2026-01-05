const Transaction = require("../model/transactionModel");
const inmateModel = require("../model/inmateModel");
const { createOrder } = require("../service/razorpay.service");
const financialModel = require("../model/financialModel");

exports.inmateCreatePayment = async (req, res) => {
  try {
    const { inmateId, amount } = req.body;

    const inmate = await inmateModel.findOne({ inmateId });
    // const inmate = await inmateModel.find();
    // console.log(inmate)
    if (!inmate) {
      return res.status(404).json({ success: false, message: "Inmate not found" });
    }

    const receipt = `order_INM_${inmateId}_${Date.now().toString().slice(-6)}`;
    const order = await createOrder(amount, receipt);

    // ✅ SAME Transaction table as student
    const transaction = await Transaction.create({
     inmate_id:inmateId,
      order_id: order.id,
      amount,
      user_id: inmate.user_id,   // who initiated payment
      status: "created"
    });

    res.status(200).json({
      success: true,
      order,
      transactionId: transaction._id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
};

// exports.inmateVerifyPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       inmateId,
//     } = req.body;

//     // 🔐 Verify signature
//     const body = razorpay_order_id + "|" + razorpay_payment_id;
//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(body)
//       .digest("hex");

//     if (expectedSignature !== razorpay_signature) {
//       return res.status(400).json({ success: false, message: "Invalid signature" });
//     }

//     // 💳 Update transaction
//     const transaction = await Transaction.findOneAndUpdate(
//       { order_id: razorpay_order_id },
//       {
//         payment_id: razorpay_payment_id,
//         status: "paid"
//       },
//       { new: true }
//     );

//     if (!transaction) {
//       return res.status(404).json({ success: false, message: "Transaction not found" });
//     }

//     // 🧾 Ledger entry (THIS is Financial)
//     await Financial.create({
//       inmateId: inmateId,
//       custodyType: "DEPOSIT",
//       transaction: transaction._id.toString(),
//       type: "CREDIT",
//       status: "SUCCESS",
//       depositName: "Wallet Topup",
//       depositAmount: transaction.amount,
//       depositType: "ONLINE_PAYMENT"
//     });

//     res.json({
//       success: true,
//       message: "Inmate wallet credited successfully"
//     });

//   } catch (error) {
//     console.error("Verify error:", error);
//     res.status(500).json({ success: false, message: "Payment verification failed" });
//   }
// };

exports.inmateVerifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      inmateId,
    } = req.body;

    // 🔐 Step 1: Verify Razorpay signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature"
      });
    }

    // 💳 Step 2: Fetch transaction FIRST
    const transaction = await Transaction.findOne({
      order_id: razorpay_order_id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    // 🚫 Prevent double wallet credit
    if (transaction.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment already processed"
      });
    }

    // ✅ Step 3: Mark transaction as paid
    transaction.payment_id = razorpay_payment_id;
    transaction.status = "paid";
    await transaction.save();

    // 💰 Step 4: Increase inmate wallet balance (ATOMIC)
    const inmate = await inmateModel.findOneAndUpdate(
      { inmateId },
      { $inc: { balance: transaction.amount } },
      { new: true }
    );

    if (!inmate) {
      return res.status(404).json({
        success: false,
        message: "Inmate not found"
      });
    }

    // 🧾 Step 5: Ledger entry (Financial)
    await Financial.create({
      inmateId,
      custodyType: "DEPOSIT",
      transaction: transaction._id.toString(),
      type: "CREDIT",
      status: "SUCCESS",
      depositName: "Wallet Topup",
      depositAmount: transaction.amount,
      depositType: "ONLINE_PAYMENT"
    });

    res.json({
      success: true,
      message: "Payment verified & wallet credited",
      balance: inmate.balance
    });

  } catch (error) {
    console.error("Verify error:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification failed"
    });
  }
};
