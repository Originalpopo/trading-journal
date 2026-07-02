import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

// This API route serves images stored outside the Next.js public directory
export async function GET(
  req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    // Await the params object in Next.js 15+ App Router
    const resolvedParams = await params;
    const filename = resolvedParams.filename;
    
    // Prevent directory traversal attacks
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return new NextResponse('Invalid filename', { status: 400 });
    }

    // Read upload path from config
    let uploadsDir = 'D:\\Google Drive\\TradeJournal_Photos';
    try {
      const configPath = join(process.cwd(), 'local-config.json');
      const configData = await readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      if (config.uploadPath) {
        uploadsDir = config.uploadPath;
      }
    } catch (e) {
      console.warn('Could not read local-config.json, using default path.');
    }

    const filePath = join(uploadsDir, filename);

    if (!existsSync(filePath)) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const fileBuffer = await readFile(filePath);
    
    // Guess mime type based on extension
    const ext = filename.split('.').pop()?.toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'svg') mimeType = 'image/svg+xml';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
