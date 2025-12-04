import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Play, RotateCcw, MonitorPlay, CloudLightning, Upload, CheckCircle2, ShieldCheck, Settings2, Trash2, Filter, AlertTriangle } from 'lucide-react';

import { Input } from './components/Input';
import { Button } from './components/Button';
import { CommentCard } from './components/CommentCard';
import { Logger } from './components/Logger';
import { getVideoInfo, getAllComments } from './services/biliService';
import { CommentUser, VideoInfo, LogEntry } from '../types';

enum AppState {
  IDLE,
  FETCHING_INFO,
  FETCHING_COMMENTS,
  READY_TO_DRAW,
  DRAWING,
  FINISHED
}

const App: React.FC = () => {
  // --- State ---
  const [bvId, setBvId] = useState('BV1gC4y1h71A'); // Default for demo
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [allComments, setAllComments] = useState<CommentUser[]>([]);
  const [filteredComments, setFilteredComments] = useState<CommentUser[]>([]);
  
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [isMockMode, setIsMockMode] = useState(false);
  
  // Filters
  const [keyword, setKeyword] = useState('');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [minLevel, setMinLevel] = useState(1);

  // Lottery
  const [currentCandidate, setCurrentCandidate] = useState<CommentUser | null>(null);
  const [winner, setWinner] = useState<CommentUser | null>(null);
  const timerRef = useRef<number | null>(null);

  // --- Helpers ---
  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString('en-GB'), // 14:04:05 format
      type,
      message
    };
    setLogs(prev => [...prev, entry]);
  };

  // --- Actions ---
  const handleFetch = async () => {
    if (!bvId) {
      addLog('Please enter a BV ID', 'error');
      return;
    }
    
    setLogs([]); // Clear previous logs
    setStatus(AppState.FETCHING_INFO);
    setVideoInfo(null);
    setAllComments([]);
    setFilteredComments([]);
    setWinner(null);
    setIsMockMode(false);

    try {
      addLog(`Analyzing: ${bvId}...`, 'info');
      
      // 1. Get Info
      const info = await getVideoInfo(bvId);
      setVideoInfo(info);
      
      // Check if we fell back to mock data (OID 999999 is our magic number)
      if (info.aid === 999999) {
          setIsMockMode(true);
          addLog('⚠️ API Unreachable (404). Switched to DEMO MODE.', 'warning');
          addLog(`Virtual Video Loaded: ${info.title}`, 'success');
      } else {
          addLog(`Parsed Success: BV=${info.bvid} => OID=${info.aid}`, 'success');
      }
      
      // 2. Get Comments
      setStatus(AppState.FETCHING_COMMENTS);
      addLog('Starting fetch sequence...', 'info');
      
      const comments = await getAllComments(info.aid, (count, page) => {
        if (page % 5 === 0 || page === 1) { 
            addLog(`Fetched page ${page}, total ${count} comments...`, 'info');
        }
      });

      if (comments.length === 0) {
        addLog('No comments found or API returned empty list.', 'warning');
        setStatus(AppState.IDLE);
        return;
      }

      setAllComments(comments);
      addLog(`Fetch Complete! Total raw comments: ${comments.length}`, 'success');
      setStatus(AppState.READY_TO_DRAW);

    } catch (err: any) {
      console.error(err);
      addLog(err.message || 'Unknown Error', 'error');
      setStatus(AppState.IDLE);
    }
  };

  const applyFilters = () => {
    let result = [...allComments];

    // Level Filter
    if (minLevel > 0) {
        result = result.filter(c => c.level >= minLevel);
    }

    // Keyword
    if (keyword.trim()) {
      result = result.filter(c => c.message.includes(keyword.trim()));
    }

    // Dedupe
    if (removeDuplicates) {
      const seen = new Set();
      result = result.filter(c => {
        if (seen.has(c.mid)) return false;
        seen.add(c.mid);
        return true;
      });
    }

    setFilteredComments(result);
  };

  useEffect(() => {
    applyFilters();
  }, [allComments, keyword, removeDuplicates, minLevel]);

  const startLottery = () => {
    if (filteredComments.length === 0) return;
    setStatus(AppState.DRAWING);
    setWinner(null);
    addLog(`Starting lottery among ${filteredComments.length} candidates...`, 'info');
    
    const interval = window.setInterval(() => {
      const randomIndex = Math.floor(Math.random() * filteredComments.length);
      setCurrentCandidate(filteredComments[randomIndex]);
    }, 50);

    timerRef.current = interval;
  };

  const stopLottery = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (currentCandidate) {
      setWinner(currentCandidate);
      setStatus(AppState.FINISHED);
      addLog(`Winner selected: ${currentCandidate.uname}`, 'success');
      fireConfetti();
    }
  };

  const fireConfetti = () => {
    const end = Date.now() + 3000;
    const frame = () => {
      confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#FB7299', '#00AEEC'] });
      confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#FB7299', '#00AEEC'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-[#f1f2f5] text-gray-800 font-sans pb-12">
      
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-bili-pink text-white p-1.5 rounded-lg">
               <GiftIcon className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              Bilibili <span className="text-bili-pink">Lucky Draw</span> Pro
            </h1>
          </div>
          <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1 rounded-full border ${isMockMode ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-green-600 bg-green-50 border-green-100'}`}>
            {isMockMode ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {isMockMode ? 'Demo Mode' : 'Vercel Powered'}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* === LEFT COLUMN: Controls & Logs === */}
          <div className="w-full lg:w-1/3 flex flex-col gap-6">
            
            {/* Card 1: Data Source */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="font-bold flex items-center gap-2 text-gray-700">
                  <Upload className="w-5 h-5 text-bili-blue" />
                  Data Source
                </h2>
              </div>
              
              <div className="p-5 flex flex-col gap-4">
                {/* Tabs */}
                <div className="flex bg-gray-100 p-1 rounded-xl mb-2">
                  <button className="flex-1 bg-white shadow-sm text-bili-pink font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition-all">
                    <CloudLightning className="w-4 h-4" /> Online Fetch
                  </button>
                  <button disabled className="flex-1 text-gray-400 font-medium py-2 rounded-lg text-sm cursor-not-allowed">
                    Paste JSON
                  </button>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700">Bilibili BV ID</label>
                  <div className="flex gap-2">
                    <span className="flex items-center justify-center px-3 bg-gray-100 text-gray-500 font-bold rounded-xl border border-gray-200">BV</span>
                    <input 
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:border-bili-pink focus:ring-2 focus:ring-bili-pink/20 outline-none font-medium text-gray-700"
                      placeholder="1gpSFBGE2s"
                      value={bvId}
                      onChange={e => setBvId(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-blue-50 text-blue-700 text-xs p-3 rounded-lg flex items-start gap-2 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Accelerated by Vercel Edge Network. Bypasses standard rate limits securely.
                </div>

                <Button 
                  onClick={handleFetch} 
                  isLoading={status === AppState.FETCHING_INFO || status === AppState.FETCHING_COMMENTS}
                  className="w-full shadow-lg shadow-pink-200"
                >
                  {status === AppState.FETCHING_INFO ? 'Analyzing...' : 
                   status === AppState.FETCHING_COMMENTS ? 'Fetching...' : 'Load Comment Data'}
                </Button>

                {/* Log Area */}
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider flex items-center gap-2">
                    <span>> Operation Logs</span>
                  </div>
                  <Logger logs={logs} className="h-48" />
                </div>
              </div>
            </div>

            {/* Card 2: Configuration */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
               <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <h2 className="font-bold flex items-center gap-2 text-gray-700">
                  <Settings2 className="w-5 h-5 text-bili-blue" />
                  Filter Config
                </h2>
              </div>
              <div className="p-5 space-y-5">
                
                <div>
                   <label className="text-sm font-semibold text-gray-700 mb-2 block">Keywords (Optional)</label>
                   <Input 
                      placeholder="e.g., 'In', 'Wish'"
                      value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                      className="text-sm"
                   />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">Deduplicate UIDs</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={removeDuplicates} onChange={e => setRemoveDuplicates(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bili-pink"></div>
                    </label>
                </div>

                <div>
                   <label className="text-sm font-semibold text-gray-700 mb-2 block">Min Level Requirement</label>
                   <select 
                      value={minLevel} 
                      onChange={e => setMinLevel(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white text-sm focus:border-bili-pink"
                   >
                      <option value="0">Lv0 (All Users)</option>
                      <option value="1">Lv1 (Member)</option>
                      <option value="2">Lv2 (Rookie)</option>
                      <option value="3">Lv3 (Regular)</option>
                      <option value="4">Lv4 (Veteran)</option>
                      <option value="5">Lv5 (Master)</option>
                      <option value="6">Lv6 (Legend)</option>
                   </select>
                </div>

              </div>
            </div>

          </div>

          {/* === RIGHT COLUMN: Screen === */}
          <div className="w-full lg:w-2/3">
             <div className="bg-white rounded-3xl shadow-lg border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                   <MonitorPlay className="w-6 h-6 text-gray-700" />
                   <h2 className="text-xl font-bold text-gray-800">Lottery Screen</h2>
                   {videoInfo && (
                      <span className="ml-auto text-sm text-gray-500 truncate max-w-[200px] bg-gray-100 px-3 py-1 rounded-full">
                        {videoInfo.title}
                      </span>
                   )}
                </div>

                <div className="flex-1 p-8 bg-slate-50 relative flex flex-col items-center justify-center">
                   
                   {/* Background Grid Pattern */}
                   <div className="absolute inset-0 opacity-5" 
                        style={{backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '24px 24px'}}>
                   </div>

                   {/* Main Display Area */}
                   <div className="relative z-10 w-full max-w-2xl aspect-video bg-[#1a1b2e] rounded-2xl shadow-2xl flex flex-col items-center justify-center overflow-hidden border-4 border-gray-800 ring-4 ring-gray-200/50">
                      
                      {status === AppState.IDLE || status === AppState.FETCHING_INFO || status === AppState.FETCHING_COMMENTS ? (
                          <div className="text-center p-6 animate-pulse">
                              <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/10">
                                  <Upload className="w-10 h-10 text-white/40" />
                              </div>
                              <p className="text-gray-400 font-medium">Please load data first</p>
                          </div>
                      ) : status === AppState.DRAWING ? (
                          <div className="w-full h-full flex items-center justify-center p-8 bg-[#1a1b2e]">
                              {currentCandidate && (
                                  <div className="scale-150 transform transition-all duration-75">
                                      <CommentCard user={currentCandidate} className="bg-white/95 shadow-2xl border-2 border-bili-pink" />
                                  </div>
                              )}
                          </div>
                      ) : status === AppState.FINISHED && winner ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-pink-900/50 to-blue-900/50 relative">
                              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                              <div className="animate-bounce mb-8 text-5xl">👑</div>
                              <div className="scale-125 transform transition-all duration-500">
                                  <CommentCard user={winner} isWinner className="shadow-[0_0_60px_rgba(251,114,153,0.6)] ring-4 ring-yellow-400" />
                              </div>
                              <p className="mt-8 text-white/80 font-bold tracking-widest uppercase text-sm">Winner Selected</p>
                          </div>
                      ) : (
                        // Ready State
                        <div className="text-center space-y-4">
                             <div className="text-7xl font-black text-white/5 tracking-tighter select-none">READY</div>
                             <div className="text-bili-blue font-mono font-bold text-lg bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/20">
                                POOL: {filteredComments.length} CANDIDATES
                             </div>
                        </div>
                      )}

                   </div>

                   {/* Controls */}
                   <div className="mt-12 relative z-10 h-16">
                      {status === AppState.READY_TO_DRAW || status === AppState.FINISHED ? (
                        <button 
                          onClick={startLottery}
                          disabled={filteredComments.length === 0}
                          className="group relative px-10 py-4 bg-gradient-to-r from-bili-pink to-pink-600 rounded-2xl text-white font-bold text-xl shadow-xl shadow-pink-200/50 hover:shadow-pink-300/50 hover:-translate-y-1 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            <span className="flex items-center gap-3">
                                {status === AppState.FINISHED ? <RotateCcw className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                                {status === AppState.FINISHED ? 'Restart Draw' : 'Start Lottery'}
                            </span>
                        </button>
                      ) : status === AppState.DRAWING && (
                        <button 
                          onClick={stopLottery}
                          className="px-10 py-4 bg-white text-red-500 border-2 border-red-100 rounded-2xl font-bold text-xl shadow-xl hover:bg-red-50 hover:scale-105 hover:shadow-red-100 transition-all flex items-center gap-3"
                        >
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                            STOP!
                        </button>
                      )}
                   </div>

                </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Simple Icon component for the logo
const GiftIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13" />
    <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
    <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
  </svg>
);

export default App;