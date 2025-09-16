const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

async function backupDatabase() {
  const dateStamp = new Date().toISOString().split("T")[0]; 
  const backupDir = path.join(__dirname, "..", "public", "backups");
  const backupPath = path.join(backupDir, `backup-${dateStamp}`);

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const cmd = `mongodump --uri="mongodb://localhost:27017/yourdb" --out="${backupPath}"`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("Backup failed:", err.message);
    } else {
      console.log(`✅ Backup completed: ${backupPath}`);
    }
  });
}

module.exports = backupDatabase;