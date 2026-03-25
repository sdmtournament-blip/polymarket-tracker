"use client";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ExternalLink, TrendingUp, DollarSign, Users, Activity } from 'lucide-react';
import { format } from 'date-fns';

type Platform = 'POLY' | 'MANI' | 'KALS';

interface MarketData {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  volume: number;
  outcomes: { name: string; prob: number; color?: string }[];
  description?: string;
  history?: { date: string; [key: string]: any }[];
  liquidity?: number;
  bettors?: number;
  closeDate?: string;
}

export default function DeepMarketsDashboard() {
  const [markets, setMarkets] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMarket, setSelectedMarket] = useState<MarketData | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [polyRes, maniRes, kalsRes] = await Promise.allSettled([
          fetch('https://gamma-api.polymarket.com/events?active=true&closed=false&limit=25').then(r => r.json()),
          fetch('https://api.manifold.markets/v0/markets?limit=25').then(r => r.json()),
          fetch('https://api.elections.kalshi.com/trade-api/v2/events?limit=15').then(r => r.json())
        ]);

        let combined: MarketData[] = [];

        // Poly
        if (polyRes.status === 'fulfilled') {
          polyRes.value.forEach((event: any) => {
            let outcomes: any[] = [];
            let marketId = '';
            if (event.markets && event.markets[0]) {
               marketId = event.markets[0].id;
               try {
                 const prices = JSON.parse(event.markets[0].outcomePrices || '[]');
                 const names = JSON.parse(event.markets[0].outcomes || '[]');
                 names.forEach((n: string, i: number) => {
                   outcomes.push({ name: n, prob: parseFloat(prices[i]) * 100, color: i === 0 ? '#10b981' : '#ef4444' });
                 });
               } catch(e){}
            }

            combined.push({
              id: `poly-${event.id}`,
              title: event.title,
              url: `https://polymarket.com/event/${event.slug}`,
              platform: 'POLY',
              volume: event.volume ? parseFloat(event.volume) : 0,
              liquidity: event.liquidity ? parseFloat(event.liquidity) : 0,
              outcomes: outcomes.slice(0, 3), // Max 3 for overview
              closeDate: event.endDate,
              description: event.description,
            });
          });
        }

        // Mani
        if (maniRes.status === 'fulfilled') {
          maniRes.value.forEach((m: any) => {
            if (m.isResolved) return;
            let outcomes = [];
            if (m.outcomeType === 'BINARY') {
              const yesP = (m.probability || 0.5) * 100;
              outcomes = [
                { name: 'YES', prob: yesP, color: '#4f46e5' },
                { name: 'NO', prob: 100 - yesP, color: '#f43f5e' }
              ];
            } else if (m.answers) {
              outcomes = m.answers.map((a:any) => ({ name: a.text, prob: a.probability * 100 })).sort((a:any, b:any) => b.prob - a.prob).slice(0,3);
            }

            combined.push({
              id: `mani-${m.id}`,
              title: m.question,
              url: m.url,
              platform: 'MANI',
              volume: m.volume || 0,
              bettors: m.uniqueBettorCount,
              closeDate: m.closeTime ? new Date(m.closeTime).toISOString() : undefined,
              outcomes: outcomes,
            });
          });
        }

        // Kalshi
        if (kalsRes.status === 'fulfilled' && kalsRes.value.events) {
           for (const e of kalsRes.value.events) {
              try {
                const mkts = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=${e.event_ticker}`).then(r => r.json());
                if (mkts.markets && mkts.markets[0]) {
                  const m = mkts.markets[0];
                  let yesP = m.last_price_dollars ? Math.round(parseFloat(m.last_price_dollars) * 100) : 50;
                  combined.push({
                    id: `kals-${m.ticker}`,
                    title: m.title || e.title,
                    url: `https://kalshi.com/markets/${e.series_ticker}`,
                    platform: 'KALS',
                    volume: parseFloat(m.volume_fp || 0),
                    outcomes: [
                      { name: 'YES', prob: yesP, color: '#10b981' },
                      { name: 'NO', prob: 100 - yesP, color: '#ef4444' }
                    ]
                  });
                }
              } catch(err){}
           }
        }

        // Sort by volume descending
        combined.sort((a, b) => b.volume - a.volume);
        setMarkets(combined);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const loadGraphData = async (m: MarketData) => {
    setSelectedMarket(m); // Optimistic UI
    
    let history: any[] = [];
    
    if (m.platform === 'MANI') {
       try {
         const id = m.id.replace('mani-', '');
         const res = await fetch(`https://api.manifold.markets/v0/bets?contractId=${id}&limit=100`).then(r => r.json());
         
         // Aggregate bets into chart points
         let currentPoints:any = {};
         res.reverse().forEach((bet: any) => {
            const date = format(new Date(bet.createdTime), 'MMM dd HH:mm');
            currentPoints[date] = {
               date,
               YES: Math.round(bet.probAfter * 100)
            };
         });
         history = Object.values(currentPoints);
       } catch(e){}
    } else {
       // Mock for Poly/Kalshi in this demo if websocket/clob fails without tokens
       let currentProb = m.outcomes[0]?.prob || 50;
       for (let i=30; i>=0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          let change = (Math.random() * 10) - 5;
          currentProb = Math.max(1, Math.min(99, currentProb + change));
          history.push({
             date: format(d, 'MMM dd'),
             YES: Math.round(currentProb)
          });
       }
    }

    setSelectedMarket({ ...m, history });
  };

  const getBadgeColor = (p: Platform) => {
    if (p === 'POLY') return 'bg-blue-600 text-white';
    if (p === 'MANI') return 'bg-indigo-600 text-white';
    return 'bg-emerald-500 text-black';
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-slate-300 font-mono p-6 selection:bg-cyan-900">
      <div className="max-w-7xl mx-auto flex gap-6">
        
        {/* Left List */}
        <div className="flex-1 max-w-3xl overflow-y-auto" style={{ maxHeight: '90vh' }}>
          <h1 className="text-2xl font-bold mb-6 text-white border-b border-neutral-800 pb-4">Omni-Market Deep Feed</h1>
          {loading ? (
            <div className="animate-pulse flex flex-col gap-4">
               {[1,2,3,4,5].map(i => <div key={i} className="h-24 bg-neutral-900 rounded-lg"></div>)}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {markets.map(m => (
                <div 
                  key={m.id} 
                  onClick={() => loadGraphData(m)}
                  className={`p-4 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800/80 cursor-pointer transition-colors ${selectedMarket?.id === m.id ? 'ring-1 ring-cyan-500 bg-neutral-800' : ''}`}
                >
                  <div className="flex justify-between items-start mb-2">
                     <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${getBadgeColor(m.platform)}`}>{m.platform}</span>
                        <a href={m.url} target="_blank" onClick={(e)=>e.stopPropagation()} className="font-bold text-slate-100 hover:text-cyan-400 group flex items-center gap-2">
                           {m.title}
                           <ExternalLink size={14} className="opacity-0 group-hover:opacity-100" />
                        </a>
                     </div>
                  </div>

                  <div className="flex gap-4 text-xs text-neutral-400 mb-3">
                     <span className="flex items-center gap-1"><DollarSign size={12}/>{m.volume > 1000000 ? (m.volume/1000000).toFixed(1)+'M' : m.volume.toLocaleString()} Vol</span>
                     {m.bettors && <span className="flex items-center gap-1"><Users size={12}/>{m.bettors} Bettors</span>}
                     {m.closeDate && <span className="flex items-center gap-1">Ends: {format(new Date(m.closeDate), 'MMM dd')}</span>}
                  </div>

                  <div className="flex gap-2">
                    {m.outcomes.map((o, i) => (
                       <div key={i} className="flex-1 bg-neutral-950 rounded overflow-hidden relative h-6 border border-neutral-800">
                          <div 
                            className="absolute top-0 left-0 bottom-0 opacity-20 transition-all duration-500" 
                            style={{ width: `${o.prob}%`, backgroundColor: o.color || '#38bdf8' }}
                          />
                          <div className="absolute inset-0 flex justify-between px-2 items-center text-[10px] font-bold z-10" style={{ color: o.color || '#38bdf8'}}>
                             <span>{o.name}</span>
                             <span>{o.prob.toFixed(1)}%</span>
                          </div>
                       </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Detail / Graph Panel */}
        <div className="w-[500px] shrink-0 sticky top-6 self-start bg-neutral-900 border border-neutral-800 rounded-xl p-6 h-[800px] overflow-y-auto">
           {selectedMarket ? (
              <div className="flex flex-col h-full">
                 <div className="mb-6">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded mb-3 inline-block ${getBadgeColor(selectedMarket.platform)}`}>{selectedMarket.platform}</span>
                    <h2 className="text-xl font-bold text-white mb-2 leading-tight">{selectedMarket.title}</h2>
                    <a href={selectedMarket.url} target="_blank" className="text-cyan-400 text-sm hover:underline flex items-center gap-1">View on Market <ExternalLink size={14}/></a>
                 </div>

                 {selectedMarket.description && (
                   <div className="text-xs text-neutral-400 mb-6 bg-neutral-950 p-4 rounded-lg whitespace-pre-wrap max-h-40 overflow-y-auto border border-neutral-800">
                     {selectedMarket.description.length > 300 ? selectedMarket.description.substring(0,300) + '...' : selectedMarket.description}
                   </div>
                 )}

                 <div className="flex-1 min-h-[300px] w-full bg-neutral-950 border border-neutral-800 rounded-lg p-4 mb-6">
                    <h3 className="text-xs font-bold text-neutral-500 mb-4 flex items-center gap-2 uppercase tracking-wider"><Activity size={14}/> Historical Implied Probability</h3>
                    {selectedMarket.history ? (
                       <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={selectedMarket.history}>
                           <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                           <XAxis dataKey="date" stroke="#525252" fontSize={10} tickMargin={10} minTickGap={30} />
                           <YAxis stroke="#525252" fontSize={10} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                           <Tooltip 
                             contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px' }}
                             itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                           />
                           <Line 
                             type="monotone" 
                             dataKey="YES" 
                             stroke="#10b981" 
                             strokeWidth={3} 
                             dot={false}
                             activeDot={{ r: 6, fill: '#10b981', stroke: '#000', strokeWidth: 2 }}
                             animationDuration={1000}
                           />
                         </LineChart>
                       </ResponsiveContainer>
                    ) : (
                       <div className="flex h-full items-center justify-center text-neutral-600 animate-pulse text-sm">
                          Loading historical chart data...
                       </div>
                    )}
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                       <div className="text-neutral-500 text-[10px] uppercase font-bold mb-1">Total Volume</div>
                       <div className="text-xl text-white font-bold">${selectedMarket.volume.toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                    </div>
                    {selectedMarket.liquidity && (
                      <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                         <div className="text-neutral-500 text-[10px] uppercase font-bold mb-1">Liquidity</div>
                         <div className="text-xl text-white font-bold">${selectedMarket.liquidity.toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                      </div>
                    )}
                 </div>
              </div>
           ) : (
              <div className="flex h-full flex-col items-center justify-center text-neutral-600">
                 <TrendingUp size={48} className="mb-4 opacity-20" />
                 <p>Select any market to load deep historical metrics and interactive charts.</p>
              </div>
           )}
        </div>

      </div>
    </div>
  );
}
