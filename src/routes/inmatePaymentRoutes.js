const express = require('express');
const inmatePayment = require("../controllers/paymentController")
const router = express.Router();

router.post("/create",inmatePayment.inmateCreatePayment)
router.post("/verify",inmatePayment.inmateVerifyPayment)

module.exports = router;