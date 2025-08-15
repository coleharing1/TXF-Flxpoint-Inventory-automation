const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;

async function runMigrations() {
  const db = new sqlite3.Database(path.join(__dirname, '..', 'inventory.db'));
  
  console.log('Running database migrations...');
  
  // Read migration SQL
  const migrationSQL = await fs.readFile(
    path.join(__dirname, '..', 'migrations', '001-add-indexes.sql'),
    'utf8'
  );
  
  // Split by semicolon and run each statement
  const statements = migrationSQL
    .split(';')
    .filter(stmt => stmt.trim())
    .map(stmt => stmt.trim() + ';');
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      statements.forEach(statement => {
        db.run(statement, (err) => {
          if (err) {
            console.error('Migration error:', err);
          } else {
            console.log('✓ Executed:', statement.substring(0, 50) + '...');
          }
        });
      });
      
      db.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('✅ Migrations completed');
          resolve();
        }
      });
    });
  });
}

if (require.main === module) {
  runMigrations().catch(console.error);
}

module.exports = runMigrations;