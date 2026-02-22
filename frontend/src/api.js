const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getSaleStatus() {
  const response = await fetch(`${API_URL}/sale/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch sale status');
  }
  return response.json();
}

export async function purchase(userId) {
  const response = await fetch(`${API_URL}/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  });
  return response.json();
}

export async function checkPurchase(userId) {
  const response = await fetch(`${API_URL}/purchase/${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error('Failed to check purchase status');
  }
  return response.json();
}

export async function getSaleStats() {
  const response = await fetch(`${API_URL}/sale/stats`);
  if (!response.ok) {
    throw new Error('Failed to fetch sale stats');
  }
  return response.json();
}

export async function resetSale(stock) {
  const response = await fetch(`${API_URL}/sale/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stock }),
  });
  return response.json();
}
