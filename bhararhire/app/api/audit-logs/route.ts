import { NextResponse } from 'next/server';

const API_BASE_URL = 'http://localhost:3001';

export async function GET() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/audit-logs`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error proxying audit-logs:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to read audit logs',
        error: error.message,
      },
      { status: 500 }
    );
  }
}