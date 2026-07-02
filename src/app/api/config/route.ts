import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const configPath = join(process.cwd(), 'local-config.json');

export async function GET() {
  try {
    const data = await readFile(configPath, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (error) {
    console.error('Error reading config:', error);
    return NextResponse.json({ uploadPath: 'D:\\Google Drive\\TradeJournal_Photos' });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.uploadPath) {
      await writeFile(configPath, JSON.stringify({ uploadPath: body.uploadPath }, null, 2), 'utf8');
      return NextResponse.json({ success: true, uploadPath: body.uploadPath });
    }
    return NextResponse.json({ error: 'Missing uploadPath' }, { status: 400 });
  } catch (error: any) {
    console.error('Error writing config:', error);
    return NextResponse.json({ error: error.message || 'Failed to update config' }, { status: 500 });
  }
}
