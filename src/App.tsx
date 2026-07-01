import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  Search, 
  X, 
  Share2, 
  Tv, 
  Film, 
  Download, 
  Star, 
  Shuffle, 
  Check, 
  AlertTriangle,
  Heart,
  ExternalLink,
  ChevronRight,
  Smartphone,
  Plus
} from 'lucide-react';

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  media_type: 'movie' | 'tv';
  adult?: boolean;
  original_language?: string;
}

interface TVDetails {
  seasons?: Array<{
    id: number;
    season_number: number;
    air_date?: string;
  }>;
}

const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
};

export default function App() {
  const today = new Date().toISOString().split('T')[0];

  // TMDB API Key state, loaded from localStorage if exists
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('watchshare_tmdb_api_key') || '');
  const [tempApiKey, setTempApiKey] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);

  const [query, setQuery] = useState('');
  const [movies, setMovies] = useState<TMDBItem[]>([]);
  const [series, setSeries] = useState<TMDBItem[]>([]);
  const [suggestions, setSuggestions] = useState<TMDBItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TMDBItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bgColor, setBgColor] = useState('#000000');
  const [bgOpacity, setBgOpacity] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  const [showAllMovies, setShowAllMovies] = useState(false);
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [showSeasonEpisode, setShowSeasonEpisode] = useState(false);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState<number | 'none'>('none');
  const [tvDetails, setTvDetails] = useState<TVDetails>({ seasons: [] });
  const [availableEpisodes, setAvailableEpisodes] = useState(1);
  const [customPoster, setCustomPoster] = useState<string | null>(null);
  const [allPosters, setAllPosters] = useState<string[]>([]);
  const [personalRating, setPersonalRating] = useState(0);
  const [logoTapped, setLogoTapped] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);

  // PWA states
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installButtonPermanentlyHidden] = useState(() => {
    return localStorage.getItem('watchshare_install_prompt_hidden') === 'true';
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const suggestionRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isTvSelected = selectedItem && (selectedItem.media_type === 'tv' || !selectedItem.title);

  // Initialize tempApiKey when the modal is opened
  useEffect(() => {
    if (showKeyModal) {
      setTempApiKey(apiKey);
    }
  }, [showKeyModal, apiKey]);

  // Handle clicking outside suggestions to close them
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check PWA installation status and listen to browser install availability
  useEffect(() => {
    const checkInstalled = async () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
      const isStoredInstalled = localStorage.getItem('watchshare_installed') === 'true';
      
      let isRelatedInstalled = false;
      if ((navigator as any).getInstalledRelatedApps) {
        try {
          const relatedApps = await (navigator as any).getInstalledRelatedApps();
          isRelatedInstalled = relatedApps.length > 0;
        } catch (e) {
          console.log('getInstalledRelatedApps check bypassed', e);
        }
      }

      const installed = !!(isStandalone || isStoredInstalled || isRelatedInstalled);
      if (installed) {
        setIsInstalled(true);
        if (isStandalone || isRelatedInstalled) {
          localStorage.setItem('watchshare_installed', 'true');
        }
      } else {
        // Automatically trigger the install modal at start if not installed
        setTimeout(() => {
          setShowInstallModal(true);
        }, 1500);
      }
    };
    checkInstalled();

    const handlePromptReady = () => {
      setInstallPrompt((window as any).deferredPrompt);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      localStorage.setItem('watchshare_installed', 'true');
    };
    
    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    if ((window as any).deferredPrompt) {
      handlePromptReady();
    }
    
    return () => {
      window.removeEventListener('pwa-prompt-ready', handlePromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Fetch quick suggestions while typing
  useEffect(() => {
    if (!apiKey) return;
    if (loading || !isFocused) {
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(() => {
      if (query.trim().length > 2) {
        fetchSuggestions(query.trim());
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, loading, isFocused, apiKey]);

  // Fetch TV Details if TV show is selected
  useEffect(() => {
    if (selectedItem && isTvSelected && apiKey) {
      fetchTvData(selectedItem.id);
    }
  }, [selectedItem, apiKey]);

  // Fetch Season Details if season is changed for TV show
  useEffect(() => {
    if (selectedItem && isTvSelected && season && apiKey) {
      fetchSeasonData(selectedItem.id, season);
    }
  }, [selectedItem, season, apiKey]);

  // Fetch alternative posters for selected item
  useEffect(() => {
    if (selectedItem && apiKey) {
      const type = selectedItem.media_type || (selectedItem.title ? 'movie' : 'tv');
      const initial = [];
      if (selectedItem.poster_path) {
        initial.push(selectedItem.poster_path);
      }
      setAllPosters(initial);
      setCustomPoster(null);
      fetchPosters(type, selectedItem.id, selectedItem.original_language);
    } else {
      setAllPosters([]);
      setCustomPoster(null);
    }
  }, [selectedItem, apiKey]);

  const saveApiKey = (key: string) => {
    const trimmed = key.trim();
    localStorage.setItem('watchshare_tmdb_api_key', trimmed);
    setApiKey(trimmed);
    setShowKeyModal(false);
    setError(null);
  };

  const fetchSuggestions = async (q: string) => {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&query=${encodeURIComponent(q)}&language=en-US&page=1&include_adult=false`);
      if (!res.ok) throw new Error('Failed to fetch from TMDB');
      const data = await res.json();
      const filtered = (data.results || [])
        .filter((i: any) => (i.media_type === 'movie' || i.media_type === 'tv') && i.poster_path && i.adult === false)
        .filter((i: any) => {
          const date = i.release_date || i.first_air_date;
          return date && date <= today;
        })
        .slice(0, 8); 
      
      if (!loading && isFocused) {
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      }
    } catch (e) { 
      console.error(e); 
    }
  };

  const fetchTvData = async (id: number) => {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${apiKey}&language=en-US`);
      if (!res.ok) throw new Error('Failed to fetch TV details');
      const detailData = await res.json();
      setTvDetails(detailData);
      
      const airedSeasons = (detailData.seasons || [])
        .filter((s: any) => s.season_number > 0 && s.air_date && s.air_date <= today);

      if (airedSeasons.length > 0) {
        const latest = airedSeasons.reduce((prev: any, curr: any) => (prev.season_number > curr.season_number ? prev : curr));
        setSeason(latest.season_number);
      } else {
        setSeason(detailData.seasons?.[0]?.season_number || 1);
      }
      setEpisode('none');
    } catch (err) { 
      console.error(err); 
    }
  };

  const fetchSeasonData = async (tvId: number, seasonNum: number) => {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${tvId}/season/${seasonNum}?api_key=${apiKey}&language=en-US`);
      if (!res.ok) throw new Error('Failed to fetch Season details');
      const data = await res.json();
      if (data.episodes) {
        const releasedEpisodes = data.episodes.filter((ep: any) => ep.air_date && ep.air_date <= today);
        setAvailableEpisodes(releasedEpisodes.length);
        setEpisode('none');
      }
    } catch (err) { 
      console.error(err); 
    }
  };

  const fetchPosters = async (type: string, id: number, origLang?: string) => {
    try {
      const includeLangs = `en,null,xx${origLang ? `,${origLang}` : ''}`;
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}/images?api_key=${apiKey}&include_image_language=${includeLangs}`);
      if (!res.ok) throw new Error('Failed to fetch images');
      const data = await res.json();
      if (data.posters && data.posters.length > 0) {
        let filtered = data.posters.filter((p: any) => p.iso_639_1 === 'en');
        
        if (filtered.length === 0 && origLang) {
          filtered = data.posters.filter((p: any) => p.iso_639_1 === origLang);
        }
        
        if (filtered.length === 0) {
          filtered = data.posters.filter((p: any) => p.iso_639_1 === null || p.iso_639_1 === 'xx');
        }
        
        if (filtered.length === 0) {
          filtered = data.posters;
        }

        const paths = [...new Set(filtered.map((p: any) => p.file_path))].filter(Boolean) as string[];
        setAllPosters(paths);

        if (paths.length > 0) {
          setCustomPoster(paths[0]);
        }
      }
    } catch (e) { 
      console.error(e); 
    }
  };

  const searchAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    
    setShowSuggestions(false);
    setSuggestions([]);
    setIsFocused(false); 
    
    if (inputRef.current) {
      inputRef.current.blur(); 
    }
    
    if (!apiKey) {
      setError('TMDb API Key is missing. Please click the gear icon in the top right of the header to configure your API key first.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setHasSearched(false);
    
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`),
        fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`)
      ]);

      if (!movieRes.ok || !tvRes.ok) {
        throw new Error('Please double check your TMDB API Key. Make sure it is active and correct.');
      }

      const movieData = await movieRes.json();
      const tvData = await tvRes.json();
      
      setMovies((movieData.results || [])
        .filter((i: any) => i.poster_path && i.release_date && i.release_date <= today && i.adult === false)
        .map((item: any) => ({...item, media_type: 'movie'}))
      );
      setSeries((tvData.results || [])
        .filter((i: any) => i.poster_path && i.first_air_date && i.first_air_date <= today && i.adult === false)
        .map((item: any) => ({...item, media_type: 'tv'}))
      );
    } catch (err: any) { 
      setError(err.message || 'An error occurred while connecting to TMDB'); 
    } finally { 
      setLoading(false); 
      setHasSearched(true); 
    }
  };

  const resetHome = () => {
    setQuery('');
    setMovies([]);
    setSeries([]);
    setSelectedItem(null);
    setHasSearched(false);
    setError(null);
  };

  const getBalancedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' '), lines = []; 
    let line = '';
    for (let n = 0; n < words.length; n++) {
      let test = line + words[n] + ' ';
      if (ctx.measureText(test).width > maxWidth && n > 0) { 
        lines.push(line.trim()); 
        line = words[n] + ' '; 
      } else { 
        line = test; 
      }
    }
    lines.push(line.trim());
    return lines;
  };

  const getSmartTitle = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    if (!text) return [];
    const upperTitle = text.toUpperCase();
    const fontSize = 70;
    ctx.font = `500 ${fontSize}px 'Barlow Condensed', sans-serif`;
    
    let lines = getBalancedLines(ctx, upperTitle, maxWidth);
    
    if (lines.length > 2) {
      if (upperTitle.includes(':') || upperTitle.includes(',')) {
        const firstPart = upperTitle.split(/[:|,]/)[0].trim();
        return getBalancedLines(ctx, firstPart, maxWidth).slice(0, 2);
      } else {
        const firstTwo = lines.slice(0, 2);
        let lastLine = firstTwo[1];
        while (ctx.measureText(lastLine + "...").width > maxWidth && lastLine.length > 0) {
          lastLine = lastLine.slice(0, -1);
        }
        firstTwo[1] = lastLine.trim() + "...";
        return firstTwo;
      }
    }
    return lines;
  };

  const generateStoryImage = async (item: TMDBItem): Promise<Blob | null> => {
    if (!canvasRef.current) return null;
    setGenerating(true);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = 1080; 
    canvas.height = 1920;

    const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { 
      ctx.beginPath(); 
      ctx.roundRect(x, y, w, h, r); 
      ctx.closePath(); 
    };

    try {
      // 1. Draw solid background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const isTv = item.media_type === 'tv' || !item.title;
      const posterToUse = customPoster || item.poster_path;

      // 2. Draw blurred backdrop image
      let bgImgLoaded = false;
      const bgImg = new Image();
      bgImg.crossOrigin = "anonymous";
      bgImg.src = item.backdrop_path 
        ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` 
        : `${TMDB_IMAGE_BASE}${posterToUse}`;
      
      await new Promise<void>(resolve => {
        bgImg.onload = () => {
          bgImgLoaded = true;
          resolve();
        };
        bgImg.onerror = () => {
          bgImgLoaded = false;
          resolve();
        };
      });

      if (bgImgLoaded && bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
        ctx.save(); 
        ctx.globalAlpha = 0.45; 
        ctx.filter = 'blur(25px)';
        const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height);
        const x = (canvas.width / 2) - (bgImg.width / 2) * scale;
        const y = (canvas.height / 2) - (bgImg.height / 2) * scale;
        ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
        ctx.restore();
      }

      // 3. Draw gradient mask overlays matching the selected background color
      const rgbColor = hexToRgb(bgColor);
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, `rgba(${rgbColor}, ${bgOpacity * 0.1})`);
      grad.addColorStop(1, `rgba(${rgbColor}, ${bgOpacity})`);
      ctx.fillStyle = grad; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 4. Draw main crisp poster
      let imgLoaded = false;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `${TMDB_IMAGE_BASE}${posterToUse}`;
      await new Promise<void>(resolve => {
        img.onload = () => {
          imgLoaded = true;
          resolve();
        };
        img.onerror = () => {
          imgLoaded = false;
          resolve();
        };
      });

      if (imgLoaded && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const pw = 640, ph = 960, px = (canvas.width - pw) / 2, py = 280;
        const radius = 45; 
        
        ctx.save(); 
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; 
        ctx.shadowBlur = 70; 
        ctx.shadowOffsetY = 30;
        drawRoundedRect(ctx, px, py, pw, ph, radius); 
        ctx.save(); 
        ctx.clip(); 
        ctx.drawImage(img, px, py, pw, ph); 
        ctx.restore();
        
        // Poster stroke outline
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();
        ctx.restore();
      }

      // 5. Draw Title text
      ctx.fillStyle = '#ffffff'; 
      ctx.textAlign = 'center';
      
      const fontSize = 70;
      ctx.font = `500 ${fontSize}px 'Barlow Condensed', sans-serif`;
      const titleLines = getSmartTitle(ctx, (item.title || item.name || ''), 750);
      
      const lineHeight = fontSize + 12;
      const totalHeight = titleLines.length * lineHeight;
      
      let currentY = 1425 - (totalHeight / 2); 
      if (titleLines.length > 1) {
        currentY += 35; // Shifting multi-line titles slightly down for improved alignment
      }
      
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; 
      ctx.shadowBlur = 15; 
      ctx.shadowOffsetY = 5;
      
      titleLines.forEach(l => { 
        ctx.fillText(l.trim(), canvas.width / 2, currentY); 
        currentY += lineHeight; 
      });
      ctx.shadowBlur = 0; 
      ctx.shadowOffsetY = 0;

      // 6. Draw season and episode for series
      if (isTv && showSeasonEpisode) {
        ctx.font = '500 24px Inter, sans-serif'; 
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        const epText = episode === 'none' ? "" : ` E${episode.toString().padStart(2, '0')}`;
        ctx.fillText(`S${season.toString().padStart(2, '0')}${epText}`, canvas.width / 2, currentY - 35);
        currentY += 45; 
      } else { 
        currentY += 35; 
      }

      // 7. Draw metadata info pill
      ctx.font = '500 34px Inter, sans-serif';
      const yearTxt = (item.release_date || item.first_air_date || 'N/A').split('-')[0];
      const ratingTxt = `★ ${item.vote_average.toFixed(1)}`;
      const typeTxt = isTv ? 'SERIES' : 'MOVIE';
      
      const yearW = ctx.measureText(yearTxt).width;
      const ratingW = ctx.measureText(ratingTxt).width;
      const typeW = ctx.measureText(typeTxt).width;
      const dotSpace = 44;
      const totalTextW = yearW + ratingW + typeW + (dotSpace * 2);
      const boxW = totalTextW + 90;
      const boxH = 72;
      const boxX = (canvas.width - boxW) / 2;
      const boxRadius = 36;
      const boxY = currentY - 50;

      ctx.save(); 
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, boxRadius); 
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; 
      ctx.fill();
      ctx.lineWidth = 2; 
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; 
      ctx.stroke(); 
      ctx.restore();

      let detailX = boxX + 45; 
      const textBaselineY = boxY + boxH / 2 + 2;
      
      ctx.save(); 
      ctx.textBaseline = 'middle'; 
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff'; 
      ctx.fillText(yearTxt, detailX, textBaselineY); 
      detailX += yearW + dotSpace/2;
      
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; 
      ctx.beginPath(); 
      ctx.arc(detailX, textBaselineY, 4.5, 0, Math.PI * 2); 
      ctx.fill(); 
      detailX += dotSpace/2;
      
      ctx.fillStyle = '#facc15'; 
      ctx.fillText(ratingTxt, detailX, textBaselineY); 
      detailX += ratingW + dotSpace/2;
      
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; 
      ctx.beginPath(); 
      ctx.arc(detailX, textBaselineY, 4.5, 0, Math.PI * 2); 
      ctx.fill(); 
      detailX += dotSpace/2;
      
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; 
      ctx.fillText(typeTxt, detailX, textBaselineY); 
      ctx.restore();

      // 8. Draw personal star ratings
      if (personalRating > 0) {
        const starOuter = 16;
        const starInner = 7.5;
        const starGap = 12;
        const starWidth = starOuter * 2;
        const totalStarsWidth = (5 * starWidth) + (4 * starGap);
        let startX = (canvas.width - totalStarsWidth) / 2 + starOuter;
        const starY = boxY + boxH + 45;
        for (let i = 1; i <= 5; i++) {
          ctx.fillStyle = i <= personalRating ? '#facc15' : 'rgba(255, 255, 255, 0.25)';
          drawStarPath(ctx, startX, starY, 5, starOuter, starInner); 
          startX += starWidth + starGap;
        }
      }

      // 9. Draw attribution logo/text watermarks gracefully without requiring missing local files
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("WATCHSHARE", canvas.width / 2, 1800);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.font = '500 16px Inter, sans-serif';
      ctx.fillText("TMDB CONNECTION ACTIVE", canvas.width / 2, 1830);
      ctx.restore();

      const blob = await new Promise<Blob | null>(res => {
        canvas.toBlob(b => res(b), 'image/jpeg', 0.95);
      });
      setGenerating(false); 
      return blob;
    } catch (e) { 
      console.error(e); 
      setGenerating(false); 
      return null;
    }
  };

  const drawStarPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) => {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;
    ctx.beginPath(); 
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius; 
      y = cy + Math.sin(rot) * outerRadius; 
      ctx.lineTo(x, y); 
      rot += step;
      x = cx + Math.cos(rot) * innerRadius; 
      y = cy + Math.sin(rot) * innerRadius; 
      ctx.lineTo(x, y); 
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius); 
    ctx.closePath(); 
    ctx.fill();
  };

  const handleShare = async (item: TMDBItem) => {
    const blob = await generateStoryImage(item);
    if (!blob) return;
    const file = new File([blob], `watchshare-${item.id}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { 
        await navigator.share({ files: [file], title: item.title || item.name }); 
      } catch (err) { 
        downloadImage(blob, item.title || item.name || 'story'); 
      }
    } else { 
      downloadImage(blob, item.title || item.name || 'story'); 
    }
  };

  const downloadImage = (blob: Blob, title: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; 
    a.download = `watchshare-${title.toLowerCase().replace(/\s+/g, '-')}.jpg`; 
    a.click();
    URL.revokeObjectURL(url);
  };

  const isIOS = typeof window !== 'undefined' && 
    (/iPad|iPhone|iPod/.test(navigator.userAgent) || 
     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && 
    !(window as any).MSStream;

  const handleInstallApp = async () => {
    if (!installPrompt) return;
    try {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setInstallPrompt(null);
        setShowInstallModal(false);
      }
    } catch (err) {
      console.error('PWA prompt failed', err);
    }
  };

  const handleRandomizePoster = () => {
    if (allPosters.length > 1) {
      let filtered = allPosters.filter(p => p !== activePoster);
      if (filtered.length === 0) filtered = allPosters;
      const randomPoster = filtered[Math.floor(Math.random() * filtered.length)];
      setCustomPoster(randomPoster);
    }
  };

  const getPreviewLines = () => {
    if (!selectedItem) return [];
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return [];
    return getSmartTitle(tempCtx, (selectedItem.title || selectedItem.name || ''), 750);
  };

  const previewLines = getPreviewLines();
  const activePoster = customPoster || selectedItem?.poster_path || '';
  const backdropUrl = selectedItem?.backdrop_path 
    ? `https://image.tmdb.org/t/p/w1280${selectedItem.backdrop_path}` 
    : `${TMDB_IMAGE_BASE}${activePoster}`;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black flex flex-col font-inter relative">
      
      {/* Dynamic Header */}
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-xl px-6 py-4 flex items-center justify-between border-b border-white/10">
        <div 
          className="flex items-center gap-2 cursor-pointer hover:opacity-85 transition-opacity" 
          onClick={resetHome}
        >
          <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-bold font-oswald text-lg text-white shadow-md">W</div>
          <span className="font-oswald text-xl uppercase tracking-wider font-bold">
            WATCH<span className="text-red-500 font-black">SHARE</span>
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* TMDB API Key settings trigger */}
          <button 
            onClick={() => setShowKeyModal(true)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border ${
              apiKey 
                ? 'bg-neutral-900 border-white/10 text-neutral-300 hover:bg-neutral-800' 
                : 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border-yellow-500/20 animate-pulse'
            }`}
            title={apiKey ? 'API Key Configured' : 'Setup API Key'}
          >
            <Settings size={16} />
          </button>

          <button 
            onClick={() => setShowDonateModal(true)} 
            className="px-4 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-full border border-red-500/20 transition-all text-xs font-bold"
          >
            <span>Donate</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-6 flex-grow w-full pb-12">
        
        {/* Missing API Key Warning / Prompt banner */}
        {!apiKey && (
          <div className="bg-neutral-900/90 border border-yellow-500/30 rounded-3xl p-6 mb-8 shadow-2xl animate-slide-up flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-yellow-500 font-bold">
                <AlertTriangle size={20} />
                <h3 className="text-lg">TMDB API Key Required</h3>
              </div>
              <p className="text-neutral-400 text-sm max-w-xl leading-relaxed font-inter">
                WatchShare uses the official TMDb (The Movie Database) API to fetch posters, dates, ratings, and backdrops. Please add your personal free API key to start editing canvases.
              </p>
            </div>
            <button 
              onClick={() => setShowKeyModal(true)}
              className="bg-yellow-500 text-black px-6 py-3 rounded-2xl font-bold text-sm hover:scale-105 active:scale-95 transition-all uppercase tracking-wider whitespace-nowrap shrink-0 shadow-lg"
            >
              Configure Now
            </button>
          </div>
        )}

        {/* Query Search Form */}
        <div className="relative mb-12 mt-2" ref={suggestionRef}>
          <form onSubmit={searchAll}>
            <input 
              ref={inputRef}
              type="text" 
              placeholder="Search movies or TV series..." 
              value={query} 
              onFocus={() => { 
                setIsFocused(true);
              }}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
              onChange={(e) => setQuery(e.target.value)} 
              autoComplete="off"
              className="w-full bg-neutral-900/40 border border-white/15 rounded-3xl py-5 pl-14 pr-6 focus:ring-2 focus:ring-red-500 outline-none text-lg transition-all shadow-2xl font-inter placeholder:text-neutral-500" 
            />
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400">
              <Search size={22} />
            </div>
          </form>

          {/* Quick suggestions drop-down */}
          {showSuggestions && apiKey && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-900/95 backdrop-blur-3xl border border-white/10 rounded-3xl overflow-hidden z-40 shadow-2xl animate-slide-up">
              {suggestions.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => { 
                    setSelectedItem(item); 
                    setShowSuggestions(false); 
                    setIsFocused(false); 
                    if (inputRef.current) inputRef.current.blur(); 
                  }} 
                  className="px-6 py-3.5 hover:bg-white/5 cursor-pointer flex flex-row items-center gap-2 border-b border-white/5 last:border-0 overflow-hidden"
                >
                  <span className="text-sm font-semibold font-inter tracking-tight truncate flex-1 uppercase">{item.title || item.name}</span>
                  <span className="text-[10px] text-neutral-400 font-inter shrink-0 uppercase tracking-tighter">
                    {(item.release_date || item.first_air_date || 'N/A').split('-')[0]} • {item.media_type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-neutral-500 text-sm font-medium uppercase tracking-widest font-inter">Fetching data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl flex items-start gap-3 max-w-xl mx-auto my-12">
            <AlertTriangle className="shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-bold">{!apiKey ? 'API Key Required' : 'Error Connecting to TMDB'}</h4>
              <p className="text-sm text-neutral-300 leading-relaxed">{error}</p>
              <button 
                onClick={() => setShowKeyModal(true)} 
                className="text-xs text-red-400 underline font-bold hover:text-red-300 block"
              >
                {!apiKey ? 'Configure TMDb API Key' : 'Update / Change TMDB API Key'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-16 pb-12">
            
            {/* If no search is perform yet, display intro message */}
            {!hasSearched && movies.length === 0 && series.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4 space-y-6">
                <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center border border-white/10 shadow-inner">
                  <Film size={36} className="text-neutral-500" />
                </div>
                <div className="space-y-2 max-w-sm">
                  <h2 className="text-xl font-bold">Start Story Canvas</h2>
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    Search for movies or TV series, select your favorites, customize the backgrounds, ratings, and instantly download fully sized social media stories.
                  </p>
                </div>
              </div>
            )}

            {/* Movies Section */}
            {movies.length > 0 && (
              <section className="animate-slide-up">
                <div className="flex justify-between items-end mb-6">
                  <h2 className="text-2xl font-oswald font-light uppercase tracking-wide">Movies</h2>
                  {movies.length > 4 && (
                    <button 
                      onClick={() => setShowAllMovies(!showAllMovies)} 
                      className="text-xs font-inter font-bold text-neutral-400 hover:text-white uppercase tracking-wider transition-colors pb-1"
                    >
                      {showAllMovies ? 'Show Less' : 'Show All'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {(showAllMovies ? movies : movies.slice(0, 4)).map(item => (
                    <div 
                      key={`movie-${item.id}`}
                      onClick={() => setSelectedItem(item)} 
                      className="group relative aspect-[2/3] bg-neutral-900 rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all transform active:scale-95"
                    >
                      <img 
                        src={`${TMDB_IMAGE_BASE}${item.poster_path}`} 
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                        loading="lazy" 
                      />
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-black border border-white/10 uppercase z-10 flex items-center gap-1">
                        <Film size={10} /> MOVIE
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-4 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs font-barlow leading-tight uppercase text-white">{item.title}</p>
                        <p className="text-[10px] text-yellow-500 mt-1 font-inter">★ {item.vote_average?.toFixed(1) || '0.0'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* TV Series Section */}
            {series.length > 0 && (
              <section className="animate-slide-up">
                <div className="flex justify-between items-end mb-6">
                  <h2 className="text-2xl font-oswald font-light uppercase tracking-wide">TV Series</h2>
                  {series.length > 4 && (
                    <button 
                      onClick={() => setShowAllSeries(!showAllSeries)} 
                      className="text-xs font-inter font-bold text-neutral-400 hover:text-white uppercase tracking-wider transition-colors pb-1"
                    >
                      {showAllSeries ? 'Show Less' : 'Show All'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {(showAllSeries ? series : series.slice(0, 4)).map(item => (
                    <div 
                      key={`tv-${item.id}`}
                      onClick={() => setSelectedItem(item)} 
                      className="group relative aspect-[2/3] bg-neutral-900 rounded-2xl overflow-hidden cursor-pointer border border-white/5 hover:border-white/20 transition-all transform active:scale-95"
                    >
                      <img 
                        src={`${TMDB_IMAGE_BASE}${item.poster_path}`} 
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                        loading="lazy" 
                      />
                      <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] font-black border border-white/10 uppercase z-10 flex items-center gap-1">
                        <Tv size={10} /> TV
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent p-4 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs font-barlow leading-tight uppercase text-white">{item.name}</p>
                        <p className="text-[10px] text-yellow-500 mt-1 font-inter">★ {item.vote_average?.toFixed(1) || '0.0'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 flex flex-col items-center gap-4 border-t border-white/5 pb-24">
        <div 
          onClick={() => setLogoTapped(!logoTapped)}
          className={`flex items-center gap-3 cursor-pointer transition-all duration-300 ${
            logoTapped ? 'opacity-100' : 'opacity-35 hover:opacity-60'
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-white/10 flex items-center justify-center font-bold text-white shadow-md">W</div>
          <div className="text-left font-oswald uppercase tracking-widest text-sm">
            <p className="font-light">CREATED WITH</p>
            <p className="font-black text-red-500">WATCHSHARE</p>
          </div>
        </div>
        <p className="text-[10px] uppercase font-normal tracking-widest text-center text-white/35 max-w-xs leading-relaxed font-inter">
          This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </footer>

      {/* TMDB API Key Setup Dialog */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-8 animate-slide-up shadow-2xl relative">
            <button 
              onClick={() => setShowKeyModal(false)} 
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            
            <div className="space-y-6 pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                  <Settings className="text-yellow-500" size={20} />
                </div>
                <h3 className="text-xl font-bold tracking-tight">TMDB API Settings</h3>
              </div>

              <div className="space-y-4">
                <p className="text-white/60 text-sm leading-relaxed font-inter">
                  To search and generate cards, copy your TMDB API Key (v3 auth) below. We store it locally in your browser so you don't need to reconfigure it.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">API Key (v3 auth)</label>
                  <input 
                    type="text" 
                    placeholder="Enter your 32-character API key..."
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-2xl py-3.5 px-4 focus:ring-2 focus:ring-yellow-500 outline-none text-sm transition-all font-mono placeholder:text-neutral-600"
                  />
                </div>
              </div>

              {/* Instructions on how to get TMDB Key */}
              <div className="bg-neutral-950/80 border border-white/5 rounded-2xl p-4 space-y-3">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">How to get a free API Key:</span>
                <ol className="text-xs text-neutral-400 space-y-2 list-decimal pl-4 leading-relaxed font-inter">
                  <li>
                    Register/Login to <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="text-yellow-500 underline inline-flex items-center gap-0.5 hover:text-yellow-400">TheMovieDB <ExternalLink size={10} /></a>
                  </li>
                  <li>Go to your Account Settings → <span className="text-white font-medium">API</span></li>
                  <li>Request an API Key (select "Developer" type and fill forms)</li>
                  <li>Copy the <span className="text-yellow-500 font-mono">API Key (v3 auth)</span> and paste above!</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => saveApiKey(tempApiKey)}
                  className="flex-1 py-4 bg-white text-black font-bold rounded-2xl hover:bg-neutral-200 transition-all text-sm uppercase tracking-wider"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Donate Modal */}
      {showDonateModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-neutral-900 border border-white/10 rounded-3xl p-8 animate-slide-up shadow-2xl relative">
            <button 
              onClick={() => setShowDonateModal(false)} 
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <div className="flex flex-col items-center text-center gap-6 pt-4">
              <h3 className="text-xl font-bold tracking-tight">Support WatchShare</h3>
              <p className="text-white/60 text-sm leading-relaxed font-inter">
                If you enjoy using this tool, consider supporting development with a donation:
              </p>
              
              <div className="w-full space-y-4 mt-2">
                <a 
                  href="https://saweria.co/mchammadr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={() => setShowDonateModal(false)}
                  className="flex items-center justify-between bg-yellow-600/10 hover:bg-yellow-600/20 p-4 rounded-xl border border-yellow-500/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-yellow-500 text-black flex items-center justify-center font-bold text-xs shrink-0">ID</div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-yellow-500">Saweria</div>
                      <div className="text-[10px] text-white/40">Indonesia Payout</div>
                    </div>
                  </div>
                  <span className="text-xs text-yellow-500 font-bold group-hover:translate-x-1 transition-transform">→</span>
                </a>

                <a 
                  href="https://ko-fi.com/mchammadr_" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={() => setShowDonateModal(false)}
                  className="flex items-center justify-between bg-pink-600/10 hover:bg-pink-600/20 p-4 rounded-xl border border-pink-500/20 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-pink-500 text-white flex items-center justify-center font-bold text-xs shrink-0">INT</div>
                    <div className="text-left">
                      <div className="text-sm font-bold text-pink-400">Ko-fi</div>
                      <div className="text-[10px] text-white/40">International Payout</div>
                    </div>
                  </div>
                  <span className="text-xs text-pink-400 font-bold group-hover:translate-x-1 transition-transform">→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Install PWA Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-sm bg-neutral-900 border border-white/10 rounded-3xl p-6 sm:p-8 animate-slide-up shadow-2xl relative text-center">
            <button 
              onClick={() => setShowInstallModal(false)} 
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <div className="mx-auto w-16 h-16 rounded-2xl bg-neutral-800 border border-white/5 flex items-center justify-center text-green-500 shadow-xl mb-6">
              <Smartphone size={32} className="animate-pulse" />
            </div>

            <h3 className="text-xl font-bold tracking-tight mb-2 uppercase font-barlow text-white">
              Install WatchShare App
            </h3>
            <p className="text-white/60 text-xs leading-relaxed font-inter mb-6">
              Save WatchShare directly to your mobile home screen to create and share canvas stories instantly, full-screen, with faster loading speeds.
            </p>

            {isIOS ? (
              /* iOS Safari Guide */
              <div className="space-y-4 text-left">
                <div className="bg-neutral-950/80 border border-white/5 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center font-bold text-xs text-red-500">1</span>
                    <p className="text-xs text-neutral-300 font-inter leading-relaxed">
                      Make sure you are browsing in <span className="text-white font-semibold">Safari</span>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center font-bold text-xs text-red-500">2</span>
                    <p className="text-xs text-neutral-300 font-inter leading-relaxed flex items-center gap-1.5 flex-wrap">
                      Tap the <span className="text-white font-semibold flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[11px]">Share <Share2 size={10} className="inline text-red-500" /></span> icon at the bottom of Safari.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center font-bold text-xs text-red-500">3</span>
                    <p className="text-xs text-neutral-300 font-inter leading-relaxed flex items-center gap-1.5 flex-wrap">
                      Scroll down and select <span className="text-white font-semibold flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[11px]">Add to Home Screen <Plus size={10} className="inline text-green-500" /></span>.
                    </p>
                  </div>
                </div>
              </div>
            ) : installPrompt ? (
              /* Android/Desktop with installPrompt */
              <div className="space-y-4">
                <button 
                  onClick={handleInstallApp}
                  className="w-full py-4 bg-green-500 text-black font-bold rounded-2xl hover:bg-green-400 active:scale-95 transition-all text-sm uppercase tracking-wider animate-bounce"
                >
                  Create App Shortcut
                </button>
                <p className="text-[10px] text-neutral-500 font-inter">
                  Fires native Android/browser home screen shortcut installer.
                </p>
              </div>
            ) : (
              /* Android/Desktop manual fallback */
              <div className="space-y-4 text-left">
                <div className="bg-neutral-950/80 border border-white/5 rounded-2xl p-4 space-y-3">
                  <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">How to Install manually:</span>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600/10 border border-green-500/20 flex items-center justify-center font-bold text-xs text-green-500">1</span>
                    <p className="text-xs text-neutral-300 font-inter leading-relaxed">
                      Tap the <span className="text-white font-semibold bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[11px]">Three Dots (⋮)</span> menu icon in Chrome or your browser's address bar.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-600/10 border border-green-500/20 flex items-center justify-center font-bold text-xs text-green-500">2</span>
                    <p className="text-xs text-neutral-300 font-inter leading-relaxed">
                      Select <span className="text-white font-semibold bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[11px]">Install app</span> or <span className="text-white font-semibold bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-[11px]">Add to Home screen</span>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button 
              onClick={() => setShowInstallModal(false)}
              className="mt-6 w-full py-3.5 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-white/80 hover:text-white rounded-2xl font-bold text-xs uppercase tracking-wider transition-all border border-white/5"
            >
              Close instructions
            </button>
          </div>
        </div>
      )}

      {/* Canvas Story Customizer / Editor Overlay */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-lg flex flex-col items-center justify-start p-4 overflow-y-auto">
          <div className="absolute top-6 inset-x-6 flex justify-between items-center z-50">
            <span className="text-white/30 font-inter font-semibold tracking-widest uppercase text-xs pl-2 pointer-events-none">
              Canvas Editor Preview
            </span>
            <button 
              onClick={() => {
                setSelectedItem(null); 
                setSeason(1); 
                setEpisode('none'); 
                setTvDetails({ seasons: [] }); 
                setCustomPoster(null); 
                setPersonalRating(0);
              }} 
              className="p-2 text-white/60 hover:text-white transition-all bg-neutral-900/50 rounded-full hover:bg-neutral-800"
            >
              <X size={24} />
            </button>
          </div>
          
          <div className="w-full max-w-[440px] flex flex-col gap-6 pt-16 pb-12 animate-slide-up origin-top">
            
            {/* Realtime Live Interactive Canvas Preview Container */}
            <div 
              className="relative aspect-[9/16] w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-neutral-950 story-container" 
              style={{ backgroundColor: bgColor }}
            >
              {/* Blurred background image layer */}
              <div className="absolute inset-0 z-0 pointer-events-none transition-opacity opacity-[0.45]">
                <img src={backdropUrl} crossOrigin="anonymous" className="absolute inset-0 w-full h-full object-cover scale-[1.25] blur-[12px]" />
              </div>
              {/* Opacity mask */}
              <div 
                className="absolute inset-0 z-[1] pointer-events-none" 
                style={{ background: `linear-gradient(to bottom, rgba(${hexToRgb(bgColor)}, ${bgOpacity * 0.1}), rgba(${hexToRgb(bgColor)}, ${bgOpacity}))` }}
              ></div>
              
              {/* Content overlay container */}
              <div className="absolute inset-0 flex flex-col items-center z-[2]">
                
                {/* Poster Box */}
                <div className="absolute top-[14.58%] left-1/2 -translate-x-1/2 w-[59.25%] aspect-[2/3] shrink-0 overflow-visible">
                  <div className="w-full h-full overflow-hidden border border-white/15 shadow-2xl" style={{ borderRadius: '4.17cqw' }}>
                    <img src={`${TMDB_IMAGE_BASE}${activePoster}`} crossOrigin="anonymous" className="w-full h-full object-cover" />
                  </div>
                  
                  {/* Poster Shuffle Trigger */}
                  {allPosters.length > 1 && (
                    <div className="absolute top-3 right-3 z-30">
                      <button 
                        onClick={handleRandomizePoster} 
                        title="Randomize Poster"
                        className="w-9 h-9 rounded-full grid place-items-center text-white bg-black/60 backdrop-blur-md border border-white/20 hover:bg-black/85 hover:scale-105 active:scale-90 transition-all shadow-xl"
                      >
                        <Shuffle size={14} />
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Info and Title Display Area */}
                <div className="absolute top-[74.22%] w-full flex flex-col items-center">
                  
                  {/* Centered Movie/TV Title lines */}
                  <div className="flex flex-col items-center text-center max-w-[85%] -translate-y-1/2">
                    {previewLines.map((line, idx) => (
                      <h3 
                        key={idx} 
                        className="font-normal uppercase text-white font-barlow drop-shadow-md leading-tight" 
                        style={{ fontSize: '6.48cqw' }}
                      >
                        {line}
                      </h3>
                    ))}
                    
                    {/* TV Details S/E Code block */}
                    {isTvSelected && showSeasonEpisode && (
                      <p 
                        className="font-medium text-white/50 font-inter tracking-[0.2em] uppercase mt-[1.5cqw]" 
                        style={{ fontSize: '2.22cqw' }}
                      >
                        S{season.toString().padStart(2, '0')}{episode === 'none' ? "" : ` E${episode.toString().padStart(2, '0')}`}
                      </p>
                    )}
                  </div>
                  
                  {/* Metadata & Rating pill */}
                  <div className="flex flex-col items-center w-full">
                    <div className="inline-flex items-center justify-center bg-white/10 backdrop-blur-md rounded-full font-inter border border-white/15 px-5" style={{ height: '3.75cqh' }}>
                      <div className="flex items-center gap-3 font-medium text-white whitespace-nowrap" style={{ fontSize: '3.14cqw' }}>
                        <span>{(selectedItem.release_date || selectedItem.first_air_date || '').split('-')[0]}</span>
                        <span className="w-1 h-1 bg-white/40 rounded-full"></span>
                        <span className="text-yellow-400 font-bold flex items-center gap-0.5">
                          ★ {selectedItem.vote_average?.toFixed(1) || '0.0'}
                        </span>
                        <span className="w-1 h-1 bg-white/40 rounded-full"></span>
                        <span className="text-white/60 uppercase tracking-tight">{isTvSelected ? 'SERIES' : 'MOVIE'}</span>
                      </div>
                    </div>

                    {/* Star personal reviews overlay */}
                    {personalRating > 0 && (
                      <div className="flex items-center gap-2 mt-4 animate-slide-up">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star 
                            key={star} 
                            size={16} 
                            className={star <= personalRating ? "text-yellow-400 fill-yellow-400" : "text-white/20 fill-white/10"} 
                          />
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>

            {/* Customizer Controllers Panel */}
            <div className="flex flex-col gap-3 w-full">
              
              {/* TV Episode Selector Overlay toggle */}
              {isTvSelected && (
                <div className="flex flex-col gap-3 bg-neutral-900/60 backdrop-blur-xl px-6 py-4 rounded-[2rem] border border-white/10 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tv size={16} className="text-neutral-400" />
                      <span className="text-xs font-bold text-neutral-300 uppercase tracking-wide">TV Show Details</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={showSeasonEpisode} 
                        onChange={() => setShowSeasonEpisode(!showSeasonEpisode)} 
                      />
                      <div className="w-11 h-6 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500 peer-checked:after:bg-black"></div>
                    </label>
                  </div>
                  {showSeasonEpisode && (
                    <div className="flex items-center gap-3 animate-slide-up">
                      <select 
                        value={season} 
                        onChange={(e) => setSeason(parseInt(e.target.value))} 
                        className="flex-1 bg-white/10 border border-white/10 rounded-xl py-2 px-3 text-center font-bold text-sm text-white"
                      >
                        {(tvDetails.seasons || [])
                          .filter((s: any) => s.season_number > 0 && s.air_date && s.air_date <= today)
                          .map((s: any) => (
                            <option key={s.id} value={s.season_number} className="bg-neutral-900">
                              S{s.season_number.toString().padStart(2, '0')}
                            </option>
                          ))
                        }
                      </select>
                      <select 
                        value={episode} 
                        onChange={(e) => setEpisode(e.target.value === 'none' ? 'none' : parseInt(e.target.value))} 
                        className="flex-1 bg-white/10 border border-white/10 rounded-xl py-2 px-3 text-center font-bold text-sm text-white"
                      >
                        <option value="none" className="bg-neutral-900 italic">No Episode</option>
                        {Array.from({ length: availableEpisodes }, (_, i) => i + 1).map(num => (
                          <option key={num} value={num} className="bg-neutral-900">
                            E{num.toString().padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Personal rating review stars selection */}
              <div className="flex items-center justify-between bg-neutral-900/60 backdrop-blur-xl px-5 sm:px-6 py-4 rounded-[2rem] border border-white/10">
                <div className="flex items-center gap-2 shrink-0">
                  <Star size={16} className="text-neutral-400" />
                  <span className="text-[11px] sm:text-xs font-bold text-neutral-300 uppercase tracking-wide">Your Star Rating</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button 
                      key={star} 
                      onClick={() => setPersonalRating(star === personalRating ? 0 : star)} 
                      className="hover:scale-110 active:scale-95 transition-transform p-1"
                    >
                      <Star 
                        size={24} 
                        className={star <= personalRating ? "text-yellow-400 fill-yellow-400" : "text-white/20 hover:text-white/40"} 
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color and Opacity controls */}
              <div className="flex items-center justify-between bg-neutral-900/60 backdrop-blur-xl px-6 py-4 rounded-[2rem] border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shrink-0 shadow-lg">
                    <input 
                      type="color" 
                      value={bgColor} 
                      onChange={(e) => setBgColor(e.target.value)} 
                      className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" 
                    />
                  </div>
                  <span className="text-xs font-bold text-neutral-300 uppercase">Color</span>
                </div>
                <div className="w-[1px] h-6 bg-white/20"></div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-neutral-300 uppercase">Opacity</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05" 
                    value={bgOpacity} 
                    onChange={(e) => setBgOpacity(parseFloat(e.target.value))} 
                    className="w-20 md:w-28 accent-white cursor-pointer" 
                  />
                </div>
              </div>

              {/* Share / Export Action Button */}
              <button 
                onClick={() => handleShare(selectedItem)} 
                disabled={generating} 
                className="w-full py-5 bg-white text-black rounded-[2rem] font-bold text-lg hover:bg-neutral-200 active:scale-95 transition-all shadow-2xl uppercase flex items-center justify-center gap-3 font-inter tracking-wider disabled:opacity-50"
              >
                {generating ? (
                  <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Share2 size={20} />
                    <span>Download / Share Story</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Hidden processing Canvas */}
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
}
