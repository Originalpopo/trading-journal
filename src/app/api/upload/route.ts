import { NextResponse } from 'next/server';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Use original filename (only remove slashes to prevent directory traversal)
    const filename = file.name.replace(/[\/\\]/g, '');
    
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
    
    await mkdir(uploadsDir, { recursive: true });
    
    // Write file to the directory
    const filePath = join(uploadsDir, filename);
    await writeFile(filePath, buffer);
    
    // Return a URL that points to our local image server API
    const fileUrl = `/api/images/${filename}`;

    return NextResponse.json({
      success: true,
      url: fileUrl,
    });
  } catch (error: any) {
    console.error('Local upload error:', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
