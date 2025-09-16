const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const scheduleBackup = () => {
    // Run every day at 1:40 AM
    cron.schedule('48 1 * * *', async () => {
        console.log('⏳ Starting MongoDB JSON backup...');

        const client = new MongoClient(process.env.DB_MONGO_URL);

        try {
            await client.connect();
            const db = client.db();

            // Backup folder
            const now = new Date();
            const timestamp = now.toISOString().replace(/:/g, '-');
            const backupFolder = path.join(__dirname, '..', '..', 'public', 'backup', `backup-${timestamp}`);
            fs.mkdirSync(backupFolder, { recursive: true });

            // Fetch collections and save individually
            const collections = await db.listCollections().toArray();

            for (const { name } of collections) {
                const docs = await db.collection(name).find().toArray();
                const filePath = path.join(backupFolder, `${name}.json`);
                fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
                console.log(`✅ Saved collection ${name}`);
            }

            console.log(`🎉 Backup complete: ${backupFolder}`);
        } catch (err) {
            console.error('❌ Backup failed:', err);
        } finally {
            await client.close();
        }
    });
};

module.exports = { scheduleBackup };
