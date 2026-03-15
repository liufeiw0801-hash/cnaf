/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Hands, Results } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

// Constants
const MAP_BOUNDS = { minLng: 73.5, maxLng: 135.0, minLat: 18.0, maxLat: 53.6 };
const HOVER_DURATION = 1000;

// City Data
const capitals = [
  { id: 1, name: "北京", lng: 116.40, lat: 39.90 }, { id: 2, name: "天津", lng: 117.20, lat: 39.13 },
  { id: 3, name: "石家庄", lng: 114.48, lat: 38.03 }, { id: 4, name: "太原", lng: 112.53, lat: 37.87 },
  { id: 5, name: "呼和浩特", lng: 111.65, lat: 40.82 }, { id: 6, name: "沈阳", lng: 123.38, lat: 41.80 },
  { id: 7, name: "长春", lng: 125.35, lat: 43.88 }, { id: 8, name: "哈尔滨", lng: 126.63, lat: 45.75 },
  { id: 9, name: "上海", lng: 121.47, lat: 31.23 }, { id: 10, name: "南京", lng: 118.78, lat: 32.04 },
  { id: 11, name: "杭州", lng: 120.15, lat: 30.28 }, { id: 12, name: "合肥", lng: 117.27, lat: 31.86 },
  { id: 13, name: "福州", lng: 119.30, lat: 26.08 }, { id: 14, name: "南昌", lng: 115.89, lat: 28.68 },
  { id: 15, name: "济南", lng: 117.00, lat: 36.65 }, { id: 16, name: "郑州", lng: 113.65, lat: 34.76 },
  { id: 17, name: "武汉", lng: 114.31, lat: 30.52 }, { id: 18, name: "长沙", lng: 113.00, lat: 28.21 },
  { id: 19, name: "广州", lng: 113.23, lat: 23.16 }, { id: 20, name: "南宁", lng: 108.33, lat: 22.84 },
  { id: 21, name: "海口", lng: 110.35, lat: 20.02 }, { id: 22, name: "重庆", lng: 106.54, lat: 29.59 },
  { id: 23, name: "成都", lng: 104.06, lat: 30.67 }, { id: 24, name: "贵阳", lng: 106.71, lat: 26.57 },
  { id: 25, name: "昆明", lng: 102.73, lat: 25.04 }, { id: 26, name: "拉萨", lng: 91.11, lat: 29.66 },
  { id: 27, name: "西安", lng: 108.95, lat: 34.27 }, { id: 28, name: "兰州", lng: 103.73, lat: 36.03 },
  { id: 29, name: "西宁", lng: 101.74, lat: 36.56 }, { id: 30, name: "银川", lng: 106.27, lat: 38.47 },
  { id: 31, name: "乌鲁木齐", lng: 87.68, lat: 43.77 }, { id: 32, name: "台北", lng: 121.50, lat: 25.04 },
  { id: 33, name: "香港", lng: 114.17, lat: 22.28 }, { id: 34, name: "澳门", lng: 113.54, lat: 22.19 }
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("系统启动中...");
  const [selectedCity, setSelectedCity] = useState<any>(null);
  const [visitedCities, setVisitedCities] = useState<Set<number>>(new Set());

  // Refs for non-reactive state to avoid re-renders in the loop
  const mapDataRef = useRef<any>(null);
  const systemScaleRef = useRef(1.0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const lastLeftHandPosRef = useRef<any>(null);
  const cursorRef = useRef({ x: -100, y: -100 });
  const hoverCityRef = useRef<any>(null);
  const hoverStartTimeRef = useRef(0);

  useEffect(() => {
    const init = async () => {
      try {
        const response = await fetch('https://geojson.cn/api/china/china.json');
        if (!response.ok) throw new Error('Network response was not ok');
        mapDataRef.current = await response.json();
        
        setupHands();
        requestAnimationFrame(renderLoop);
        setStatus("神经链路已建立");
      } catch (e) {
        console.error("初始化失败:", e);
        setStatus("数据链路上行错误");
      }
    };

    const setupHands = () => {
      if (!videoRef.current) return;

      const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
      });

      hands.onResults(onResults);

      const camera = new Camera(videoRef.current, {
        onFrame: async () => {
          if (videoRef.current) {
            await hands.send({ image: videoRef.current });
          }
        },
        width: 1280,
        height: 720
      });
      camera.start();
    };

    const onResults = (results: Results) => {
      let leftHand: any = null;
      let rightHand: any = null;

      if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((lm, index) => {
          const label = results.multiHandedness[index].label;
          if (label === 'Left') rightHand = lm; else leftHand = lm;
        });
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      // Right hand: cursor and zoom
      if (rightHand) {
        const indexTip = rightHand[8];
        cursorRef.current.x = (1 - indexTip.x) * w;
        cursorRef.current.y = indexTip.y * h;

        if (checkIsOpen(rightHand)) {
          systemScaleRef.current = Math.min(4.0, systemScaleRef.current + 0.03);
          setStatus("放大视图");
        } else if (checkIsFist(rightHand)) {
          systemScaleRef.current = Math.max(0.5, systemScaleRef.current - 0.03);
          setStatus("缩小视图");
        } else {
          setStatus("锁定目标点");
        }
      } else {
        cursorRef.current.x = -100;
        cursorRef.current.y = -100;
      }

      // Left hand: pan
      if (leftHand && checkIsOpen(leftHand)) {
        const center = leftHand[9];
        if (lastLeftHandPosRef.current) {
          offsetRef.current.x += (center.x - lastLeftHandPosRef.current.x) * -2000;
          offsetRef.current.y += (center.y - lastLeftHandPosRef.current.y) * 2000;
          setStatus("视图移动中");
        }
        lastLeftHandPosRef.current = center;
      } else {
        lastLeftHandPosRef.current = null;
      }

      if (!rightHand && !leftHand) setStatus("神经链路等待输入");
    };

    const checkIsOpen = (lm: any) => lm[8].y < lm[6].y && lm[12].y < lm[10].y && lm[16].y < lm[14].y && lm[20].y < lm[18].y;
    const checkIsFist = (lm: any) => lm[8].y > lm[6].y && lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y;

    const renderLoop = () => {
      drawMap();
      requestAnimationFrame(renderLoop);
    };

    const drawMap = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const scale = window.devicePixelRatio || 1;
      const w = canvas.width / scale;
      const h = canvas.height / scale;
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2 + offsetRef.current.x, h / 2 + offsetRef.current.y);
      ctx.scale(systemScaleRef.current, systemScaleRef.current);
      ctx.translate(-w / 2, -h / 2);

      const time = Date.now() * 0.002;
      
      // Map outline
      drawLayer(ctx, w, h, 'rgba(255, 0, 0, 0.6)', 2, 10 + Math.sin(time)*5);
      drawLayer(ctx, w, h, 'rgba(255, 255, 255, 0.4)', 0.5, 2);

      // City nodes
      let currentHover: any = null;
      capitals.forEach(city => {
        const pos = project(city.lng, city.lat, w, h);
        const isVisited = visitedCities.has(city.id);
        
        const breathPhase = time * 2 + city.lng * 0.5;
        const breathSize = Math.sin(breathPhase) * 1.5;
        const breathOpacity = (Math.sin(breathPhase) + 1) * 0.3 + 0.5;
        
        const mapCursorX = (cursorRef.current.x - w/2 - offsetRef.current.x) / systemScaleRef.current + w/2;
        const mapCursorY = (cursorRef.current.y - h/2 - offsetRef.current.y) / systemScaleRef.current + h/2;
        
        const dist = Math.hypot(pos.x - mapCursorX, pos.y - mapCursorY);
        const isTargeted = dist < 12;

        if (isTargeted) currentHover = city;

        ctx.beginPath();
        ctx.shadowBlur = (isTargeted ? 25 : 8 + breathSize * 3);
        
        if (isTargeted) {
          ctx.shadowColor = '#fff';
          ctx.fillStyle = '#fff';
        } else {
          const baseColor = isVisited ? [255, 160, 0] : [0, 255, 255]; 
          ctx.shadowColor = `rgb(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]})`;
          ctx.fillStyle = `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${breathOpacity})`;
        }

        ctx.arc(pos.x, pos.y, isTargeted ? 5 : 2.5 + breathSize * 0.5, 0, Math.PI * 2);
        ctx.fill();

        if (systemScaleRef.current > 1.2 || isTargeted) {
          ctx.font = isTargeted ? 'bold 12px sans-serif' : '10px sans-serif';
          ctx.fillStyle = isTargeted ? '#fff' : `rgba(255, 255, 255, ${breathOpacity})`;
          ctx.fillText(city.name, pos.x + 10, pos.y + 5);
        }
      });

      updateHoverTimer(currentHover);
      ctx.restore();
      drawCursor(ctx, w, h);
    };

    const updateHoverTimer = (city: any) => {
      if (city && !selectedCity) {
        if (hoverCityRef.current !== city) {
          hoverCityRef.current = city;
          hoverStartTimeRef.current = Date.now();
        } else {
          const elapsed = Date.now() - hoverStartTimeRef.current;
          if (elapsed >= HOVER_DURATION) {
            setSelectedCity(city);
            setVisitedCities(prev => new Set(prev).add(city.id));
            hoverCityRef.current = null;
            hoverStartTimeRef.current = 0;
          }
        }
      } else {
        hoverCityRef.current = null;
        hoverStartTimeRef.current = 0;
      }
    };

    const drawCursor = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (cursorRef.current.x < 0 || cursorRef.current.y < 0) return;
      ctx.save();
      ctx.translate(cursorRef.current.x, cursorRef.current.y);
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      for(let i=0; i<4; i++){
        ctx.rotate(Math.PI/2);
        ctx.beginPath();
        ctx.moveTo(12, 0); ctx.lineTo(18, 0);
        ctx.stroke();
      }

      if (hoverCityRef.current) {
        const progress = (Date.now() - hoverStartTimeRef.current) / HOVER_DURATION;
        ctx.beginPath();
        ctx.arc(0, 0, 22, -Math.PI/2, -Math.PI/2 + Math.PI*2 * progress);
        ctx.strokeStyle = '#ff3333';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawLayer = (ctx: CanvasRenderingContext2D, w: number, h: number, color: string, lw: number, blur: number) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.shadowBlur = blur;
      ctx.shadowColor = color;
      ctx.lineJoin = 'round';
      if (mapDataRef.current) {
        mapDataRef.current.features.forEach((f: any) => {
          ctx.beginPath();
          const coords = f.geometry.coordinates;
          if (f.geometry.type === 'Polygon') renderRings(ctx, coords, w, h);
          else coords.forEach((poly: any) => renderRings(ctx, poly, w, h));
          ctx.stroke();
        });
      }
      ctx.restore();
    };

    const renderRings = (ctx: CanvasRenderingContext2D, rings: any[], w: number, h: number) => {
      rings.forEach(ring => {
        ring.forEach((c: any, i: number) => {
          const p = project(c[0], c[1], w, h);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
      });
    };

    const project = (lng: number, lat: number, w: number, h: number) => {
      const px = (lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng) * w;
      const py = h - (lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat) * h;
      return { x: px, y: py };
    };

    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * scale;
      canvas.height = window.innerHeight * scale;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(scale, scale);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    init();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [selectedCity, visitedCities]);

  return (
    <div className="relative w-full h-screen overflow-hidden font-sans text-red-500">
      {/* Background Video */}
      <div className="fixed inset-0 z-[-2] bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover scale-x-[-1] brightness-[0.4] contrast-[1.1] blur-[2px]"
          autoPlay
          playsInline
        />
      </div>
      
      {/* Space Overlay */}
      <div className="fixed inset-0 z-[-1] bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />

      {/* UI Panels */}
      <div className="absolute top-12 left-12 z-10 border-l-4 border-red-600 pl-5 pointer-events-none">
        <h1 className="italic font-black text-5xl text-white drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]">智慧青春·红色航油</h1>
        <p className="text-xs tracking-[0.3em] opacity-70 mt-1">INTELLIGENT YOUTH · RED AVIATION FUEL</p>
      </div>

      {/* Control Legend */}
      <div className="fixed bottom-10 left-10 bg-black/60 border border-red-900/30 p-5 backdrop-blur-sm z-20 min-w-[240px]">
        <div className="mb-4 text-[11px] font-bold text-red-500 tracking-widest border-b border-red-900/40 pb-2">操作指令指南</div>
        <LegendItem label="右手张掌" action="放大系统视图" />
        <LegendItem label="右手握拳" action="缩小系统视图" />
        <LegendItem label="左手张掌" action="平移全息图层" />
        <LegendItem label="单指悬停" action="精准定位节点" />
        <LegendItem label="自动触发" action="悬停 1.0秒 开启相册" />
      </div>

      {/* Gesture Indicator */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-red-900/40 px-10 py-2 border border-red-600/40 font-bold text-white backdrop-blur-md tracking-widest">
        {status}
      </div>

      {/* Map Canvas */}
      <div id="map-wrapper" className="flex items-center justify-center w-full h-full pointer-events-none">
        <canvas ref={canvasRef} className="drop-shadow-[0_0_15px_rgba(255,0,0,0.5)]" />
      </div>

      {/* Album Overlay */}
      <AnimatePresence>
        {selectedCity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 flex items-center justify-center z-[1000] backdrop-blur-lg"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-[700px] bg-red-950/70 border border-red-600/40 p-12 relative shadow-[0_0_60px_rgba(255,0,0,0.3)]"
            >
              <button
                onClick={() => setSelectedCity(null)}
                className="absolute top-5 right-6 text-red-500 hover:text-white transition-colors cursor-pointer"
              >
                <X size={32} />
              </button>
              <img
                src={`https://picsum.photos/seed/${selectedCity.name}/1200/800`}
                alt={selectedCity.name}
                className="w-full h-80 object-cover mb-8 border border-red-900/50"
                referrerPolicy="no-referrer"
              />
              <h2 className="text-4xl font-black mb-4 text-white tracking-widest">{selectedCity.name}</h2>
              <div className="h-1 w-20 bg-red-600 mb-6" />
              <p className="text-red-100/60 leading-relaxed italic text-lg">
                正在检索红色航油建设成果数据... 这里是{selectedCity.name}的红色航油建设示范点，通过智慧化管理系统，实现了航油保障的精准高效。
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LegendItem({ label, action }: { label: string; action: string }) {
  return (
    <div className="flex items-center mb-2.5 text-[13px] text-white/90">
      <span className="w-20 text-red-500 font-bold text-[11px] font-orbitron">{label}</span>
      <span>{action}</span>
    </div>
  );
}

