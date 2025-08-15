const fs = require('fs');
const csv = require('csv-parser');

/**
 * @fileoverview Utility to verify the integrity of a downloaded CSV export.
 */

/**
 * @description Verifies an export file by checking its size and row count.
 * @param {string} filePath - The absolute path to the CSV file.
 * @param {number} minSizeBytes - The minimum file size in bytes.
 * @param {number} minRowCount - The minimum number of rows expected.
 * @returns {Promise<void>} - Resolves if valid, rejects if invalid.
 */
async function verifyExport(filePath, minSizeBytes = 1048576, minRowCount = 100000) {
    return new Promise((resolve, reject) => {
        // 1. Check file size
        const stats = fs.statSync(filePath);
        if (stats.size < minSizeBytes) {
            return reject(new Error(`Export file size is too small: ${stats.size} bytes. Minimum required: ${minSizeBytes} bytes.`));
        }

        // 2. Check row count
        let rowCount = 0;
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', () => {
                rowCount++;
            })
            .on('end', () => {
                if (rowCount < minRowCount) {
                    return reject(new Error(`Export file has too few rows: ${rowCount}. Minimum required: ${minRowCount}.`));
                }
                console.log(`Export file verified successfully. Size: ${stats.size} bytes, Rows: ${rowCount}`);
                resolve();
            })
            .on('error', (err) => {
                reject(new Error(`Error reading or parsing CSV file: ${err.message}`));
            });
    });
}

module.exports = { verifyExport };
