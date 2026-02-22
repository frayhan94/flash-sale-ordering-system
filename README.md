# High-Concurrency Flash Sale Platform
A production-ready flash sale platform that handles high-concurrency scenarios using Redis for atomic stock management and PostgreSQL for persistent order storage. Demonstrates zero-overselling architecture capable of processing 1000+ concurrent purchase requests.

# Where is the diagram ?
Please see the diagram under diagram folder

# Brief explanation of design choice

**Redis Cluster (AWS ElastiCache)**: 
Acts as high-performance middleware handling atomic stock operations. Processes 1000+ concurrent requests with sub-millisecond latency, preventing race conditions through atomic DECR operations.
This approach solves the stock decrement if we do from database side. From database will cause the heavy load, imagine 1000 request come and it
queues for updating the stock to database and this is high I/O operation

**PostgreSQL (AWS RDS)**: Serves as the persistent data store and single source of truth. Maintains complete order history and enables stock reconstruction if Redis data is lost.

**Auto-Scaling (AWS Fargate)**: Provides automatic horizontal scaling during traffic spikes, ensuring consistent performance without manual intervention.

**Failure Recovery**
 Redis cluster ensures high availability, while database queries can reconstruct stock state (initial_stock - order_count) for disaster recovery.

# Tradeoff

The tradeoff using above infrastructure is we might face inconsistency data stock from redis to database. let say in redis shows 90 stock while in database
shows 93 . we can solve it by  reconciliation process. sync stock from database into redis. Why this can happen because for example a user already did the purchase
but in the API endpoint we by pass that check (the redis key for user purchase is gone). 
in redis it will decrement but in database it will reject as we add unique for sales id and user id (the order is not saved)
thats why we need as well the reconciliation for user purchased item

# Flow to make purchase
1. User enter the user id
2. System check if sales active or not from postgreSQL. If no sales then user can not continue. If yes then user can continue
3. System check if user has made purchased or not from redis. If yes then user can not continue. If no the can continue
4. System decrement the stock from redis. If new stock after decrement >=0 user can go to next step.
   If <0 then system will increment it back so it will be  0 indicate the product is sold
5. User purchase save into database and mark it as Purchase under redis

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- k6 (for stress testing) - Install: `brew install k6`

### Run with Docker (Recommended). It will start backend and frontend

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Access:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:3000
# - Health check: http://localhost:3000/health
```

### Stress Test with k6

```bash
# Ensure backend is running. You can do update on sales time, or update stock

# Update sales time:
curl -X PUT http://localhost:3000/sale/1/times -H "Content-Type: application/json" -d '{"startTime": "2026-02-22T03:00:00Z", "endTime": "2026-02-24T23:59:59Z"}'

# Update Stock:
curl -X POST http://localhost:3000/sale/reset \
  -H "Content-Type: application/json" \
  -d '{"stock": 100}'
  
# Check sales status:
curl http://localhost:3000/sale/status

# Full load test (1000 users, 100 items)
k6 run stress-test/load-test.js

# Custom stock
k6 run -e STOCK=50 stress-test/load-test.js
```

#### Expected Stress Test Results

For `stock = 100`:
- **SUCCESS**: Exactly 100
- **SOLD_OUT**: Remaining requests
- **No overselling**: Guaranteed

Example output:
```
=== RESULTS ===
Successful purchases: 100
Expected: 100
✅ PASS: Exactly 100 items sold, no overselling!
```

## Project Structure

```
flash-sale-system/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── db/              # Database (Postgres)
│   │   ├── routes/          # API routes
│   │   ├── schemas/         # Zod validation
│   │   ├── services/        # Business logic
│   │   │   ├── redis.js     # Redis operations
│   │   │   ├── sale.js      # Sale service
│   │   │   └── purchase.js  # Purchase logic
│   │   └── index.js         # Entry point
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main React component
│   │   ├── api.js           # API client
│   │   └── main.jsx         # Entry point
│   └── Dockerfile
├── stress-test/
│   ├── load-test.js         # Full k6 load test
│   └── simple-test.js       # Simple concurrency test
├── docker-compose.yml
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Backend port |
| DATABASE_URL | postgres://... | PostgreSQL connection |
| REDIS_URL | redis://localhost:6379 | Redis connection |
| VITE_API_URL | http://localhost:3000 | API URL for frontend |

## Scaling Considerations
For database connection we might need PgBouncer for streamlining the connection as we will use AWS Fargate on the production as i state in the diagram (flash-sale-ordering-system.png)

## License
MIT
