const express = require('express');
const { createPOSCart, getPOSCartById, getAllPOSCarts ,updatePOSCart,deletePOSCart } = require('../controllers/cartController');
const router = express.Router();

router.post("/create",createPOSCart);
router.get("/",getAllPOSCarts);
router.get("/:id",getPOSCartById);
router.put("/:id",updatePOSCart);
router.delete("/:id",deletePOSCart);

module.exports = router;