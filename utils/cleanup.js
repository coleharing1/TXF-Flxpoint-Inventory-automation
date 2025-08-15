const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { logger } = require('./logger');

class DataCleanup {
  constructor(options = {}) {
    this.exportRetentionDays = options.exportRetentionDays || 30;
    this.logRetentionDays = options.logRetentionDays || 7;
    this.snapshotRetentionDays = options.snapshotRetentionDays || 90;
    this.db = new sqlite3.Database(path.join(__dirname, '..', 'inventory.db'));
  }

  async cleanup() {
    logger.info('Starting data cleanup', {
      exportRetention: this.exportRetentionDays,
      logRetention: this.logRetentionDays,
      snapshotRetention: this.snapshotRetentionDays
    });

    const results = {
      exports: await this.cleanupExports(),
      logs: await this.cleanupLogs(),
      database: await this.cleanupDatabase(),
      snapshots: await this.cleanupSnapshots()
    };

    logger.info('Cleanup completed', results);
    return results;
  }

  async cleanupExports() {
    const exportsDir = path.join(__dirname, '..', 'exports');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.exportRetentionDays);

    let deleted = 0;
    let kept = 0;
    let totalSize = 0;

    try {
      const files = await fs.readdir(exportsDir);
      
      for (const file of files) {
        const filePath = path.join(exportsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          totalSize += stats.size;
          await fs.unlink(filePath);
          deleted++;
          logger.info(`Deleted old export: ${file}`);
        } else {
          kept++;
        }
      }
    } catch (error) {
      logger.error('Error cleaning exports', { error: error.message });
    }

    return { deleted, kept, freedSpace: totalSize };
  }

  async cleanupLogs() {
    const logsDir = path.join(__dirname, '..', 'logs');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.logRetentionDays);

    let deleted = 0;
    let totalSize = 0;

    try {
      const files = await fs.readdir(logsDir);
      
      for (const file of files) {
        // Skip current log files
        if (file.includes('current')) continue;
        
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          totalSize += stats.size;
          await fs.unlink(filePath);
          deleted++;
          logger.info(`Deleted old log: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Error cleaning logs', { error: error.message });
    }

    return { deleted, freedSpace: totalSize };
  }

  async cleanupDatabase() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.snapshotRetentionDays);
    const cutoffString = cutoffDate.toISOString().split('T')[0];

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Clean old daily changes
        this.db.run(
          'DELETE FROM daily_changes WHERE date < ?',
          [cutoffString],
          function(err) {
            if (err) {
              logger.error('Error cleaning daily_changes', { error: err });
              reject(err);
              return;
            }
            const dailyChangesDeleted = this.changes;

            // Clean old export logs
            this.db.run(
              'DELETE FROM export_logs WHERE timestamp < datetime(?, \'-\' || ? || \' days\')',
              [new Date().toISOString(), this.logRetentionDays],
              function(err) {
                if (err) {
                  logger.error('Error cleaning export_logs', { error: err });
                }
                const exportLogsDeleted = this.changes;

                // Clean old notifications
                this.db.run(
                  'DELETE FROM notifications WHERE timestamp < datetime(?, \'-30 days\')',
                  [new Date().toISOString()],
                  function(err) {
                    if (err) {
                      logger.error('Error cleaning notifications', { error: err });
                    }
                    const notificationsDeleted = this.changes;

                    // Vacuum database to reclaim space
                    this.db.run('VACUUM', (err) => {
                      if (err) {
                        logger.error('Error vacuuming database', { error: err });
                      }
                      
                      resolve({
                        dailyChangesDeleted,
                        exportLogsDeleted,
                        notificationsDeleted
                      });
                    });
                  }.bind(this)
                );
              }.bind(this)
            );
          }.bind(this)
        );
      });
    });
  }

  async cleanupSnapshots() {
    const snapshotsDir = path.join(__dirname, '..', 'inventory-data');
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.snapshotRetentionDays);

    let deleted = 0;
    let compressed = 0;
    let totalSaved = 0;

    try {
      const files = await fs.readdir(snapshotsDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(snapshotsDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete very old files
        if (stats.mtime < cutoffDate) {
          totalSaved += stats.size;
          await fs.unlink(filePath);
          deleted++;
          logger.info(`Deleted old snapshot: ${file}`);
        }
        // Compress files older than 7 days
        else if (stats.mtime < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
          const compressedPath = filePath + '.gz';
          
          // Check if already compressed
          try {
            await fs.access(compressedPath);
            continue; // Already compressed
          } catch {
            // Compress the file
            const zlib = require('zlib');
            const content = await fs.readFile(filePath);
            const compressed = await new Promise((resolve, reject) => {
              zlib.gzip(content, (err, result) => {
                if (err) reject(err);
                else resolve(result);
              });
            });
            
            await fs.writeFile(compressedPath, compressed);
            await fs.unlink(filePath);
            
            const savedSpace = stats.size - compressed.length;
            totalSaved += savedSpace;
            compressed++;
            logger.info(`Compressed snapshot: ${file} (saved ${savedSpace} bytes)`);
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning snapshots', { error: error.message });
    }

    return { deleted, compressed, savedSpace: totalSaved };
  }

  close() {
    this.db.close();
  }
}

// Run cleanup if called directly
if (require.main === module) {
  const cleanup = new DataCleanup({
    exportRetentionDays: parseInt(process.env.EXPORT_RETENTION_DAYS) || 30,
    logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS) || 7,
    snapshotRetentionDays: parseInt(process.env.SNAPSHOT_RETENTION_DAYS) || 90
  });

  cleanup.cleanup()
    .then(results => {
      console.log('✅ Cleanup completed:', results);
      cleanup.close();
    })
    .catch(error => {
      console.error('❌ Cleanup failed:', error);
      cleanup.close();
      process.exit(1);
    });
}

module.exports = DataCleanup;