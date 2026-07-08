"use client";
import React, { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi } from "lightweight-charts";
import { Trade, useJournalStore } from "@/store/useJournalStore";
import { Loader2, AlertCircle } from "lucide-react";

interface InteractiveChartProps {
  trade: Trade;
}

const TF_SEQUENCE = ['1s', '5s', '15s', '1m', '5m', '15m', '1h'];

const mapTimeframe = (tf?: string) => {
  if (!tf || tf === 'none') return '15min'; // default
  if (tf.includes('s')) return '1min'; // fallback seconds to 1m
  const tfMap: Record<string, string> = {
    '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '45m': '45min',
    '1h': '1h', '2h': '2h', '4h': '4h', '1H': '1h', '2H': '2h', '4H': '4h',
    '1d': '1day', '1D': '1day', '1w': '1week', '1W': '1week', '1M': '1month'
  };
  return tfMap[tf] || '15min';
};

export default function InteractiveChart({ trade }: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const updateTrade = useJournalStore((state) => state.updateTrade);

  // Normalize trade.tf
  let baseTf = '15m';
  if (trade.tf) {
     const tL = trade.tf.toLowerCase();
     if (tL === '1h') baseTf = '1h';
     else if (tL === '1m') baseTf = '1m';
     else if (tL === '5m') baseTf = '5m';
     else if (tL === '15m') baseTf = '15m';
     else if (tL === '1s') baseTf = '1s';
     else if (tL === '5s') baseTf = '5s';
     else if (tL === '15s') baseTf = '15s';
     else if (tL.includes('s')) baseTf = '1m'; // fallback seconds -> 1m
     else baseTf = trade.tf; 
  }

  const [selectedTf, setSelectedTf] = useState<string>(baseTf.includes('s') ? '1m' : baseTf);

  const [localCache, setLocalCache] = useState<any>(() => {
    let initialCache = trade.chartData;
    if (Array.isArray(initialCache)) {
      return { [baseTf]: initialCache };
    }
    return initialCache || {};
  });

  useEffect(() => {
    if (trade.chartData) {
      setLocalCache((prev: any) => {
        let incoming = trade.chartData;
        if (Array.isArray(incoming)) {
          incoming = { [baseTf]: incoming };
        }
        return { ...prev, ...incoming };
      });
    }
  }, [trade.chartData, baseTf]);


  const availableTfs = React.useMemo(() => {
    const idx = TF_SEQUENCE.indexOf(baseTf);
    let tfs = [];
    if (idx !== -1) {
      if (idx > 0) tfs.push(TF_SEQUENCE[idx - 1]);
      tfs.push(TF_SEQUENCE[idx]);
      if (idx < TF_SEQUENCE.length - 1) tfs.push(TF_SEQUENCE[idx + 1]);
    } else {
      tfs = [baseTf];
    }
    
    // Filter out seconds (since we can't fetch < 1m data)
    tfs = tfs.filter(t => !t.includes('s'));
    
    // If empty (e.g. baseTf was 1s, 5s), default to 1m
    if (tfs.length === 0) tfs = ['1m'];
    
    return tfs;
  }, [baseTf]);

  const loadChartData = async (tfToLoad: string, forceFetch = false) => {
    if (!trade.symbol || !trade.time) {
      setError("Missing symbol or entry time.");
      return;
    }

    setLoading(true);
    setError(null);

    let chartDataCache = localCache;

    let chartData = chartDataCache[tfToLoad];

    if (forceFetch || !chartData || chartData.length === 0) {
      try {
        const entryTime = new Date(trade.time.replace(' ', 'T'));
        let exitTime = entryTime;
        if (trade.exitTime) {
          exitTime = new Date(trade.exitTime.replace(' ', 'T'));
        } else {
          exitTime = new Date(entryTime.getTime() + 4 * 60 * 60 * 1000); // +4H fallback
        }

        if (isNaN(entryTime.getTime())) throw new Error("Invalid entry time format");
        
        const interval = mapTimeframe(tfToLoad);
        
        const intervalMsMap: Record<string, number> = {
          '1min': 60 * 1000,
          '5min': 5 * 60 * 1000,
          '15min': 15 * 60 * 1000,
          '30min': 30 * 60 * 1000,
          '45min': 45 * 60 * 1000,
          '1h': 60 * 60 * 1000,
          '2h': 2 * 60 * 60 * 1000,
          '4h': 4 * 60 * 60 * 1000,
          '1day': 24 * 60 * 60 * 1000,
          '1week': 7 * 24 * 60 * 60 * 1000,
          '1month': 30 * 24 * 60 * 60 * 1000
        };
        const intervalMs = intervalMsMap[interval] || 15 * 60 * 1000;
        
        // Dynamic padding: 20 candles before and after
        const paddingMs = 20 * intervalMs;
        const end = new Date(exitTime.getTime() + paddingMs);
        const y = end.getFullYear();
        const m = String(end.getMonth() + 1).padStart(2, '0');
        const d = String(end.getDate()).padStart(2, '0');
        const h = String(end.getHours()).padStart(2, '0');
        const min = String(end.getMinutes()).padStart(2, '0');
        const s = String(end.getSeconds()).padStart(2, '0');
        const endStr = `${y}-${m}-${d} ${h}:${min}:${s}`;

        // Calculate exact outputsize needed (20 + candles in trade + 20)
        const durationMs = Math.max(0, exitTime.getTime() - entryTime.getTime());
        const candlesDuringTrade = Math.ceil(durationMs / intervalMs);
        const outputSize = Math.min(5000, 20 + candlesDuringTrade + 20);

        const apiKey = process.env.NEXT_PUBLIC_TWELVEDATA_API_KEY;
        if (!apiKey) throw new Error("API key not configured (NEXT_PUBLIC_TWELVEDATA_API_KEY)");

        let rawSymbol = trade.symbol ? trade.symbol.trim().toUpperCase() : "";
        let formattedSymbol = rawSymbol;
        if (rawSymbol.length === 6 && !rawSymbol.includes('/')) {
          formattedSymbol = rawSymbol.substring(0, 3) + '/' + rawSymbol.substring(3);
        }

        const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(formattedSymbol)}&interval=${interval}&end_date=${encodeURIComponent(endStr)}&outputsize=${outputSize}&timezone=${userTz}&apikey=${apiKey}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.status === 'error') throw new Error(json.message || "Failed to fetch data");
        
        let fetchedChartData = [];
        if (json.values && Array.isArray(json.values)) {
          fetchedChartData = json.values.map((v: any) => ({
            time: new Date(v.datetime).getTime() / 1000,
            open: parseFloat(v.open),
            high: parseFloat(v.high),
            low: parseFloat(v.low),
            close: parseFloat(v.close),
          })).reverse();
        }
        
        chartData = fetchedChartData;
        if (chartData.length === 0) throw new Error("No data returned for this period.");

        // Save back to DB
        const newCache = { ...chartDataCache, [tfToLoad]: chartData };
        setLocalCache(newCache);
        await updateTrade(trade.id, { chartData: newCache });

      } catch (err: any) {
        setError(err.message);
        setLoading(false);
        return;
      }
    }

    // Render Chart
    if (chartData && chartData.length > 0 && chartContainerRef.current) {
      if (chartRef.current) {
        chartRef.current.remove();
      }
      
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { color: 'transparent' }, textColor: '#78716c' },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        timeScale: { timeVisible: true, secondsVisible: false, borderVisible: false },
        rightPriceScale: { borderVisible: false },
      });
      chartRef.current = chart;

      // 1. Draw Background AreaSeries for Position Tool first so they stay behind candles
      if (trade.entryPrice && trade.time) {
        const time = new Date(trade.time.replace(' ', 'T')).getTime() / 1000;
        const exitT = trade.exitTime ? new Date(trade.exitTime.replace(' ', 'T')).getTime() / 1000 : chartData[chartData.length - 1].time;
        let areaData = chartData.filter((c: any) => c.time >= time && c.time <= exitT);
        if (areaData.length === 0) {
           const closest = chartData.find((c: any) => c.time >= time);
           if (closest) areaData = [closest];
        }
        if (areaData.length === 1) {
           const idx = chartData.indexOf(areaData[0]);
           if (idx >= 0 && idx < chartData.length - 1) areaData.push(chartData[idx + 1]);
           else if (idx > 0) areaData.unshift(chartData[idx - 1]);
        }

        if (areaData.length > 1) {
          let tpP = trade.entryPrice;
          let slP = trade.entryPrice;

          if (trade.side === 'BUY' || trade.side === 'LONG') {
            const isWin = trade.exitPrice && trade.exitPrice > trade.entryPrice;
            const isLoss = trade.exitPrice && trade.exitPrice < trade.entryPrice;

            if (isLoss) {
              slP = trade.exitPrice as number;
              const riskSize = trade.entryPrice - slP;
              if (trade.tpPrice && trade.tpPrice > trade.entryPrice) {
                tpP = trade.tpPrice;
              } else {
                tpP = trade.entryPrice + (5 * riskSize);
              }
            } else if (isWin) {
              tpP = trade.exitPrice as number;
              const rewardSize = tpP - trade.entryPrice;
              if (trade.slPrice && trade.slPrice < trade.entryPrice) {
                slP = trade.slPrice;
              } else {
                if (trade.rr && trade.rr > 0) {
                  slP = trade.entryPrice - (rewardSize / trade.rr);
                } else {
                  slP = trade.entryPrice - (rewardSize / 5);
                }
              }
            } else {
              tpP = trade.tpPrice || trade.entryPrice * 1.002;
              slP = trade.slPrice || trade.entryPrice * 0.999;
            }
          } else { // SHORT
            const isWin = trade.exitPrice && trade.exitPrice < trade.entryPrice;
            const isLoss = trade.exitPrice && trade.exitPrice > trade.entryPrice;

            if (isLoss) {
              slP = trade.exitPrice as number;
              const riskSize = slP - trade.entryPrice;
              if (trade.tpPrice && trade.tpPrice < trade.entryPrice) {
                tpP = trade.tpPrice;
              } else {
                tpP = trade.entryPrice - (5 * riskSize);
              }
            } else if (isWin) {
              tpP = trade.exitPrice as number;
              const rewardSize = trade.entryPrice - tpP;
              if (trade.slPrice && trade.slPrice > trade.entryPrice) {
                slP = trade.slPrice;
              } else {
                if (trade.rr && trade.rr > 0) {
                  slP = trade.entryPrice + (rewardSize / trade.rr);
                } else {
                  slP = trade.entryPrice + (rewardSize / 5);
                }
              }
            } else {
              tpP = trade.tpPrice || trade.entryPrice * 0.998;
              slP = trade.slPrice || trade.entryPrice * 1.001;
            }
          }

          // Reward Box
          const rewardSeries = chart.addBaselineSeries({
            baseValue: { type: 'price', price: trade.entryPrice },
            topFillColor1: 'rgba(226, 232, 240, 0.4)',
            topFillColor2: 'rgba(226, 232, 240, 0.4)',
            topLineColor: 'rgba(203, 213, 225, 0.5)',
            bottomFillColor1: 'rgba(226, 232, 240, 0.4)',
            bottomFillColor2: 'rgba(226, 232, 240, 0.4)',
            bottomLineColor: 'rgba(203, 213, 225, 0.5)',
            lineWidth: 1,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          rewardSeries.setData(areaData.map((c: any) => ({ time: c.time, value: tpP })));

          // Risk Box
          const riskSeries = chart.addBaselineSeries({
            baseValue: { type: 'price', price: trade.entryPrice },
            topFillColor1: 'rgba(254, 202, 202, 0.3)',
            topFillColor2: 'rgba(254, 202, 202, 0.3)',
            topLineColor: 'rgba(252, 165, 165, 0.5)',
            bottomFillColor1: 'rgba(254, 202, 202, 0.3)',
            bottomFillColor2: 'rgba(254, 202, 202, 0.3)',
            bottomLineColor: 'rgba(252, 165, 165, 0.5)',
            lineWidth: 1,
            crosshairMarkerVisible: false,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          riskSeries.setData(areaData.map((c: any) => ({ time: c.time, value: slP })));
        }
      }

      // 2. Draw Candlesticks on top
      const series = chart.addCandlestickSeries({
        upColor: '#e2e8f0', 
        downColor: '#1e293b', 
        borderVisible: true, 
        borderColor: '#1e293b',
        wickUpColor: '#1e293b', 
        wickDownColor: '#1e293b',
        borderUpColor: '#1e293b',
        borderDownColor: '#1e293b',
        priceLineVisible: false
      });
      seriesRef.current = series;
      series.setData(chartData);
      
      const markers: any[] = [];
      if (trade.entryPrice && trade.time) {
        const time = new Date(trade.time.replace(' ', 'T')).getTime() / 1000;
        markers.push({ time, position: (trade.side === 'BUY' || trade.side === 'LONG') ? 'belowBar' : 'aboveBar', color: '#000000', shape: 'arrowUp', text: 'Entry' });
      }

      if (trade.exitPrice && trade.exitTime) {
        const time = new Date(trade.exitTime.replace(' ', 'T')).getTime() / 1000;
        const isWin = (trade.side === 'BUY' || trade.side === 'LONG') ? trade.exitPrice > (trade.entryPrice || 0) : trade.exitPrice < (trade.entryPrice || 0);
        markers.push({ time, position: (trade.side === 'BUY' || trade.side === 'LONG') ? 'aboveBar' : 'belowBar', color: isWin ? '#fb923c' : '#7f1d1d', shape: 'arrowDown', text: 'Exit' });
      }
      

      
      if (markers.length > 0) {
        markers.sort((a, b) => a.time - b.time);
        series.setMarkers(markers);
      }

      chart.timeScale().fitContent();
    }
    setLoading(false);
  };

  useEffect(() => {
    loadChartData(selectedTf, false);
    
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id, trade.time, trade.exitTime, selectedTf]);
  
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRefresh = () => {
    loadChartData(selectedTf, true);
  };

  if (error) {
    return (
      <div className="h-[400px] bg-transparent flex flex-col items-center justify-center text-stone-500 p-4 text-center relative">
         <div className="absolute top-4 left-4 flex items-center gap-1 bg-white/50 p-1 rounded-lg z-10">
          <button 
            onClick={handleRefresh}
            className="p-1.5 hover:bg-white rounded-md text-stone-400 hover:text-stone-700 transition"
            title="Refetch Chart Data"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
        </div>
        <AlertCircle className="w-8 h-8 mb-2 text-red-400" />
        <p className="text-sm font-bold text-stone-700">{error}</p>
        <p className="text-xs mt-1">Please check your API key, symbol, and dates.</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[400px] bg-transparent">
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
        <button 
          onClick={handleRefresh}
          className="bg-stone-100/80 hover:bg-stone-200/80 backdrop-blur-sm p-1.5 rounded-lg border border-stone-200/50 text-stone-500 hover:text-stone-700 transition flex items-center justify-center"
          title="Refetch Chart Data"
        >
           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>

        <div className="flex items-center p-0.5 bg-stone-100/80 backdrop-blur-sm rounded-lg border border-stone-200/50">
          {availableTfs.map(tf => (
            <button
              key={tf}
              onClick={() => setSelectedTf(tf)}
              className={`px-3 py-1 text-[11px] font-black rounded-md transition ${
                selectedTf === tf 
                  ? 'bg-orange-400 text-white shadow-sm' 
                  : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/50'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-stone-50/50 z-20 flex items-center justify-center backdrop-blur-[1px]">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
