import React, { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Play, RotateCcw, MonitorPlay, CloudLightning, Upload, CheckCircle2, ShieldCheck, Settings2, AlertTriangle, Users } from 'lucide-react';

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
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [minLevel, setMinLevel] = useState(1);
  const [winnerCount, setWinnerCount] = useState(1);
  const [currentCandidate, setCurrentCandidate] = useState<CommentUser | null>(null);
  const [winner, setWinner] = useState<CommentUser | null>(null);
  const [winners, setWinners] = useState<CommentUser[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(-1);
  const timerRef = useRef<number | null>(null);
  const visitorIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  const reportOnline = useCallback(async (vid: string) => {
    try {
      const res = await fetch(`/api/proxy?type=online&visitorId=${encodeURIComponent(vid)}`);
      const json = await res.json();
      if (json.data?.online >= 0) {
        setOnlineCount(json.data.online);
      }
    } catch {}
  }, []);

  const startHeartbeat = useCallback((vid: string) => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    reportOnline(vid);
    heartbeatRef.current = window.setInterval(() => reportOnline(vid), 30000);
  }, [reportOnline]);

  useEffect(() => {
    const vid = `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    visitorIdRef.current = vid;
    startHeartbeat(vid);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [startHeartbeat]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      type,
      message
    };
    setLogs((prev) => [...prev, entry]);
  };

  const formatDrawTime = () => {
    return new Date().toLocaleString('zh-CN', {
      hour12: false
    });
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

    const finalWinner = {
      ...finalCandidate,
      drawTime: formatDrawTime()
    };
    const nextWinners = [...winners, finalWinner];
    setWinners(nextWinners);
    setWinner(finalWinner);
    setCurrentCandidate(finalWinner);
    setStatus(nextWinners.length >= winnerCount ? AppState.FINISHED : AppState.READY_TO_DRAW);
    addLog(`中奖者产生: ${finalWinner.uname}（第 ${nextWinners.length} / ${winnerCount} 位）`, 'success');
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

  const stageStatusText =
    status === AppState.FETCHING_INFO ? '解析视频信息中' :
    status === AppState.FETCHING_COMMENTS ? '抓取评论中' :
    status === AppState.DRAWING ? `正在抽取第 ${winners.length + 1} 位中奖者` :
    status === AppState.FINISHED ? '抽奖结果已锁定' :
    filteredComments.length > 0 ? '候选池已就绪' :
    '等待加载评论';

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
          <div className="flex items-center gap-3">
            {onlineCount >= 0 && (
              <div className="flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full border border-gray-100 bg-gray-50 text-gray-600">
                <Users className="w-4 h-4 text-blue-500" />
                <span>{onlineCount} 人在线</span>
              </div>
            )}
            <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1 rounded-full border ${isAnonymousMode ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-green-600 bg-green-50 border-green-100'}`}>
              {isAnonymousMode ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              {isAnonymousMode ? '在线匿名模式' : '在线抓取模式'}
            </div>
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
                  <button
                    type="button"
                    onClick={() => setIsLogExpanded((prev) => !prev)}
                    className="mb-2 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
                  >
                    <span>&gt; 操作日志</span>
                    <span>{isLogExpanded ? '收起' : `展开${logs.length > 0 ? ` (${logs.length})` : ''}`}</span>
                  </button>
                  {isLogExpanded && <Logger logs={logs} className="h-48" />}
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
             <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top,#fff8fb_0%,#eef4ff_38%,#e7edf5_100%)] shadow-[0_30px_80px_rgba(15,23,42,0.12)] min-h-[600px]">
                <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.58),rgba(255,255,255,0)_35%,rgba(255,255,255,0.6)_100%)]" />
                <div className="absolute -left-16 top-12 h-56 w-56 rounded-full bg-pink-300/30 blur-3xl" />
                <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
                <div className="absolute bottom-10 left-1/2 h-40 w-[85%] -translate-x-1/2 rounded-full bg-slate-900/10 blur-3xl" />

                <div className="relative z-10 border-b border-white/60 px-6 py-5 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
                        <MonitorPlay className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Live Stage</p>
                        <h2 className="text-2xl font-black tracking-tight text-slate-900">抽奖大屏</h2>
                      </div>
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600 backdrop-blur">
                        {stageStatusText}
                      </span>
                      <span className="rounded-full border border-white/70 bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-slate-900/15">
                        已抽出 {winners.length} / {winnerCount}
                      </span>
                    </div>
                  </div>
                  {videoInfo && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/70 bg-white/55 px-4 py-3 backdrop-blur">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="shrink-0 rounded-full bg-bili-pink/10 px-3 py-1 font-bold text-bili-pink">当前视频</span>
                        <span className="truncate font-medium text-slate-600">{videoInfo.title}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative z-10 p-6 md:p-8">
                  <div className="relative overflow-hidden rounded-[28px] border border-white/50 bg-[#090d1a] p-5 shadow-[0_40px_100px_rgba(15,23,42,0.4)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_32%),radial-gradient(circle_at_20%_20%,rgba(251,114,153,0.22),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))]" />
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                    <div className="absolute left-10 top-0 h-52 w-24 -skew-x-[22deg] bg-white/5 blur-2xl" />
                    <div className="absolute right-12 top-0 h-52 w-24 skew-x-[22deg] bg-cyan-200/10 blur-2xl" />
                    <div className="absolute inset-x-6 bottom-5 h-20 rounded-full bg-bili-pink/10 blur-3xl" />

                    <div className="relative z-10 mb-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/75 backdrop-blur">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-white/40">Draw Engine</p>
                        <p className="mt-1 text-sm font-medium text-white/80">{stageStatusText}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">Pool</p>
                        <p className="mt-1 text-2xl font-black text-cyan-300">{filteredComments.length}</p>
                      </div>
                    </div>

                    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.22),rgba(9,13,26,0.96)_48%)]">
                      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '42px 42px' }} />
                      <div className="absolute left-1/2 top-0 h-40 w-[70%] -translate-x-1/2 bg-gradient-to-b from-cyan-200/20 to-transparent blur-2xl" />
                      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/35 to-transparent" />

                      {status === AppState.IDLE || status === AppState.FETCHING_INFO || status === AppState.FETCHING_COMMENTS ? (
                        <div className="relative z-10 text-center">
                          <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_50px_rgba(56,189,248,0.12)]">
                            <Upload className="h-11 w-11 text-white/35" />
                          </div>
                          <p className="text-xs font-bold uppercase tracking-[0.35em] text-white/35">Stage Standby</p>
                          <p className="mt-3 text-lg font-semibold text-white/75">{stageStatusText}</p>
                        </div>
                      ) : status === AppState.DRAWING ? (
                        <div className="relative z-10 flex h-full w-full items-center justify-center p-8">
                          {currentCandidate && (
                            <div className="w-full max-w-xl scale-[1.18] transition-all duration-75">
                              <CommentCard user={currentCandidate} className="border-2 border-bili-pink bg-white/95 shadow-[0_0_60px_rgba(251,114,153,0.25)]" />
                            </div>
                          )}
                        </div>
                      ) : status === AppState.FINISHED && winner ? (
                        <div className="relative z-10 flex h-full w-full flex-col items-center justify-center p-8">
                          <div className="mb-5 rounded-full border border-yellow-300/30 bg-yellow-300/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.35em] text-yellow-200">
                            Final Result
                          </div>
                          <div className="mb-8 text-6xl drop-shadow-[0_0_30px_rgba(250,204,21,0.6)]">👑</div>
                          <div className="w-full max-w-xl scale-[1.08]">
                            <CommentCard user={winner} isWinner className="border-yellow-300/70 bg-white shadow-[0_0_80px_rgba(250,204,21,0.18)]" />
                          </div>
                          <p className="mt-8 text-sm font-bold uppercase tracking-[0.35em] text-white/65">已抽出 {winners.length} / {winnerCount} 位中奖者</p>
                        </div>
                      ) : (
                        <div className="relative z-10 text-center">
                          <p className="text-[72px] font-black tracking-[-0.08em] text-white/8 md:text-[110px]">DRAW</p>
                          <div className="mx-auto -mt-4 w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-5 py-2 text-lg font-black text-cyan-200 shadow-[0_0_40px_rgba(56,189,248,0.12)]">
                            奖池：{filteredComments.length} 位候选人
                          </div>
                          {winners.length > 0 && (
                            <p className="mt-4 text-sm text-white/55">已有 {winners.length} 位中奖者锁定，下一轮将自动排除</p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="relative z-10 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                      <span className="font-medium">目标中奖人数：{winnerCount}</span>
                      <span className="font-medium">待抽人数：{filteredComments.length}</span>
                      <span className="font-medium">已锁定：{winners.length}</span>
                    </div>
                  </div>

                  <div className="relative z-10 mt-8 flex min-h-[64px] items-center justify-center">
                    {status === AppState.READY_TO_DRAW || status === AppState.FINISHED ? (
                      <button 
                        onClick={startLottery}
                        disabled={filteredComments.length === 0 || winners.length >= winnerCount}
                        className="group relative overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#fb7185_0%,#fb7299_42%,#0ea5e9_100%)] px-11 py-4 text-white shadow-[0_20px_60px_rgba(251,114,153,0.32)] transition-all hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_28px_70px_rgba(14,165,233,0.28)] disabled:cursor-not-allowed disabled:opacity-45 disabled:transform-none"
                      >
                        <span className="absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.32),transparent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        <span className="relative flex items-center gap-3 text-xl font-black tracking-tight">
                          {winners.length > 0 ? <RotateCcw className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
                          {winners.length >= winnerCount ? '抽奖已完成' : winners.length > 0 ? '继续抽下一位' : '开始抽奖'}
                        </span>
                      </button>
                    ) : status === AppState.DRAWING && (
                      <button 
                        onClick={stopLottery}
                        className="rounded-[22px] border border-red-200 bg-white px-11 py-4 text-red-500 shadow-[0_20px_50px_rgba(248,113,113,0.18)] transition-all hover:-translate-y-1 hover:bg-red-50"
                      >
                        <span className="flex items-center gap-3 text-xl font-black tracking-tight">
                          <div className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                          锁定当前结果
                        </span>
                      </button>
                    )}
                  </div>

                  {winners.length > 0 && (
                    <div className="relative z-10 mt-8 overflow-hidden rounded-[28px] border border-white/60 bg-white/65 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Result Board</p>
                          <h3 className="mt-1 text-xl font-black text-slate-900">中奖名单</h3>
                        </div>
                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">
                          {winners.length} / {winnerCount}
                        </span>
                      </div>
                      <div className="grid gap-5 md:grid-cols-2">
                        {winners.map((winnerItem, index) => (
                          <CommentCard
                            key={`${winnerItem.mid}-${index}`}
                            user={winnerItem}
                            isWinner
                            className="bg-white !scale-100"
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
