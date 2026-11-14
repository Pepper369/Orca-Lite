import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execPromise('python src/lib/integrations/bridge_screener.py');
    return NextResponse.json(JSON.parse(stdout));
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch quant data' }, { status: 500 });
  }
}
