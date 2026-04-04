import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Play, RotateCcw, MonitorPlay, CloudLightning, Upload, CheckCircle2, ShieldCheck, Settings2, AlertTriangle } from 'lucide-react';

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
  const [bvId, setBvId] = useState('BV13vuEzyEGp');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [allComments, setAllComments] = useState<CommentUser[]>([]);
  const [filteredComments, setFilteredComments] = useState<CommentUser[]>([]);
  const [status, setStatus] = useState<AppState>(AppState.IDLE);
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [minLevel, setMinLevel] = useState(1);
  const [winnerCount, setWinnerCount] = useState(1);
  const [currentCandidate, setCurrentCandidate] = useState<CommentUser | null>(null);
  const [winner, setWinner] = useState<CommentUser | null>(null);
  const [winners, setWinners] = useState<CommentUser[]>([]);
  const timerRef = useRef<number | null>(null);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      type,
      message
    };
    setLogs((prev) => [...prev, entry]);
  };

  const resetSession = () => {
    setVideoInfo(null);
    setAllComments([]);
    setFilteredComments([]);
    setCurrentCandidate(null);
    setWinner(null);
    setWinners([]);
    setIsAnonymousMode(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const normalizeBvid = (raw: string) => {
    const value = raw.trim();
    if (!value) {
      return null;
    }

    const match = value.match(/BV([0-9A-Za-z]{10})/i);
    if (match) {
      return `BV${match[1]}`;
    }

    if (/^[0-9A-Za-z]{10}$/i.test(value)) {
      return `BV${value}`;
    }

    return null;
  };

  const handleFetch = async () => {
    const normalizedBvid = normalizeBvid(bvId);
    if (!normalizedBvid) {
      addLog('请输入有效的 BV 号或完整视频链接', 'error');
      return;
    }

    setLogs([]);
    setStatus(AppState.FETCHING_INFO);
    resetSession();

    try {
      setBvId(normalizedBvid);
      addLog(`正在解析视频: ${normalizedBvid}...`, 'info');

      const info = await getVideoInfo(normalizedBvid);
      setVideoInfo(info);
      addLog(`解析成功: BV=${info.bvid} => OID=${info.aid}`, 'success');

      setStatus(AppState.FETCHING_COMMENTS);
      addLog('开始抓取评论数据，包含楼中楼...', 'info');

      const result = await getAllComments(info.aid, (count, page) => {
        if (page === 1 || page % 3 === 0) {
          addLog(`已处理第 ${page} 批评论，累计 ${count} 条有效评论...`, 'info');
        }
      });

      const comments = result.comments;
      setIsAnonymousMode(!result.usedConfiguredCookie);

      if (comments.length === 0) {
        addLog('未找到评论或 API 返回空列表。', 'warning');
        setStatus(AppState.IDLE);
        return;
      }

      setAllComments(comments);
      addLog(`抓取完成，共获取 ${comments.length} 条有效评论`, 'success');

      if (!result.usedConfiguredCookie) {
        addLog('当前为匿名模式，B 站可能只返回部分评论。建议给服务端配置默认 Cookie。', 'warning');
      }

      if (result.rootCountEstimate > comments.length * 3) {
        addLog(`接口报告评论规模约为 ${result.rootCountEstimate}，但当前仅抓到 ${comments.length} 条，结果可能不完整。`, 'warning');
      }

      setStatus(AppState.READY_TO_DRAW);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      addLog(message, 'error');
      setStatus(AppState.IDLE);
    }
  };

  const applyFilters = () => {
    let result = [...allComments];

    if (minLevel > 0) {
      result = result.filter((comment) => comment.level >= minLevel);
    }

    if (keyword.trim()) {
      result = result.filter((comment) => comment.message.includes(keyword.trim()));
    }

    if (removeDuplicates) {
      const seen = new Set<string>();
      result = result.filter((comment) => {
        if (seen.has(comment.mid)) {
          return false;
        }

        seen.add(comment.mid);
        return true;
      });
    }

    if (winners.length > 0) {
      const winnerIds = new Set(winners.map((winnerItem) => winnerItem.mid));
      result = result.filter((comment) => !winnerIds.has(comment.mid));
    }

    setFilteredComments(result);
  };

  useEffect(() => {
    applyFilters();
  }, [allComments, keyword, removeDuplicates, minLevel, winners]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const startLottery = () => {
    if (filteredComments.length === 0) {
      addLog('当前没有符合条件的候选人', 'warning');
      return;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setStatus(AppState.DRAWING);
    setWinner(null);
    setCurrentCandidate(filteredComments[0]);
    addLog(`开始从 ${filteredComments.length} 位候选人中抽取第 ${winners.length + 1} / ${winnerCount} 位中奖者...`, 'info');

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

    const finalCandidate = currentCandidate ?? filteredComments[Math.floor(Math.random() * filteredComments.length)];
    if (!finalCandidate) {
      addLog('未能确定中奖者，请重新抽奖', 'error');
      setStatus(AppState.READY_TO_DRAW);
      return;
    }

    const nextWinners = [...winners, finalCandidate];
    setWinners(nextWinners);
    setWinner(finalCandidate);
    setCurrentCandidate(finalCandidate);
    setStatus(nextWinners.length >= winnerCount ? AppState.FINISHED : AppState.READY_TO_DRAW);
    addLog(`中奖者产生: ${finalCandidate.uname}（第 ${nextWinners.length} / ${winnerCount} 位）`, 'success');
    fireConfetti();
  };

  const exportResults = () => {
    if (!videoInfo || winners.length === 0) {
      addLog('暂无可导出的抽奖结果', 'warning');
      return;
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      video: {
        bvid: videoInfo.bvid,
        aid: videoInfo.aid,
        title: videoInfo.title
      },
      filters: {
        keyword,
        removeDuplicates,
        minLevel
      },
      summary: {
        totalComments: allComments.length,
        eligibleCandidates: winners.length + filteredComments.length,
        winnerCount: winners.length
      },
      winners
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${videoInfo.bvid || 'lottery'}-results.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addLog(`已导出 ${winners.length} 位中奖者结果`, 'success');
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
          <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1 rounded-full border ${isAnonymousMode ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-green-600 bg-green-50 border-green-100'}`}>
            {isAnonymousMode ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {isAnonymousMode ? '在线匿名模式' : '在线抓取模式'}
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
                  数据来源
                </h2>
              </div>
              
              <div className="p-5 flex flex-col gap-4">
                <div className="inline-flex items-center gap-2 self-start rounded-full bg-pink-50 px-3 py-1 text-sm font-semibold text-bili-pink">
                  <CloudLightning className="w-4 h-4" />
                  在线获取
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700">Bilibili BV 号或视频链接</label>
                  <input
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-bili-pink focus:ring-2 focus:ring-bili-pink/20 outline-none font-medium text-gray-700"
                    placeholder="例如: BV1xx411c7mD 或完整视频链接"
                    value={bvId}
                    onChange={(e) => setBvId(e.target.value)}
                  />
                </div>
                <div className="bg-blue-50 text-blue-700 text-xs p-3 rounded-lg flex items-start gap-2 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  开发环境直接走本地代理，部署后走服务端接口。若服务端未配置默认 Cookie，将进入匿名模式，评论结果可能不完整。
                </div>
                <Button 
                  onClick={handleFetch} 
                  isLoading={status === AppState.FETCHING_INFO || status === AppState.FETCHING_COMMENTS}
                  className="w-full shadow-lg shadow-pink-200"
                >
                  {status === AppState.FETCHING_INFO ? '正在解析视频...' : 
                   status === AppState.FETCHING_COMMENTS ? '正在抓取评论...' : '加载评论数据'}
                </Button>

                {/* Log Area */}
                <div className="mt-2">
                  <div className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider flex items-center gap-2">
                    <span>&gt; 操作日志</span>
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
                  方案配置
                </h2>
              </div>
              <div className="p-5 space-y-5">
                <div>
                   <label className="text-sm font-semibold text-gray-700 mb-2 block">中奖人数</label>
                   <select
                      value={winnerCount}
                      onChange={e => setWinnerCount(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white text-sm focus:border-bili-pink"
                   >
                      <option value="1">1 人</option>
                      <option value="2">2 人</option>
                      <option value="3">3 人</option>
                      <option value="5">5 人</option>
                      <option value="10">10 人</option>
                   </select>
                </div>

                
                <div>
                   <label className="text-sm font-semibold text-gray-700 mb-2 block">筛选关键词 (选填)</label>
                   <Input 
                      placeholder="例如：'接好运'，'想要'"
                      value={keyword}
                      onChange={e => setKeyword(e.target.value)}
                      className="text-sm"
                   />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">UID 去重 (每人限一次)</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={removeDuplicates} onChange={e => setRemoveDuplicates(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-bili-pink"></div>
                    </label>
                </div>

                <div>
                   <label className="text-sm font-semibold text-gray-700 mb-2 block">最低等级要求 (门槛)</label>
                   <select 
                      value={minLevel} 
                      onChange={e => setMinLevel(Number(e.target.value))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 outline-none bg-white text-sm focus:border-bili-pink"
                   >
                      <option value="0">Lv0 (无限制 - 注册用户)</option>
                      <option value="1">Lv1 (正式会员)</option>
                      <option value="2">Lv2 (入门萌新)</option>
                      <option value="3">Lv3 (站内老手)</option>
                      <option value="4">Lv4 (硬币大户)</option>
                      <option value="5">Lv5 (元老级别)</option>
                      <option value="6">Lv6 (传说级别)</option>
                   </select>
                </div>

                <Button
                  variant="outline"
                  onClick={exportResults}
                  disabled={winners.length === 0}
                  className="w-full"
                >
                  导出抽奖结果
                </Button>

              </div>
            </div>

          </div>

          {/* === RIGHT COLUMN: Screen === */}
          <div className="w-full lg:w-2/3">
             <div className="bg-white rounded-3xl shadow-lg border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                   <MonitorPlay className="w-6 h-6 text-gray-700" />
                  <h2 className="text-xl font-bold text-gray-800">抽奖大屏</h2>
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
                              <p className="text-gray-400 font-medium">请先加载数据</p>
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
                              <p className="mt-8 text-white/80 font-bold tracking-widest uppercase text-sm">已抽出 {winners.length} / {winnerCount} 位中奖者</p>
                          </div>
                      ) : (
                        // Ready State
                        <div className="text-center space-y-4">
                             <div className="text-7xl font-black text-white/5 tracking-tighter select-none">READY</div>
                             <div className="text-bili-blue font-mono font-bold text-lg bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/20">
                                奖池：{filteredComments.length} 位候选人
                             </div>
                             {winners.length > 0 && (
                               <div className="text-sm text-white/60">已锁定 {winners.length} 位中奖者</div>
                             )}
                        </div>
                      )}

                   </div>

                   {/* Controls */}
                   <div className="mt-12 relative z-10 h-16">
                      {status === AppState.READY_TO_DRAW || status === AppState.FINISHED ? (
                        <button 
                          onClick={startLottery}
                          disabled={filteredComments.length === 0 || winners.length >= winnerCount}
                          className="group relative px-10 py-4 bg-gradient-to-r from-bili-pink to-pink-600 rounded-2xl text-white font-bold text-xl shadow-xl shadow-pink-200/50 hover:shadow-pink-300/50 hover:-translate-y-1 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            <span className="flex items-center gap-3">
                                {winners.length > 0 ? <RotateCcw className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                                {winners.length >= winnerCount ? '已完成抽奖' : winners.length > 0 ? '继续抽奖' : '开始抽奖'}
                            </span>
                        </button>
                      ) : status === AppState.DRAWING && (
                        <button 
                          onClick={stopLottery}
                          className="px-10 py-4 bg-white text-red-500 border-2 border-red-100 rounded-2xl font-bold text-xl shadow-xl hover:bg-red-50 hover:scale-105 hover:shadow-red-100 transition-all flex items-center gap-3"
                        >
                            <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                            停！
                        </button>
                      )}
                   </div>

                </div>

                {winners.length > 0 && (
                  <div className="relative z-10 mt-8 w-full max-w-2xl">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">中奖名单</h3>
                      <span className="text-sm text-gray-500">{winners.length} / {winnerCount}</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {winners.map((winnerItem, index) => (
                        <CommentCard
                          key={`${winnerItem.mid}-${index}`}
                          user={winnerItem}
                          isWinner
                          className="bg-white"
                        />
                      ))}
                    </div>
                  </div>
                )}
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
