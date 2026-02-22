import { query, closePool } from './postgres.js';
import { initializeStock, closeRedis } from '../services/redis.js';
import { config } from '../config/index.js';

async function seed() {
  console.log('Seeding database...');
  
  try {
    // Check if sale exists
    const existingSale = await query('SELECT id FROM flash_sale WHERE id = $1', [config.sale.defaultSaleId]);
    
    if (existingSale.rows.length === 0) {
      // Create a flash sale that's active for 24 hours
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
      
      const result = await query(
        `INSERT INTO flash_sale (name, start_time, end_time, total_stock)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, total_stock`,
        ['Flash Sale Event', startTime.toISOString(), endTime.toISOString(), 100]
      );
      
      console.log('Created flash sale:', result.rows[0]);
      
      // Initialize stock in Redis
      await initializeStock(result.rows[0].id, result.rows[0].total_stock);
      console.log('Initialized Redis stock');
    } else {
      console.log('Flash sale already exists, skipping seed');
      
      // Reinitialize Redis stock
      const sale = await query('SELECT total_stock FROM flash_sale WHERE id = $1', [config.sale.defaultSaleId]);
      const orderCount = await query(
        'SELECT COUNT(*) as count FROM orders WHERE sale_id = $1 AND status = $2',
        [config.sale.defaultSaleId, 'SUCCESS']
      );
      
      const remainingStock = sale.rows[0].total_stock - parseInt(orderCount.rows[0].count, 10);
      await initializeStock(config.sale.defaultSaleId, remainingStock);
      console.log(`Initialized Redis stock: ${remainingStock}`);
    }
    
    console.log('Seeding complete!');
    
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  } finally {
    await closePool();
    await closeRedis();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
