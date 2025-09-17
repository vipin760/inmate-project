const express = require('express');
const { addInventoryStock, getInventoryStock, getInventoryStockById, updateInventoryProduct,deleteStoreData,deleteInventoryItem,getAllCanteenItem,transferInventoryToCanteenInventory } = require('../controllers/inventoryController');
const router = express.Router();

router.post('/',addInventoryStock)
router.get('/',getInventoryStock)
router.get('/canteen',getAllCanteenItem)
router.post('/transfer',transferInventoryToCanteenInventory)
router.get('/:id',getInventoryStockById)
router.put('/:id',updateInventoryProduct)
router.delete('/item/:id',deleteStoreData)
router.delete('/store/:id',deleteInventoryItem)


module.exports = router;