const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

const targetDir = path.join(__dirname, 'src');

walk(targetDir, (filePath) => {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  if (filePath.includes('utils.ts')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // We need to match X.toLocaleString(...)
  // regex to find things like: variable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // and math expressions like: (a / b).toLocaleString(...)
  // This can be tricky with simple regex if there are nested parentheses.
  // Let's use a simpler approach: replace .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // and .toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})
  // wait, we can just replace the string ".toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })" 
  // But we want formatNumber(X) instead of X.formatNumber(). X is before the dot.
  
  // Since we know the codebase, let's look at the usages.
  const regex = /([\w\.\(\)]+)\.toLocaleString\('en-US',\s*\{\s*minimumFractionDigits:\s*2,\s*maximumFractionDigits:\s*2\s*\}\)/g;
  
  // A safer regex for the prefix:
  // We can just use string replacements if we know the exact strings, but there are many like data.net, report.netProfit, etc.
  
  content = content.replace(/([a-zA-Z0-9_.\(\)]+(?:\[.*?\])?(?:\s*\/\s*[a-zA-Z0-9_.\(\)]+)?)\.toLocaleString\('en-US',\s*\{\s*minimumFractionDigits:\s*2,\s*maximumFractionDigits:\s*2\s*\}\)/g, 'formatNumber($1)');
  content = content.replace(/([a-zA-Z0-9_.\(\)]+(?:\[.*?\])?(?:\s*\/\s*[a-zA-Z0-9_.\(\)]+)?)\.toLocaleString\('en-US',\s*\{minimumFractionDigits:\s*2,\s*maximumFractionDigits:\s*2\}\)/g, 'formatNumber($1)');
  
  // Replace .toFixed(1) with formatNumber
  content = content.replace(/([a-zA-Z0-9_.\(\)]+)\.toFixed\(1\)/g, 'formatNumber($1)');

  if (content !== originalContent) {
    if (!content.includes('formatNumber(')) {
       // Just in case
    } else {
       if (!content.includes('import { formatNumber }')) {
         // insert import at the top
         const lines = content.split('\n');
         let lastImportIndex = -1;
         for (let i=0; i<lines.length; i++) {
           if (lines[i].startsWith('import ')) {
             lastImportIndex = i;
           }
         }
         if (lastImportIndex !== -1) {
           lines.splice(lastImportIndex + 1, 0, 'import { formatNumber } from "@/lib/utils";');
         } else {
           lines.unshift('import { formatNumber } from "@/lib/utils";');
         }
         content = lines.join('\n');
       }
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated', filePath);
  }
});
