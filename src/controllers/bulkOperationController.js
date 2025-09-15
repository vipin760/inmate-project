const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const Inmate = require('../model/inmateModel');
const Financial = require('../model/financialModel');
const logAudit = require('../utils/auditlogger');
const Department = require("../model/departmentModel");
const mongoose = require("mongoose");
const { checkTransactionLimit } = require('../utils/inmateTransactionLimiter');
const InmateSchema = require("../model/inmateModel");
const userModel = require('../model/userModel');
const bcrypt = require('bcrypt');
const InmateLocation = require('../model/inmateLocationModel');

const bulkUpsertInmates = async (req, res) => {
  try {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "denied" } }).then(async (_d) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
 
    let inmates;
    const ext = req.file.originalname.split('.').pop().toLowerCase();
 
    if (ext === 'csv') {
      const csvString = req.file.buffer.toString('utf-8');
      inmates = parse(csvString, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } else if (ext === 'xlsx') {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      inmates = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    } else {
      return res.status(400).json({ message: 'Unsupported file format' });
    }
 
    if (!Array.isArray(inmates) || inmates.length === 0) {
      return res.status(400).json({ message: 'Uploaded file contains no data' });
    }
 
    const results = {
      created: [],
      updated: [],
      failed: []
    };
 
    for (const inmate of inmates) {
      const {
        inmateId,
        firstName,
        lastName,
        balance,
        status,
        cellNumber,
        dateOfBirth,
        admissionDate,
        crimeType, custodyType,
        location_id,
 
      } = inmate;
      if(location_id !== req.body.location){
        results.failed.push({ inmateId, reason: 'location id not matched' });
        continue;
      }
      if (
        !inmateId || !firstName || !lastName ||
        balance == null || !status || !cellNumber ||
        !dateOfBirth || !admissionDate || !crimeType
      ) {
        results.failed.push({ inmateId, reason: 'Missing required fields' });
        continue;
      }
 
      const dob = new Date(dateOfBirth);
      const admDate = new Date(admissionDate);
 
      if (isNaN(dob) || isNaN(admDate)) {
        results.failed.push({ inmateId, reason: 'Invalid date format' });
        continue;
      }
 
      const existing = await Inmate.findOne({ inmateId: inmateId });
 
      if (existing) {
        const isModified =
          existing.firstName !== firstName ||
          existing.lastName !== lastName ||
          existing.balance !== parseFloat(balance) ||
          existing.status !== status ||
          existing.cellNumber !== cellNumber ||
          existing.dateOfBirth.getTime() !== dob.getTime() ||
          existing.admissionDate.getTime() !== admDate.getTime() ||
          existing.crimeType !== crimeType;
        existing.custodyType !== custodyType;
        existing.location_id !== location_id;
 
        if (isModified) {
          existing.firstName = firstName;
          existing.lastName = lastName;
          existing.balance = parseFloat(balance);
          existing.status = status;
          existing.cellNumber = cellNumber;
          existing.dateOfBirth = dob;
          existing.admissionDate = admDate;
          existing.crimeType = crimeType;
          existing.custodyType = custodyType;
          existing.location_id = location_id;
 
          await existing.save();
          results.updated.push(inmateId);
        }
      } else {
        const newInmate = new Inmate({
          inmateId: inmateId,
          firstName,
          lastName,
          balance: parseFloat(balance),
          status,
          cellNumber,
          dateOfBirth: dob,
          admissionDate: admDate,
          crimeType,
          location_id, custodyType
        });
        const savedInmate = await newInmate.save();
        results.created.push(inmateId);
        if (savedInmate) {
          const hashedPassword = await bcrypt.hash(inmateId, 10);
          const newUser = new userModel({ username: inmateId, fullname: inmateId,inmateId, password: hashedPassword, role: "INMATE", location_id });
          await newUser.save().then((data) => {
 
          }).catch((error) => {
            results.failed.push({ inmateId, reason: error.message });
          })
        }
 
 
      }
    }
 
    await logAudit({
      userId: req.user.id,
      username: req.user.username,
      action: 'BULK_UPSERT',
      targetModel: 'Inmate',
      targetId: null,
      description: `Bulk upsert of inmates performed. Created: ${results.created.length}, Updated: ${results.updated.length}, Failed: ${results.failed.length}`,
      changes: results
    });
 
    return res.status(200).json({
      success: true,
      message: 'Bulk inmate operation completed',
      results
    });
 
  

    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  } finally {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "approved" } })

  }
};

const bulkUpsertFinancial = async (req, res) => {
  try {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "denied" } }).then(async (_d) => {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }

      const ext = req.file.originalname.split('.').pop().toLowerCase();
      let records;

      if (ext === 'csv') {
        const csvString = req.file.buffer.toString('utf-8');
        records = parse(csvString, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ','
        });
      } else if (ext === 'xlsx') {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        records = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      } else {
        return res.status(400).json({ message: 'Unsupported file format' });
      }

      const results = {
        created: [],
        skipped: [],
        failed: []
      };

      for (const entry of records) {
        let {
          inmateId,
          custodyType,
          wageAmount,
          hoursWorked,
          transaction = "WEEKLY",
          workAssignId,
          type = "wages"
        } = entry;

        if (!inmateId || !custodyType || !type || !wageAmount || !hoursWorked || !transaction || !workAssignId) {
          results.failed.push({ inmateId, reason: 'Missing required fields' });
          continue;
        }

        const Departments = await Department.find({
          "name": workAssignId
        });

        if (!Departments.length) {
          results.failed.push({ inmateId, reason: 'Missing department', workAssignId });
          continue;
        }
        const checkLimit = await checkTransactionLimit(inmateId, parseInt(wageAmount), type)
        if (!checkLimit.status) {
          results.failed.push({ inmateId, reason: checkLimit.message, workAssignId });
          continue;
        }

        workAssignId = new mongoose.Types.ObjectId(Departments[0]._id);

        try {

          const wage = parseInt(wageAmount || 0);
          if (!wage || isNaN(wage)) {
            results.skipped.push(inmateId);
            continue;
          } else {
            const newEntry = new Financial({
              inmateId,
              transaction,
              workAssignId,
              hoursWorked: parseInt(hoursWorked || 0),
              wageAmount: wage,
              type,
              status: "ACTIVE",
              custodyType
            });

            await newEntry.save();
            if (wage > 0) {
              const inmate = await Inmate.findOne({ inmateId });
              if (inmate) {
                inmate.balance += wage;
                inmate.custodyType = custodyType;
                await inmate.save();
              } else {
                results.failed.push({ inmateId, reason: 'Inmate not found for balance update' });
                continue;
              }
            }
            results.created.push(inmateId);
          }
        } catch (err) {
          results.failed.push({ inmateId, reason: 'Save failed', error: err.message, custodyType });
        }
      }


      await logAudit({
        userId: req.user.id,
        username: req.user.username,
        action: 'BULK_UPSERT',
        targetModel: 'Financial',
        targetId: null,
        description: `Bulk upsert of wages performed. Created: ${results.created.length}, Updated: ${results.skipped.length}, Failed: ${results.failed.length}`,
        changes: results
      });
      res.status(200).json({
        success: true,
        message: 'Bulk financial operation completed',
        results
      });



    })
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
  } finally {
    await InmateLocation.findByIdAndUpdate(req.body.location, { $set: { purchaseStatus: "approved" } })
  }
};

module.exports = { bulkUpsertInmates, bulkUpsertFinancial };
