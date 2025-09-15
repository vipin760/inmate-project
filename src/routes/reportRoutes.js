const express = require('express');
const { intimateBalanceReport, transactionSummaryReport, tuckShopSalesReport, wageDistributionReport, quickStatistics } = require('../controllers/reportController');
const router = express.Router();

router.get("/quick-statistics",quickStatistics);
router.post("/intimate-balance-report",intimateBalanceReport);
router.post('/transaction-summary-report',transactionSummaryReport);
router.post('/tuckshop-sales-report',tuckShopSalesReport);
router.post('/wage-distribution-report',wageDistributionReport);


module.exports = router;