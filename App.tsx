import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Gift, 
  Settings, 
  Upload, 
  Play, 
  RefreshCw, 
  Users, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Globe,
  Terminal,
  Copy,
  FileJson,
  Code,
  CloudLightning
} from 'lucide-react';
import { BilibiliComment, FilterSettings, Winner } from './types';
import { fetchCommentsByBV } from './services/bilibiliService';
import { Button } from './components/Button';
import { WinnerCard } from './components/WinnerCard';

// Default constants configured for User
const DEFAULT_KEYWORDS = ["接好运", "想要"];
const DEFAULT_BV = "BV1gpSFBGE2s";

function App() {
  // State: Settings
  const [bvId, setBvId] = useState(DEFAULT_BV);
  const [inputKeywords, setInputKeywords] = useState(DEFAULT_KEYWORDS.join(", "));
  const [settings, setSettings] = useState<FilterSettings>({
    keywords: DEFAULT_KEYWORDS,
    filterDuplicates: true,
    minLevel: 1,
    winnerCount: 1,
  });

  // State: Data
  const [rawData, setRawData] = useState<BilibiliComment[]>([]);
  const [dataMode, setDataMode] = useState<'online' | 'json'>('online');
  const [jsonInput, setJsonInput] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  
  // State: Debugging
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // State: Lottery Process
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentCandidate, setCurrentCandidate] = useState<BilibiliComment | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [filteredPool, setFilteredPool] = useState<BilibiliComment[]>([]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Parse keywords on blur
  const handleKeywordBlur = () => {
    const arr = inputKeywords.split(/[,，\s]+/).filter(k => k.trim().length > 0);
    setSettings(prev => ({ ...prev, keywords: arr }));
  };

  // Filter Logic
  useEffect(() => {
    if (rawData.length === 0) {
      setFilteredPool([]);
      return;
    }

    let pool = rawData.filter(comment => {
      // 1. Keyword check
      if (settings.keywords.length > 0) {
        const hasKeyword = settings.keywords.some(k => comment.content?.message?.includes(k));
        if (!hasKeyword) return false;
      }
      // 2. Level check
      const level = comment.member?.level_info?.current_level || 0;
      if (level < settings.minLevel) return false;
      
      return true;
    });

    // 3. Duplicate removal
    if (settings.filterDuplicates) {
      const seen = new Set();
      pool = pool.filter(c => {
        const mid = c.member?.mid || c.rpid; // Fallback to rpid if mid missing
        const duplicate = seen.has(mid);
        seen.add(mid);
        return !duplicate;
      });
    }

    // Remove already won
    const winnerIds = new Set(winners.map(w => w.rpid));
    pool = pool.filter(c => !winnerIds.has(c.rpid));

    setFilteredPool(pool);
  }, [rawData, settings, winners]);

  // Log Helper
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${time}] ${msg}`]);
  }, []);

  // Handle Data Input
  const handleLoadData = async () => {
    setIsLoadingData(true);
    setFetchError(null);
    setLogs([]); // Clear previous logs
    setWinners([]); // Reset winners

    if (dataMode === 'json') {
      addLog("开始解析 JSON 数据...");
      try {
        if (!jsonInput.trim()) throw new Error("输入内容为空");
        
        const parsed = JSON.parse(jsonInput);
        let comments: BilibiliComment[] = [];

        // 智能识别数据结构
        if (Array.isArray(parsed)) {
            comments = parsed;
        } else if (parsed.data && Array.isArray(parsed.data.replies)) {
            // 标准 API 结构: { code: 0, data: { replies: [...] } }
            comments = parsed.data.replies;
        } else if (parsed.replies && Array.isArray(parsed.replies)) {
            comments = parsed.replies;
        } else if (parsed.data && Array.isArray(parsed.data)) {
            comments = parsed.data;
        } else {
            throw new Error("无法识别的 JSON 格式。请确保包含 'replies' 数组或直接是评论数组。");
        }

        // 简单验证字段
        if (comments.length > 0) {
            const sample = comments[0];
            if (!sample.content || !sample.member) {
                console.warn("数据可能缺少关键字段 (content, member)", sample);
            }
        }

        if (comments.length === 0) {
            throw new Error("解析成功，但评论列表为空。");
        }

        setRawData(comments);
        addLog(`JSON 导入成功: 获取到 ${comments.length} 条数据`);
        setFetchError(null);
      } catch (e: any) {
        setFetchError("解析失败: " + e.message);
        addLog("Error: " + e.message);
        setRawData([]);
      } finally {
        setIsLoadingData(false);
      }
    } else {
      // ONLINE MODE: Vercel Proxy
      addLog(`准备获取视频 ${bvId} 的评论...`);
      try {
        const comments = await fetchCommentsByBV(bvId, addLog);
        
        if (comments.length === 0) {
          setFetchError("未获取到评论数据。可能是视频无评论或接口请求失败。");
        }
        setRawData(comments);
      } catch (e: any) {
        setFetchError(e.message);
        setRawData([]);
      } finally {
        setIsLoadingData(false);
      }
    }
  };

  // Lottery Logic
  const startLottery = useCallback(() => {
    if (filteredPool.length === 0) return;
    setIsDrawing(true);

    const duration = 3000; // 3 seconds rolling
    const intervalTime = 50;
    let elapsed = 0;

    const interval = setInterval(() => {
      elapsed += intervalTime;
      const randomIdx = Math.floor(Math.random() * filteredPool.length);
      setCurrentCandidate(filteredPool[randomIdx]);

      if (elapsed >= duration) {
        clearInterval(interval);
        // Pick Final Winner
        const finalWinnerIdx = Math.floor(Math.random() * filteredPool.length);
        const winner = filteredPool[finalWinnerIdx];
        
        setWinners(prev => [...prev, { ...winner, wonAt: Date.now() }]);
        setIsDrawing(false);
      }
    }, intervalTime);
  }, [filteredPool]);

  const resetAll = () => {
    setWinners([]);
    setCurrentCandidate(null);
  };

  // Copy Results to Clipboard
  const handleCopyResults = () => {
    if (winners.length === 0) return;
    
    const lines = [
      `🎉 恭喜以下用户中奖 🎉`,
      `📺 视频: ${bvId}`,
      `🔑 关键词: ${settings.keywords.join(', ')}`,
      `--------------------------------`,
      ...winners.map((w, i) => `${i + 1}. ${w.member.uname} (LV${w.member.level_info?.current_level || '?'}) \n   💬 "${w.content?.message || ''}"`),
      `--------------------------------`,
      `📅 开奖时间: ${new Date().toLocaleString()}`
    ];
    
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('中奖名单已复制到剪贴板，可直接去 B 站发布！');
    }).catch(err => {
      console.error('Failed to copy', err);
      alert('复制失败，请手动复制');
    });
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#fb7299] p-2 rounded-lg text-white">
              <Gift className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">
              Bilibili <span className="text-[#fb7299]">Lucky Draw</span> Pro
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
             <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-green-500"/> 纯净版 (Vercel)</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Settings & Data */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Step 1: Data Source */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
              <Upload className="w-5 h-5 text-[#00aeec]" /> 数据来源
            </h2>
            
            <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
              <button 
                onClick={() => setDataMode('online')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${dataMode === 'online' ? 'bg-white text-[#fb7299] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Globe className="w-4 h-4" /> 在线获取
              </button>
              <button 
                onClick={() => setDataMode('json')}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${dataMode === 'json' ? 'bg-white text-[#fb7299] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <FileJson className="w-4 h-4" /> 粘贴 JSON
              </button>
            </div>

            {dataMode === 'online' ? (
              <div className="mb-4">
                 <label className="block text-sm font-medium text-gray-700 mb-1">Bilibili BV 号</label>
                 <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                     <span className="text-gray-400 text-sm font-bold">BV</span>
                   </div>
                   <input 
                      type="text"
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#fb7299] focus:border-transparent outline-none transition-all font-mono text-sm"
                      placeholder="1xx411c7mD"
                      value={bvId.startsWith('BV') ? bvId.substring(2) : bvId}
                      onChange={(e) => setBvId('BV' + e.target.value.replace(/^(BV|bv)/, ''))}
                    />
                 </div>
                 
                 <div className="mt-2 p-2 rounded-lg text-xs flex items-start gap-2 bg-blue-50 text-blue-700">
                    <CloudLightning className="w-4 h-4 shrink-0" />
                    <span>通过 Vercel 云端代理加速，稳定绕过 B 站风控。</span>
                 </div>
              </div>
            ) : (
                <div className="mb-4">
                   <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700">JSON 数据</label>
                      <span className="text-xs text-gray-400">支持 API 响应或数组</span>
                   </div>
                   <div className="relative">
                      <Code className="absolute top-3 left-3 w-4 h-4 text-gray-400" />
                      <textarea
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#fb7299] focus:border-transparent outline-none transition-all font-mono text-xs h-32 resize-y bg-gray-50 text-gray-600"
                        placeholder={'在此粘贴 JSON...\n例如:\n[\n  {\n    "content": {"message": "接好运"},\n    "member": {"uname": "Test", "mid": "123"}\n  }\n]'}
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                      />
                   </div>
                </div>
            )}

            <Button 
              onClick={handleLoadData} 
              className="w-full"
              isLoading={isLoadingData}
            >
              {dataMode === 'json' ? '解析并加载数据' : (rawData.length > 0 ? <><RefreshCw className="w-4 h-4 mr-2"/> 重新获取</> : '加载评论数据')}
            </Button>
            
            {fetchError && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-start gap-2 max-h-32 overflow-y-auto">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="break-all whitespace-pre-wrap">{fetchError}</span>
              </div>
            )}
            
            {rawData.length > 0 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 animate-fade-in">
                <span>获取总数:</span>
                <span className="font-bold font-mono text-gray-800">{rawData.length} 条</span>
              </div>
            )}

            {/* Debug Console */}
            <div className="mt-4">
                 <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                    <Terminal className="w-3 h-3" /> 操作日志
                 </div>
                 <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-[10px] font-mono h-32 overflow-y-auto shadow-inner leading-relaxed">
                    {logs.length === 0 ? (
                      <span className="text-gray-600 italic">// 等待操作...</span>
                    ) : (
                      logs.map((log, i) => <div key={i}>{log}</div>)
                    )}
                    <div ref={logsEndRef} />
                 </div>
              </div>

          </section>

          {/* Step 2: Rules */}
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-[#00aeec]" /> 方案配置
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">筛选关键词</label>
                <input 
                  type="text" 
                  value={inputKeywords}
                  onChange={(e) => setInputKeywords(e.target.value)}
                  onBlur={handleKeywordBlur}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#fb7299] outline-none text-sm transition-all"
                  placeholder="例如: 接好运, 想要"
                />
                <div className="flex flex-wrap gap-2 mt-2">
                  {settings.keywords.map((k, i) => (
                    <span key={i} className="px-2 py-0.5 bg-pink-50 text-[#fb7299] text-xs rounded-full border border-pink-100">
                      {k}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 cursor-pointer" htmlFor="filter-dup">UID 去重 (每人限一次)</label>
                <input 
                  id="filter-dup"
                  type="checkbox" 
                  checked={settings.filterDuplicates}
                  onChange={(e) => setSettings(s => ({...s, filterDuplicates: e.target.checked}))}
                  className="w-5 h-5 text-[#fb7299] rounded border-gray-300 focus:ring-[#fb7299] cursor-pointer"
                />
              </div>

               <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">最低等级要求 (门槛)</label>
                <select 
                  value={settings.minLevel}
                  onChange={(e) => setSettings(s => ({...s, minLevel: Number(e.target.value)}))}
                  className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none cursor-pointer"
                >
                  <option value={0}>无限制 (Lv0+)</option>
                  <option value={1}>Lv1 (正式会员)</option>
                  <option value={2}>Lv2</option>
                  <option value={3}>Lv3</option>
                  <option value={4}>Lv4</option>
                  <option value={5}>Lv5</option>
                  <option value={6}>Lv6 (大佬)</option>
                </select>
              </div>
            </div>

             <div className="mt-4 pt-4 border-t border-gray-100">
               <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">有效参与池:</span>
                  <span className={`font-bold font-mono transition-colors duration-300 ${filteredPool.length === 0 ? 'text-gray-400' : 'text-[#fb7299] text-lg'}`}>
                    {filteredPool.length}
                  </span>
               </div>
             </div>
          </section>
        </div>

        {/* Right Column: Stage & Results */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Stage */}
          <section className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden min-h-[400px] flex flex-col">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-bold text-gray-700 flex items-center gap-2">
                <Users className="w-5 h-5" /> 抽奖大屏
              </h2>
              {winners.length > 0 && (
                 <div className="flex gap-2">
                   <button onClick={handleCopyResults} className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-md hover:bg-gray-50 hover:text-[#fb7299] flex items-center gap-1 transition-colors font-medium text-gray-600">
                     <Copy className="w-3 h-3" /> 复制名单
                   </button>
                   <button onClick={resetAll} className="text-xs bg-white border border-gray-200 px-3 py-1.5 rounded-md hover:bg-red-50 hover:text-red-500 flex items-center gap-1 transition-colors font-medium text-gray-600">
                     <Trash2 className="w-3 h-3" /> 清空
                   </button>
                 </div>
              )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed relative">
              
              {/* Slot Machine Display */}
              <div className={`relative w-full max-w-md aspect-video bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border-4 border-gray-800 flex items-center justify-center transition-all duration-300 ${isDrawing ? 'scale-105 ring-4 ring-[#fb7299]' : 'hover:shadow-3xl'}`}>
                
                {/* Background Decor */}
                <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-purple-600 to-blue-600"></div>

                {/* Content */}
                {isDrawing && currentCandidate ? (
                  <div className="text-center z-10 animate-pulse">
                     <img 
                      src={currentCandidate.member?.avatar || 'https://ui-avatars.com/api/?background=random'} 
                      className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-white shadow-lg object-cover"
                      alt="avatar"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${currentCandidate.member?.uname || 'User'}&background=random`;
                      }}
                    />
                    <div className="text-2xl font-bold text-white mb-2 text-shadow">{currentCandidate.member?.uname || 'Unknown'}</div>
                    <div className="text-white/70 text-sm max-w-[80%] mx-auto truncate px-2">
                      {currentCandidate.content?.message || '...'}
                    </div>
                  </div>
                ) : filteredPool.length > 0 ? (
                  <div className="text-center z-10">
                     <div className="w-20 h-20 bg-white/10 rounded-full mx-auto mb-4 flex items-center justify-center text-white/50 backdrop-blur-sm">
                        <Gift className="w-10 h-10 animate-bounce-slow" />
                     </div>
                     <div className="text-white/50 text-lg font-medium">
                       {winners.length > 0 ? "准备抽取下一位..." : "准备就绪"}
                     </div>
                  </div>
                ) : (
                   <div className="text-center z-10 text-white/40 flex flex-col items-center">
                      <AlertCircle className="w-12 h-12 mb-2 opacity-50" />
                      <p>请先加载数据</p>
                   </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-8 flex gap-4">
                 <Button 
                  size="lg" 
                  onClick={startLottery} 
                  disabled={isDrawing || filteredPool.length === 0}
                  className="min-w-[200px] shadow-xl text-lg font-bold transform transition-transform active:scale-95"
                >
                  {isDrawing ? "抽奖中..." : winners.length > 0 ? "再抽一位" : "开始抽奖"}
                  {!isDrawing && <Play className="w-5 h-5 ml-2 fill-current" />}
                 </Button>
              </div>

            </div>
          </section>

          {/* Winners List */}
          {winners.length > 0 && (
            <section className="animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6 text-green-500" /> 
                  中奖名单 ({winners.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {winners.map((winner, idx) => (
                  <WinnerCard key={winner.wonAt} winner={winner} index={idx} />
                ))}
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;