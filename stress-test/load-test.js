import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const successfulPurchases = new Counter('successful_purchases');
const soldOutResponses = new Counter('sold_out_responses');
const alreadyPurchasedResponses = new Counter('already_purchased_responses');
const errorResponses = new Counter('error_responses');
const purchaseSuccessRate = new Rate('purchase_success_rate');
const purchaseDuration = new Trend('purchase_duration');

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const STOCK = parseInt(__ENV.STOCK) || 100;

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Ramp up to 100 users
        { duration: '20s', target: 200 },  // Ramp up to 200 users
        { duration: '30s', target: 250 },  // Peak at 250 users
        { duration: '10s', target: 100 },  // Scale down
        { duration: '5s', target: 0 },     // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be < 2s
    http_req_failed: ['rate<0.1'],     // Error rate should be < 10%
  },
};

export function setup() {
  console.log(`Testing against: ${BASE_URL}`);
  console.log(`Expected stock: ${STOCK}`);
  
  // Reset sale before test
  const resetRes = http.post(`${BASE_URL}/sale/reset`, JSON.stringify({ stock: STOCK }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (resetRes.status !== 200) {
    console.error('Failed to reset sale:', resetRes.body);
  } else {
    console.log(`Sale reset with ${STOCK} items`);
  }
  
  // Get initial status
  const statusRes = http.get(`${BASE_URL}/sale/status`);
  console.log('Initial status:', statusRes.body);
  
  return { startTime: Date.now() };
}

export default function (data) {
  // Generate unique user ID per VU iteration
  const userId = `k6-user-${__VU}-${__ITER}-${Date.now()}`;
  
  // Make purchase request
  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/purchase`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'purchase' },
  });
  const duration = Date.now() - startTime;
  
  purchaseDuration.add(duration);
  
  // Parse response
  let result;
  try {
    result = JSON.parse(res.body);
  } catch (e) {
    errorResponses.add(1);
    purchaseSuccessRate.add(false);
    return;
  }
  
  // Track results
  switch (result.result) {
    case 'SUCCESS':
      successfulPurchases.add(1);
      purchaseSuccessRate.add(true);
      break;
    case 'SOLD_OUT':
      soldOutResponses.add(1);
      purchaseSuccessRate.add(false);
      break;
    case 'ALREADY_PURCHASED':
      alreadyPurchasedResponses.add(1);
      purchaseSuccessRate.add(false);
      break;
    case 'SALE_NOT_ACTIVE':
      // Expected if sale not running
      purchaseSuccessRate.add(false);
      break;
    default:
      errorResponses.add(1);
      purchaseSuccessRate.add(false);
  }
  
  // Validate response
  check(res, {
    'status is valid': (r) => [200, 403, 409, 410].includes(r.status),
    'response has result': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result !== undefined;
      } catch (e) {
        return false;
      }
    },
  });
  
  // Small random sleep to simulate real users
  sleep(Math.random() * 0.1);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n========== TEST SUMMARY ==========`);
  console.log(`Duration: ${duration.toFixed(2)}s`);
  sleep(2);
  // Get final stats
  const statsRes = http.get(`${BASE_URL}/sale/stats`);
  try {
    const stats = JSON.parse(statsRes.body);
    console.log(`\nSale Stats:`);
    console.log(`  - Total Stock: ${stats.sale.totalStock}`);
    console.log(`  - Remaining Stock: ${stats.sale.remainingStock}`);
    console.log(`  - Successful Orders: ${stats.purchases.successCount}`);
    console.log(`  - Failed Orders: ${stats.purchases.failedCount}`);
    
    // Validate no overselling
    if (stats.purchases.successCount > stats.sale.totalStock) {
      console.error(`\n❌ OVERSELLING DETECTED!`);
      console.error(`   Sold ${stats.purchases.successCount} items but only had ${stats.sale.totalStock} in stock`);
    } else if (stats.purchases.successCount === stats.sale.totalStock && stats.sale.remainingStock === 0) {
      console.log(`\n✅ PERFECT! All ${stats.sale.totalStock} items sold, no overselling.`);
    } else {
      console.log(`\n✅ No overselling detected.`);
    }
  } catch (e) {
    console.error('Failed to get final stats:', e);
  }
  
  console.log(`==================================\n`);
}
