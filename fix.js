const fs = require('fs');

function fixPageTsx() {
  const p = 'D:/GitHub/trading-journal/src/app/page.tsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/formatNumber\(ctx\.fillText\((val0|val1|lastVal)\), (pos0|pos1|position)\.x(, | - 10, )(pos0|pos1|position)\.y( - offset0| - offset1)?\);/g, 'ctx.fillText(formatNumber($1), $2.x$3$4.y$5);');
  c = c.replace(/\(\(data\.winRate \* formatNumber\(100\)\)\)/g, 'formatNumber(data.winRate * 100)');
  c = c.replace(/\(\(data\.net \/ data\.totalFunded\) \* formatNumber\(100\)\)/g, 'formatNumber((data.net / data.totalFunded) * 100)');
  c = c.replace(/\(\(data\.net \/ formatNumber\(data\.totalTrades\)\)\)/g, 'formatNumber(data.net / data.totalTrades)');
  c = c.replace(/\(\(data\.net \/ formatNumber\(data\.totalTrades\) \/ data\.stdDev\)\)/g, 'formatNumber((data.net / data.totalTrades) / data.stdDev)');
  fs.writeFileSync(p, c);
}

function fixPerfTsx() {
  const p = 'D:/GitHub/trading-journal/src/app/performance/page.tsx';
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace(/\(\(onPlanWins \/ \(onPlanWins \+ onPlanLosses\)\) \* formatNumber\(100\)\)/g, 'formatNumber((onPlanWins / (onPlanWins + onPlanLosses)) * 100)');
  c = c.replace(/\(\(offPlanWins \/ \(offPlanWins \+ offPlanLosses\)\) \* formatNumber\(100\)\)/g, 'formatNumber((offPlanWins / (offPlanWins + offPlanLosses)) * 100)');
  c = c.replace(/formatNumber\(ctx\.fillText\((val0|val1|lastVal)\), (pos0|pos1|position)\.x(, | - 10, )(pos0|pos1|position)\.y( - offset0| - offset1)?\);/g, 'ctx.fillText(formatNumber($1), $2.x$3$4.y$5);');
  c = c.replace(/\(b\.win \/ \(b\.win \+ b\.loss\) \* formatNumber\(100\)\)/g, 'formatNumber(b.win / (b.win + b.loss) * 100)');
  c = c.replace(/\(s\.win \/ \(s\.win \+ s\.loss\) \* formatNumber\(100\)\)/g, 'formatNumber(s.win / (s.win + s.loss) * 100)');
  fs.writeFileSync(p, c);
}

fixPageTsx();
fixPerfTsx();
console.log('Fixed');
