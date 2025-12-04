const { connectToDatabase } = require('../lib/mongodb');
const Name = require('../models/Name');

// Import the existing names data
const namesData = [
    { name: "Abdulaziz", gender: "Erkek", origin: "Arapça", syllables: 4, length: 9, meaning: "Aziz olan Allah'ın kulu", inQuran: true },
    { name: "Abdulkadir", gender: "Erkek", origin: "Arapça", syllables: 4, length: 10, meaning: "Güç ve kudret sahibi", inQuran: true },
    { name: "Abdulkerim", gender: "Erkek", origin: "Arapça", syllables: 4, length: 10, meaning: "Kerim olan Allah'ın kulu", inQuran: true },
    { name: "Abdullah", gender: "Erkek", origin: "Arapça", syllables: 3, length: 8, meaning: "Allah'ın kulu", inQuran: true },
    // ... The rest will be loaded from the actual names.js file
];

async function migrateData() {
    try {
        console.log('Connecting to MongoDB...');
        await connectToDatabase();
        console.log('Connected to MongoDB successfully!');

        // Load names from the actual names.js file
        const fs = require('fs');
        const path = require('path');
        const namesFilePath = path.join(__dirname, '..', 'names.js');

        console.log('Loading names from names.js...');
        const namesFileContent = fs.readFileSync(namesFilePath, 'utf8');

        // Extract the array from the file
        const match = namesFileContent.match(/const namesData = (\[[\s\S]*?\]);/);
        if (!match) {
            throw new Error('Could not extract namesData from names.js');
        }

        const namesArray = eval(match[1]);
        console.log(`Found ${namesArray.length} names to migrate`);

        // Check if collection already has data
        const existingCount = await Name.countDocuments();
        if (existingCount > 0) {
            console.log(`\nWarning: Database already contains ${existingCount} names.`);
            console.log('Do you want to:');
            console.log('1. Skip migration (keep existing data)');
            console.log('2. Clear existing data and import fresh');
            console.log('3. Add new names (may create duplicates)');

            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const answer = await new Promise((resolve) => {
                rl.question('Enter your choice (1-3): ', (ans) => {
                    rl.close();
                    resolve(ans);
                });
            });

            if (answer === '1') {
                console.log('Migration skipped. Existing data preserved.');
                process.exit(0);
            } else if (answer === '2') {
                console.log('Clearing existing data...');
                await Name.deleteMany({});
                console.log('Existing data cleared.');
            }
        }

        // Insert names in batches
        const batchSize = 100;
        let inserted = 0;

        for (let i = 0; i < namesArray.length; i += batchSize) {
            const batch = namesArray.slice(i, i + batchSize);
            await Name.insertMany(batch, { ordered: false });
            inserted += batch.length;
            console.log(`Migrated ${inserted}/${namesArray.length} names...`);
        }

        console.log('\n✅ Migration completed successfully!');
        console.log(`Total names in database: ${await Name.countDocuments()}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Run migration
migrateData();
