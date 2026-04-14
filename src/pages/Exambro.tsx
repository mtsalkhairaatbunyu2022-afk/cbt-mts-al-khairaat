import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import { Camera, Link as LinkIcon, AlertTriangle, XCircle, Maximize, ShieldAlert, Volume2, ArrowLeft, ArrowRight, Send, LogOut, Share2, QrCode, Copy, Check, Users, Settings, Search, RefreshCw, Trash2, Loader2, FileText, Eye, EyeOff, Key, Upload, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, serverTimestamp, Timestamp, getDoc, where, getDocs, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import StudentManagement from './StudentManagement';

export default function Exambro() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'true') {
      localStorage.clear();
      window.location.href = window.location.pathname;
    }
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Shift + X for emergency exit
      if (e.ctrlKey && e.shiftKey && e.key === 'X') {
        handleExitExam(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [studentName, setStudentName] = useState(() => localStorage.getItem('studentName') || '');
  const [selectedClass, setSelectedClass] = useState(() => localStorage.getItem('selectedClass') || '');
  const [studentList, setStudentList] = useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [googleFormEntryId, setGoogleFormEntryId] = useState<string>('');
  const [isNameSet, setIsNameSet] = useState(() => !!localStorage.getItem('studentName'));
  const [view, setView] = useState<'student' | 'supervisor'>('student');
  const [supervisorTab, setSupervisorTab] = useState<'monitoring' | 'students'>('monitoring');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [showSupervisorPassword, setShowSupervisorPassword] = useState(false);
  const [supervisorLoginError, setSupervisorLoginError] = useState<string | null>(null);
  const [isSupervisorAuthenticated, setIsSupervisorAuthenticated] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [, setTick] = useState(0);

  // Force re-render periodically to update "stale" status in monitoring
  useEffect(() => {
    if (!isSupervisorAuthenticated) return;
    const timer = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, [isSupervisorAuthenticated]);
  const [isResetting, setIsResetting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [examUrl, setExamUrl] = useState<string | null>(() => {
    return localStorage.getItem('examUrl');
  });
  const [inputUrl, setInputUrl] = useState(() => {
    return localStorage.getItem('examUrl') || '';
  });
  const [isExamActive, setIsExamActive] = useState(() => {
    return localStorage.getItem('isExamActive') === 'true';
  });
  const [showScanner, setShowScanner] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [isSplitScreen, setIsSplitScreen] = useState(false);
  const [violationLog, setViolationLog] = useState<string[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [showUpdateAvailable, setShowUpdateAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const APP_VERSION = "1.0.2"; // Increment this when you update

  const showError = (msg: string) => {
    setErrorMessage(msg);
    playBeep(true);
    setTimeout(() => setErrorMessage(null), 5000);
  };
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const APP_URL = window.location.origin;
  const QR_CODE_API = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(APP_URL)}`;

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check for updates
    const checkUpdate = async () => {
      try {
        const response = await fetch('/index.html', { cache: 'no-store' });
        const text = await response.text();
        // This is a simple way to check if the content has changed
        // In a real PWA, the Service Worker handles this, but a manual button is clearer for users
      } catch (e) {
        console.error("Update check failed", e);
      }
    };

    const updateInterval = setInterval(checkUpdate, 60000); // Check every minute

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearInterval(updateInterval);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(APP_URL);
    setCopied(true);
    playBeep();
    setTimeout(() => setCopied(false), 2000);
  };

  // Initialize Audio Context for Beep
  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('touchstart', initAudio);
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
  }, []);

  const playBeep = (isAlarm = false) => {
    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      const oscillator = audioContextRef.current.createOscillator();
      const gainNode = audioContextRef.current.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      oscillator.type = isAlarm ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(isAlarm ? 1200 : 880, audioContextRef.current.currentTime);
      
      if (isAlarm) {
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContextRef.current.currentTime + 0.5);
      }

      gainNode.gain.setValueAtTime(0.15, audioContextRef.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + (isAlarm ? 0.5 : 0.2));

      oscillator.start();
      oscillator.stop(audioContextRef.current.currentTime + (isAlarm ? 0.5 : 0.2));
    }
  };

  // Security: Detect focus loss and key shortcuts
  useEffect(() => {
    if (isExamActive && !isLockedOut) {
      // Monitor Visual Viewport (Detects Nav Bar / Keyboard)
      const handleViewportChange = () => {
        if (window.visualViewport) {
          // Relaxed check: On mobile, keyboard opening is normal.
          // We only flag it if the height becomes extremely small (less than 30% of window)
          const isSafe = window.visualViewport.height > window.innerHeight * 0.3;
          setIsVisualViewportSafe(isSafe);
          if (!isSafe) {
            setIsSecure(false);
            playBeep(true);
          }
        }
      };

      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange);
        window.visualViewport.addEventListener('scroll', handleViewportChange);
      }

      // Floating App & Overlay Detection
      const floatingCheckInterval = setInterval(() => {
        if (!isExamActive || isLockedOut) return;

        // 1. Focus Check: If the document loses focus, a floating app might be active
        if (!document.hasFocus()) {
          const activeEl = document.activeElement;
          const isIframe = activeEl && activeEl.tagName === 'IFRAME';
          if (!isIframe) {
            setIsSecure(false);
            playBeep(true);
            // We don't trigger hard warning immediately to avoid annoyance, 
            // but we keep the security shield up.
          }
        }

        // 2. Viewport Offset Check: Detects if content is shifted by an overlay
        if (window.visualViewport) {
          const hasOffset = window.visualViewport.offsetTop > 5 || window.visualViewport.offsetLeft > 5;
          if (hasOffset) {
            setIsSecure(false);
            playBeep(true);
          }
        }

        // 3. Screen Area Check: Detects if system overlays are consuming screen space
        const screenDiff = Math.abs(window.screen.height - window.innerHeight);
        if (screenDiff > 150 && isFullscreen) { // Threshold for floating windows
          setIsSecure(false);
          triggerWarning("Aplikasi mengambang atau overlay terdeteksi!");
        }
      }, 1000);

      // Re-enforce fullscreen periodically
      const fsInterval = setInterval(() => {
        if (!document.fullscreenElement && isExamActive && !isLockedOut) {
          setIsFullscreen(false);
          setIsSecure(false);
        }
      }, 500);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          triggerWarning("Pindah aplikasi atau tab terdeteksi!");
        }
      };

      const handleBlur = () => {
        // Delay blur detection to avoid false positives from iframe clicks or system dialogs
        setTimeout(() => {
          // If the focus is on the iframe, it's safe
          if (document.activeElement?.tagName === 'IFRAME') return;
          // If the page is still visible, it might just be a focus shift
          if (document.visibilityState === 'visible' && document.hasFocus()) return;
          
          triggerWarning("Fokus aplikasi hilang!");
        }, 500);
      };

      const handlePopState = () => {
        if (isExamActive) {
          // History Trap: Push multiple states to make it very hard to go back
          for (let i = 0; i < 20; i++) {
            window.history.pushState(null, '', window.location.pathname);
          }
          triggerWarning("Tombol navigasi dilarang! (Upaya kembali terdeteksi)");
        }
      };

      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isExamActive) {
          e.preventDefault();
          e.returnValue = '';
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        const forbiddenKeys = ['F12', 'PrintScreen', 'Escape'];
        const forbiddenShortcuts = ['c', 'v', 'u', 's', 'p', 'a'];
        
        if (
          forbiddenKeys.includes(e.key) || 
          (e.ctrlKey && forbiddenShortcuts.includes(e.key.toLowerCase())) ||
          (e.metaKey && forbiddenShortcuts.includes(e.key.toLowerCase()))
        ) {
          e.preventDefault();
          triggerWarning(`Shortcut keyboard dilarang: ${e.key}`);
        }
      };

      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        triggerWarning("Klik kanan dilarang!");
      };

      const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
          setIsFullscreen(false);
          triggerWarning("Mode layar penuh dimatikan!");
        } else {
          setIsFullscreen(true);
        }
      };

      let resizeTimeout: any;
      const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          // Detect split screen by checking width change
          // On mobile, height changes are common (keyboard), so we ignore them
          const isSplitWidth = window.innerWidth < screen.width * 0.8;
          const isTooSmall = window.innerWidth < 280 || window.innerHeight < 200;

          if (isSplitWidth || isTooSmall) {
            setIsSplitScreen(true);
            setIsSecure(false);
            // Show shield instead of hard lockout for resize
            setWarningMessage("Ukuran jendela tidak aman!");
          } else {
            setIsSplitScreen(false);
            // Auto-recover if size returns to normal
            if (isFullscreen) setIsSecure(true);
          }
        }, 500);
      };

      // Edge Swipe Detection (Bottom/Top) - Disabled for better compatibility with modern phones
      const handleTouchStart = (e: TouchEvent) => {
        // Disabled to prevent false positives when scrolling or interacting with form
      };

      window.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('fullscreenchange', handleFullscreenChange);
      window.addEventListener('resize', handleResize);

      // Robust History Trap: Push multiple states initially
      const pushTrap = () => {
        for (let i = 0; i < 20; i++) {
          window.history.pushState(null, '', window.location.pathname);
        }
      };
      
      pushTrap();
      const trapInterval = setInterval(pushTrap, 2000); // Keep the trap full

      return () => {
        clearInterval(trapInterval);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', handleViewportChange);
          window.visualViewport.removeEventListener('scroll', handleViewportChange);
        }
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('contextmenu', handleContextMenu);
        window.removeEventListener('fullscreenchange', handleFullscreenChange);
        window.removeEventListener('resize', handleResize);
        clearInterval(fsInterval);
        clearInterval(floatingCheckInterval);
      };
    }
  }, [isExamActive, isLockedOut]);

  const [warningMessage, setWarningMessage] = useState("");
  const MAX_WARNINGS = 3;

  const [isSecure, setIsSecure] = useState(true);
  const [isExited, setIsExited] = useState(false);
  const [isVisualViewportSafe, setIsVisualViewportSafe] = useState(true);

  const triggerWarning = (message: string) => {
    if (isLockedOut) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const fullLog = `[${timestamp}] ${message}`;
    setViolationLog(prev => [...prev, fullLog]);
    
    // Immediate Firestore sync for violations
    if (isNameSet) {
      const sessionRef = doc(db, 'sessions', deviceId);
      updateDoc(sessionRef, {
        violations: [...violationLog, { timestamp: new Date().toISOString(), message: fullLog }],
        lastUpdate: serverTimestamp()
      }).catch(err => console.error("Violation sync failed", err));
    }

    setWarningMessage(message);
    
    // If it's just a fullscreen exit or layout change, we show the "Security Shield" instead of a hard lockout
    if (message === "Mode layar penuh dimatikan!" || message.includes("Ukuran jendela")) {
      setIsFullscreen(false);
      setIsSecure(false);
      playBeep(true);
      return;
    }

    const newCount = warningCount + 1;
    setWarningCount(newCount);
    playBeep(true);
    
    if (newCount >= MAX_WARNINGS) {
      setIsLockedOut(true);
      setShowWarning(true);

      // Sync lockout status
      if (isNameSet) {
        const sessionRef = doc(db, 'sessions', deviceId);
        updateDoc(sessionRef, {
          status: 'locked',
          isLockedOut: true,
          warningCount: newCount,
          lastUpdate: serverTimestamp()
        }).catch(err => console.error("Lockout sync failed", err));
      }
    } else {
      setShowWarning(true);
      // Sync warning count
      if (isNameSet) {
        const sessionRef = doc(db, 'sessions', deviceId);
        updateDoc(sessionRef, {
          warningCount: newCount,
          lastUpdate: serverTimestamp()
        }).catch(err => console.error("Warning sync failed", err));
      }
    }
  };

  useEffect(() => {
    let interval: any;
    if (showWarning || (!isFullscreen && isExamActive && !isLockedOut)) {
      interval = setInterval(() => {
        playBeep(true);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [showWarning, isFullscreen, isExamActive, isLockedOut]);

  const startScanner = () => {
    playBeep();
    setShowScanner(true);
    
    // Tunggu sebentar agar elemen 'reader' muncul di DOM
    setTimeout(async () => {
      try {
        if (scannerRef.current) {
          try {
            await scannerRef.current.stop();
          } catch (e) {
            // Ignore stop errors
          }
        }

        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        // Coba kamera belakang dulu, jika gagal coba kamera apa saja yang tersedia
        try {
          await html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => {
              if (decodedText.startsWith('http')) {
                playBeep();
                stopScanner();
                setExamUrl(decodedText);
                localStorage.setItem('examUrl', decodedText);
              }
            },
            () => {}
          );
        } catch (envErr) {
          console.warn("Kamera belakang tidak ditemukan, mencoba kamera default", envErr);
          await html5QrCode.start(
            { facingMode: "user" }, // Fallback ke kamera depan/default
            config,
            (decodedText) => {
              if (decodedText.startsWith('http')) {
                playBeep();
                stopScanner();
                setExamUrl(decodedText);
                localStorage.setItem('examUrl', decodedText);
              }
            },
            () => {}
          );
        }
      } catch (err) {
        console.error("Scanner initialization failed", err);
        showError("Gagal membuka kamera. Pastikan izin kamera diberikan dan perangkat memiliki kamera aktif.");
        setShowScanner(false);
      }
    }, 300);
  };

  const stopScanner = () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().then(() => {
        setShowScanner(false);
        scannerRef.current = null;
      }).catch(err => {
        console.error("Failed to stop scanner", err);
        setShowScanner(false);
        scannerRef.current = null;
      });
    } else {
      setShowScanner(false);
      scannerRef.current = null;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again
    const input = event.target;
    
    setIsUploading(true);
    playBeep();

    // Ensure reader-hidden exists
    const elementId = "reader-hidden";
    let element = document.getElementById(elementId);
    if (!element) {
      element = document.createElement('div');
      element.id = elementId;
      element.style.display = 'none';
      document.body.appendChild(element);
    }

    try {
      // Use a fresh instance for each scan
      const html5QrCode = new Html5Qrcode(elementId);
      
      // scanFile(file, showImage)
      // We set showImage to false to avoid rendering issues in a hidden div
      const decodedText = await html5QrCode.scanFile(file, false);
      
      if (decodedText && decodedText.startsWith('http')) {
        playBeep();
        setExamUrl(decodedText);
        localStorage.setItem('examUrl', decodedText);
      } else if (decodedText) {
        showError("QR Code terdeteksi tapi bukan link valid: " + decodedText);
      } else {
        showError("QR Code tidak terbaca. Pastikan gambar jelas dan tidak terpotong.");
      }
      
      // Cleanup instance
      try { 
        html5QrCode.clear(); 
      } catch (e) {
        console.warn("Cleanup error:", e);
      }
    } catch (err) {
      console.error("File scan error:", err);
      showError("Gagal membaca QR Code. Pastikan gambar berisi QR Code yang jelas dan coba lagi.");
    } finally {
      setIsUploading(false);
      input.value = '';
    }
  };

  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    };
    checkStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);
    return () => window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkStandalone);
  }, []);

  const [watermarks, setWatermarks] = useState([
    { id: 1, x: 10, y: 10, rot: -45 },
    { id: 2, x: 70, y: 30, rot: 30 },
    { id: 3, x: 20, y: 80, rot: -15 },
    { id: 4, x: 80, y: 70, rot: 60 }
  ]);

  useEffect(() => {
    if (isExamActive) {
      const interval = setInterval(() => {
        setWatermarks(prev => prev.map(w => ({
          ...w,
          x: Math.random() * 80 + 5,
          y: Math.random() * 80 + 5,
          rot: Math.random() * 360 - 180
        })));
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [isExamActive]);
  const [deviceId] = useState(() => {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = Math.random().toString(36).substring(7).toUpperCase();
      localStorage.setItem('deviceId', id);
    }
    return id;
  });

  // Firebase Auth & Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthReady(true);
      } else {
        signInAnonymously(auth).then(() => {
          setIsAuthReady(true);
        }).catch((error) => {
          if (error.code === 'auth/admin-restricted-operation') {
            console.warn("Catatan: Fitur 'Anonymous Auth' belum diaktifkan di Firebase Console. Laporan real-time mungkin terbatas.");
          } else {
            console.error("Auth error:", error);
          }
          // Even if it fails, we mark as ready so we can try to fetch (though it might fail rules)
          setIsAuthReady(true);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync session to Firestore
  useEffect(() => {
    if (!isExamActive || !isNameSet) return;

    const sessionRef = doc(db, 'sessions', deviceId);
    
    const syncSession = async (statusOverride?: string) => {
      try {
        await setDoc(sessionRef, {
          studentName,
          deviceId,
          status: statusOverride || (isLockedOut ? 'locked' : 'active'),
          examUrl,
          lastUpdate: serverTimestamp(),
          violations: violationLog.map(v => ({
            timestamp: new Date().toISOString(),
            message: v
          })),
          isLockedOut
        }, { merge: true });
      } catch (error) {
        console.error("Sync failed", error);
      }
    };

    syncSession();
    const interval = setInterval(syncSession, 5000); // Heartbeat every 5s

    const handleUnload = () => {
      // Use a simpler update for unload to be as fast as possible
      const ref = doc(db, 'sessions', deviceId);
      updateDoc(ref, { 
        status: 'offline', 
        lastUpdate: serverTimestamp() 
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      // Also try to set offline on unmount
      syncSession('offline');
    };
  }, [isExamActive, isLockedOut, violationLog, studentName, examUrl, isNameSet, deviceId]);

  // Supervisor Real-time Feed
  useEffect(() => {
    if (!isSupervisorAuthenticated) return;

    const q = query(collection(db, 'sessions'), orderBy('lastUpdate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSessions(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sessions');
    });

    return () => unsubscribe();
  }, [isSupervisorAuthenticated]);

  useEffect(() => {
    localStorage.setItem('isExamActive', isExamActive.toString());
    if (examUrl) {
      localStorage.setItem('examUrl', examUrl);
    } else {
      localStorage.removeItem('examUrl');
    }
  }, [isExamActive, examUrl]);

  const handleStartExam = (scannedUrl?: string) => {
    const finalUrl = scannedUrl || examUrl;
    if (!finalUrl) {
      console.error("Link ujian tidak ditemukan.");
      return;
    }
    if (!isNameSet || !studentName) {
      console.error("Identitas siswa belum disetel.");
      setIsNameSet(false); // Force re-set name if somehow empty
      return;
    }
    
    playBeep();
    
    // Request Fullscreen - Try but don't block
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed', err);
        // If it fails, we still proceed but the security shield might appear
        // We set isFullscreen to true initially to show the exam, 
        // the listener will correct it if it actually failed.
      });
    }
    
    setIsFullscreen(true);
    setIsExamActive(true);
    setExamUrl(finalUrl);
    localStorage.setItem('examUrl', finalUrl);
    localStorage.setItem('isExamActive', 'true');

    // Use deviceId as the primary session ID for consistency with heartbeat
    const sessionRef = doc(db, 'sessions', deviceId);
    
    setDoc(sessionRef, {
      id: deviceId,
      studentName,
      class: selectedClass,
      deviceId: deviceId,
      browser: navigator.userAgent,
      startTime: serverTimestamp(),
      lastUpdate: serverTimestamp(),
      isSecure: true,
      status: 'active',
      warningCount: 0,
      violations: [],
      examUrl: finalUrl
    }, { merge: true }).catch(err => {
      console.error("Failed to create session", err);
      // Don't call handleFirestoreError here to avoid throwing and breaking the UI flow
    });
  };

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [configSaveStatus, setConfigSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const handleExitExam = async (force = false) => {
    if (force || showExitConfirm) {
      playBeep();
      
      // Update status to inactive in Firestore before clearing local state
      if (isNameSet) {
        try {
          const sessionRef = doc(db, 'sessions', deviceId);
          await updateDoc(sessionRef, {
            status: 'inactive',
            lastUpdate: serverTimestamp()
          });
        } catch (error) {
          console.error("Failed to update status to inactive:", error);
        }
      }

      setIsExamActive(false);
      setExamUrl(null);
      localStorage.removeItem('isExamActive');
      localStorage.removeItem('examUrl');
      
      // Clear any security locks
      setIsLockedOut(false);
      setIsSecure(true);
      setWarningCount(0);
      
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
      
      // Force reload to clear all states and history traps if necessary
      window.location.reload();
    } else {
      setShowExitConfirm(true);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !auth.currentUser) return;

    const fetchConfig = async () => {
      try {
        const configRef = doc(db, 'config', 'global');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setGoogleFormEntryId(configSnap.data().googleFormEntryId || '');
        }
      } catch (error) {
        console.error("Error fetching config:", error);
      }
    };
    fetchConfig();
  }, [isAuthReady]);

  useEffect(() => {
    if (selectedClass && isAuthReady && auth.currentUser) {
      const fetchStudents = async () => {
        setIsLoadingStudents(true);
        try {
          const q = query(collection(db, 'users'), where('role', '==', 'student'), where('class', '==', selectedClass));
          const snap = await getDocs(q);
          const list = snap.docs.map(doc => doc.data());
          setStudentList(list.sort((a, b) => a.displayName.localeCompare(b.displayName)));
        } catch (error) {
          console.error("Error fetching students:", error);
        } finally {
          setIsLoadingStudents(false);
        }
      };
      fetchStudents();
    } else {
      setStudentList([]);
    }
  }, [selectedClass, isAuthReady]);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const handleSaveName = () => {
    if (!selectedClass) {
      showError("Silakan pilih kelas terlebih dahulu.");
      return;
    }
    if (!studentName) {
      showError("Silakan pilih nama Anda.");
      return;
    }
    localStorage.setItem('studentName', studentName);
    localStorage.setItem('selectedClass', selectedClass);
    setIsNameSet(true);
    playBeep();
  };

  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleResetSessions = async () => {
    setIsResetting(true);
    setResetStatus('idle');
    try {
      const q = query(collection(db, 'sessions'));
      const snapshot = await getDocs(q);
      
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      setResetStatus('success');
      setShowConfirmReset(false);
      setTimeout(() => setResetStatus('idle'), 3000);
    } catch (error) {
      console.error("Error resetting sessions:", error);
      handleFirestoreError(error, OperationType.DELETE, 'sessions');
      setResetStatus('error');
      setTimeout(() => setResetStatus('idle'), 3000);
    } finally {
      setIsResetting(false);
    }
  };

  const handleSupervisorLogin = async () => {
    setSupervisorLoginError(null);
    try {
      const configRef = doc(db, 'config', 'global');
      const configSnap = await getDoc(configRef);
      const data = configSnap.data();
      const correctPassword = (configSnap.exists() && data && data.adminPassword) ? data.adminPassword : 'admin123';
      
      if (supervisorPassword === correctPassword) {
        setIsSupervisorAuthenticated(true);
        playBeep();
      } else {
        setSupervisorLoginError("maaf password anda salah");
      }
    } catch (error) {
      if (supervisorPassword === 'admin123') {
        setIsSupervisorAuthenticated(true);
        playBeep();
      } else {
        setSupervisorLoginError("maaf password anda salah");
      }
    }
  };

  const filteredSessions = sessions.filter(s => 
    s.studentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.deviceId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSaveConfig = async (newPassword?: string) => {
    setIsLoadingStudents(true);
    setConfigSaveStatus('idle');
    try {
      const configData: any = {
        googleFormEntryId: googleFormEntryId,
        examUrl: inputUrl
      };
      if (newPassword) {
        configData.adminPassword = newPassword;
      }
      await setDoc(doc(db, 'config', 'global'), configData, { merge: true });
      setConfigSaveStatus('success');
      setShowPasswordChange(false);
      setTimeout(() => setConfigSaveStatus('idle'), 3000);
    } catch (error) {
      console.error("Error saving config:", error);
      setConfigSaveStatus('error');
      setTimeout(() => setConfigSaveStatus('idle'), 3000);
    } finally {
      setIsLoadingStudents(false);
    }
  };

  if (view === 'supervisor') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6">
        {!isSupervisorAuthenticated ? (
          <div className="max-w-md mx-auto mt-10 md:mt-20 space-y-8 px-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-xl shadow-blue-500/20">
                <Settings className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-black">Supervisor Login</h1>
              <p className="text-slate-400 mt-2">Masukkan password untuk akses dashboard</p>
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type={showSupervisorPassword ? "text" : "password"}
                  value={supervisorPassword}
                  onChange={(e) => {
                    setSupervisorPassword(e.target.value);
                    setSupervisorLoginError(null);
                  }}
                  className={cn(
                    "w-full px-6 py-4 bg-slate-800 border rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all pr-14",
                    supervisorLoginError ? "border-red-500 ring-1 ring-red-500" : "border-slate-700"
                  )}
                  placeholder="Password Admin"
                />
                <button 
                  type="button"
                  onClick={() => setShowSupervisorPassword(!showSupervisorPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white transition-colors"
                >
                  {showSupervisorPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {supervisorLoginError && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center space-x-2 text-red-500 text-sm font-bold px-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>{supervisorLoginError}</span>
                </motion.div>
              )}
              <button 
                onClick={handleSupervisorLogin}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl font-black transition-all"
              >
                MASUK DASHBOARD
              </button>
              <button 
                onClick={() => setView('student')}
                className="w-full py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-black transition-all"
              >
                KEMBALI KE MENU SISWA
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-6 px-2 md:px-0">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 rounded-xl flex items-center justify-center font-black shadow-lg shrink-0">
                  SUP
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-black">Dashboard Pengawas</h1>
                  <p className="text-slate-400 text-[10px] md:text-sm">MTs Al-Khairaat Bunyu • Real-time Monitoring</p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar">
                  <button 
                    onClick={() => setSupervisorTab('monitoring')}
                    className={cn(
                      "flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all whitespace-nowrap",
                      supervisorTab === 'monitoring' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Monitoring
                  </button>
                  <button 
                    onClick={() => setSupervisorTab('students')}
                    className={cn(
                      "flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all whitespace-nowrap",
                      supervisorTab === 'students' ? "bg-blue-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    Manajemen Siswa
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text"
                      placeholder="Cari..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs w-full sm:w-40"
                    />
                  </div>
                  <button 
                    onClick={() => setIsSupervisorAuthenticated(false)}
                    className="p-2 bg-slate-800 hover:bg-red-600 rounded-xl transition-all shrink-0"
                    title="Logout"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {supervisorTab === 'monitoring' ? (
              <div className="bg-slate-800 rounded-2xl md:rounded-3xl border border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center bg-slate-900/30 gap-4">
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monitoring Real-time</h3>
                    <div className="flex items-center space-x-2 px-3 py-1 bg-blue-600/20 rounded-full border border-blue-500/30">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">
                        {sessions.filter(s => {
                          const isStale = s.status !== 'inactive' && 
                                         s.lastUpdate?.toDate && 
                                         (Date.now() - s.lastUpdate.toDate().getTime() > 15000);
                          return s.status === 'active' && !isStale;
                        }).length} Siswa Online
                      </span>
                    </div>
                  </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      {showConfirmReset ? (
                        <div className="flex items-center space-x-2 bg-slate-800 p-1 rounded-lg border border-red-500/50">
                          <span className="text-[8px] text-red-400 font-bold px-2">YAKIN?</span>
                          <button 
                            onClick={handleResetSessions}
                            disabled={isResetting}
                            className="px-3 py-1 bg-red-600 text-white rounded text-[9px] font-black uppercase disabled:opacity-50"
                          >
                            YA
                          </button>
                          <button 
                            onClick={() => setShowConfirmReset(false)}
                            className="px-3 py-1 bg-slate-700 text-white rounded text-[9px] font-black uppercase"
                          >
                            BATAL
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowConfirmReset(true)}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center space-x-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Reset Semua</span>
                        </button>
                      )}
                      
                      {resetStatus === 'success' && (
                        <span className="text-[9px] text-green-400 font-bold animate-bounce">BERHASIL!</span>
                      )}

                      {showPasswordChange ? (
                        <div className="flex items-center space-x-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
                          <input 
                            type="text"
                            placeholder="Password Baru"
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[9px] outline-none focus:ring-1 focus:ring-blue-500 w-24"
                          />
                          <button 
                            onClick={() => handleSaveConfig(newAdminPassword)}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-[9px] font-black uppercase"
                          >
                            SIMPAN
                          </button>
                          <button 
                            onClick={() => setShowPasswordChange(false)}
                            className="px-2 py-1 bg-slate-700 text-white rounded text-[9px] font-black uppercase"
                          >
                            BATAL
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setShowPasswordChange(true)}
                          className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-[9px] font-black uppercase transition-all"
                        >
                          Ganti Password
                        </button>
                      )}

                      {configSaveStatus === 'success' && (
                        <span className="text-[9px] text-green-400 font-bold animate-bounce">TERSIPAN!</span>
                      )}
                      
                      <div className="relative flex-1 sm:w-40">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input 
                        type="text"
                        placeholder="Cari..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-900 border border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-blue-500 text-[10px]"
                      />
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-700">
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Siswa</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Status</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Pelanggaran</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Update Terakhir</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-slate-500">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700">
                        {filteredSessions.map((session) => (
                          <tr key={session.id} className="hover:bg-slate-700/30 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center font-bold text-xs">
                                  {session.studentName?.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-bold">{session.studentName}</p>
                                  <p className="text-[10px] text-slate-500 font-mono">{session.deviceId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              {(() => {
                                const isStale = session.status !== 'inactive' && 
                                               session.lastUpdate?.toDate && 
                                               (Date.now() - session.lastUpdate.toDate().getTime() > 15000);
                                const displayStatus = isStale ? 'offline' : session.status;
                                
                                return (
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                    displayStatus === 'active' ? "bg-green-500/10 text-green-500" : 
                                    displayStatus === 'locked' ? "bg-red-500/10 text-red-500" : 
                                    displayStatus === 'inactive' ? "bg-yellow-500/10 text-yellow-500" :
                                    "bg-slate-500/10 text-slate-500"
                                  )}>
                                    {displayStatus === 'inactive' ? 'Selesai' : 
                                     displayStatus === 'offline' ? 'Offline' : displayStatus}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col space-y-1">
                                {session.violations && session.violations.length > 0 ? (
                                  <span className="text-red-400 text-[10px] font-bold leading-tight">
                                    {(() => {
                                      const counts: Record<string, number> = {};
                                      session.violations.forEach((v: any) => {
                                        const msg = typeof v === 'string' ? v : (v.message || "Pelanggaran");
                                        const cleanMsg = msg.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '').split(':')[0]; // Group shortcuts
                                        counts[cleanMsg] = (counts[cleanMsg] || 0) + 1;
                                      });
                                      return Object.entries(counts).reduce((a, b) => b[1] > a[1] ? b : a)[0];
                                    })()}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 text-xs italic">Aman</span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-xs text-slate-400">
                              {session.lastUpdate?.toDate ? session.lastUpdate.toDate().toLocaleTimeString() : 'N/A'}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center space-x-2">
                                <button 
                                  onClick={async () => {
                                    const ref = doc(db, 'sessions', session.id);
                                    await updateDoc(ref, { status: 'active', isLockedOut: false });
                                  }}
                                  className="p-2 bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded-lg transition-all"
                                  title="Buka Kunci"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={async () => {
                                    const ref = doc(db, 'sessions', session.id);
                                    await deleteDoc(ref);
                                  }}
                                  className="p-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-lg transition-all"
                                  title="Hapus Sesi"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
            ) : (
              <div className="bg-white rounded-2xl md:rounded-3xl p-3 md:p-6 text-slate-900 overflow-hidden">
                <StudentManagement />
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isExamActive && examUrl) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
        {/* Security Shield / Fullscreen Required Overlay */}
        {(!isFullscreen || !isVisualViewportSafe || !isSecure) && isExamActive && !isLockedOut && (
          <div className="absolute inset-0 z-[110] bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center">
            <div className="relative mb-8">
              <ShieldAlert className="w-24 h-24 text-red-500 animate-pulse" />
              <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full"></div>
            </div>
            <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">KEAMANAN TERGANGGU</h2>
            <p className="text-slate-400 mb-8 max-w-sm text-lg leading-tight">
              Sistem mendeteksi upaya navigasi atau munculnya kontrol sistem HP. 
              <span className="block mt-2 text-red-400 font-bold uppercase text-xs tracking-widest">Akses soal disembunyikan otomatis.</span>
            </p>
            <button 
              onClick={() => {
                setIsSecure(true);
                setIsVisualViewportSafe(true);
                handleStartExam();
              }}
              className="group relative px-12 py-5 bg-white text-slate-900 rounded-2xl font-black shadow-[0_0_50px_rgba(255,255,255,0.2)] active:scale-95 transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-blue-600 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              <span className="relative group-hover:text-white flex items-center space-x-3">
                <Maximize className="w-6 h-6" />
                <span>KEMBALI KE UJIAN</span>
              </span>
            </button>

            <button 
              onClick={() => handleExitExam(true)}
              className="mt-6 px-8 py-3 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 rounded-xl font-bold text-xs transition-all flex items-center space-x-2"
            >
              <LogOut className="w-4 h-4" />
              <span>KELUAR DARI APLIKASI</span>
            </button>
            <p className="mt-8 text-[10px] text-slate-600 font-mono uppercase tracking-[0.3em]">Integrity Shield v3.0 Active</p>
          </div>
        )}

        {/* Lockout Overlay */}
        {isLockedOut && (
          <div className="absolute inset-0 z-[120] bg-red-950 flex flex-col items-center justify-center p-6 text-center">
            <XCircle className="w-24 h-24 text-red-500 mb-6 animate-bounce" />
            <h2 className="text-4xl font-black text-white mb-4">UJIAN DIHENTIKAN!</h2>
            <p className="text-red-200 mb-8 max-w-md text-lg">
              Sistem mendeteksi upaya kecurangan atau navigasi dilarang. 
              Sesuai kebijakan **Zero Tolerance**, akses Anda telah diblokir secara permanen.
            </p>
            <div className="bg-red-900/50 p-6 rounded-3xl border border-red-500/30 mb-8 w-full max-w-sm">
              <p className="text-white font-bold mb-4">ID PERANGKAT: {deviceId}</p>
              <div className="text-left space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                <p className="text-red-400 text-[10px] font-black uppercase tracking-widest mb-2">Penyebab Blokir:</p>
                {violationLog.map((log, i) => (
                  <p key={i} className="text-red-200 text-[10px] font-mono leading-tight border-l-2 border-red-500 pl-2">
                    {log}
                  </p>
                ))}
              </div>
              <p className="text-red-300 text-[10px] mt-4 font-bold">Silakan lapor ke pengawas dengan menunjukkan layar ini.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => {
                  setIsLockedOut(false);
                  setWarningCount(0);
                  setViolationLog([]);
                  handleStartExam(); // Use handleStartExam instead of handleExitExam to return to questions
                }}
                className="px-6 py-4 bg-white text-red-900 rounded-2xl font-black shadow-2xl active:scale-95 transition-transform flex items-center justify-center space-x-2"
              >
                <Maximize className="w-5 h-5" />
                <span>KEMBALI KE SOAL</span>
              </button>
              <button 
                onClick={() => handleExitExam(true)}
                className="px-6 py-4 bg-red-600 border-2 border-white/30 text-white rounded-2xl font-black shadow-2xl active:scale-95 transition-transform flex items-center justify-center space-x-2"
              >
                <LogOut className="w-5 h-5" />
                <span>KELUAR PAKSA</span>
              </button>
            </div>
          </div>
        )}

        {/* Security Warning Overlay - Now a subtle top banner */}
        <AnimatePresence>
          {showWarning && !isLockedOut && (
            <motion.div 
              initial={{ opacity: 0, y: -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -100 }}
              className="absolute top-0 left-0 right-0 z-[150] p-4 flex justify-center pointer-events-none"
            >
              <div className="bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-4 pointer-events-auto border-2 border-white/20 backdrop-blur-md">
                <div className="bg-white/20 p-2 rounded-xl">
                  <ShieldAlert className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold leading-tight">{warningMessage}</p>
                </div>
                <button 
                  onClick={() => {
                    playBeep();
                    setShowWarning(false);
                  }}
                  className="bg-white text-red-600 px-4 py-2 rounded-xl font-black text-[10px] hover:bg-red-50 transition-all active:scale-95"
                >
                  KEMBALI KE SOAL
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Exam Header / Navigation */}
        <div 
          className="bg-slate-900 text-white p-2 md:p-4 flex items-center justify-between border-b border-slate-800 select-none"
          onTouchStart={(e) => {
            const timer = setTimeout(() => handleExitExam(true), 3000);
            e.currentTarget.dataset.timer = timer.toString();
          }}
          onTouchEnd={(e) => {
            clearTimeout(parseInt(e.currentTarget.dataset.timer || '0'));
          }}
        >
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-lg md:rounded-xl flex items-center justify-center font-black shadow-lg shadow-blue-500/20 text-xs md:text-base shrink-0">
              CBT
            </div>
            <div className="hidden xs:block">
              <h1 className="font-bold text-[10px] md:text-sm leading-tight">Exambro CBT</h1>
              <div className="flex items-center space-x-1 md:space-x-2">
                <p className="text-[8px] md:text-[10px] text-slate-400">MTs Bunyu</p>
                <span className="w-0.5 h-0.5 bg-slate-600 rounded-full"></span>
                <div className="flex items-center space-x-1">
                  <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[7px] md:text-[9px] text-green-500 font-bold uppercase tracking-widest">Secure</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 md:space-x-2">
            <div className="flex items-center space-x-0.5 md:space-x-1">
              <button 
                onClick={() => {
                  playBeep();
                  window.history.back();
                }}
                className="flex items-center space-x-1 px-1.5 md:px-2 py-1 md:py-1.5 hover:bg-slate-800 rounded-lg transition-colors group"
                title="Kembali"
              >
                <ArrowLeft className="w-3.5 h-3.5 md:w-5 md:h-5 text-slate-400 group-hover:text-white" />
                <span className="text-[8px] md:text-xs font-bold text-slate-400 group-hover:text-white">BACK</span>
              </button>
              <button 
                onClick={() => {
                  playBeep();
                  window.history.forward();
                }}
                className="flex items-center space-x-1 px-1.5 md:px-2 py-1 md:py-1.5 hover:bg-slate-800 rounded-lg transition-colors group"
                title="Selanjutnya"
              >
                <span className="text-[8px] md:text-xs font-bold text-slate-400 group-hover:text-white">NEXT</span>
                <ArrowRight className="w-3.5 h-3.5 md:w-5 md:h-5 text-slate-400 group-hover:text-white" />
              </button>
              <div className="h-4 md:h-6 w-px bg-slate-700 mx-0.5 md:mx-2" />
            </div>

            <div className="relative">
              {showResetConfirm ? (
                <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-48">
                  <p className="text-[10px] font-bold text-slate-300 mb-2">Ulangi proses login/scan?</p>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => {
                        setShowResetConfirm(false);
                        handleExitExam(true);
                      }}
                      className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold"
                    >
                      YA
                    </button>
                    <button 
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 py-1.5 bg-slate-700 text-white rounded-lg text-[10px] font-bold"
                    >
                      TIDAK
                    </button>
                  </div>
                </div>
              ) : null}
              <button 
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center space-x-1 px-2 md:px-4 py-1.5 md:py-2 bg-slate-700 hover:bg-slate-600 rounded-lg md:rounded-xl font-bold text-[8px] md:text-sm transition-all shrink-0"
              >
                <RefreshCw className="w-3 h-3 md:w-4 md:h-4" />
                <span>Ulang</span>
              </button>
            </div>

            <div className="relative">
              {showSubmitConfirm ? (
                <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-48">
                  <p className="text-[10px] font-bold text-slate-300 mb-2">Sudah kirim jawaban di Google Form?</p>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => {
                        setShowSubmitConfirm(false);
                        playBeep();
                      }}
                      className="flex-1 py-1.5 bg-green-600 text-white rounded-lg text-[10px] font-bold"
                    >
                      SUDAH
                    </button>
                    <button 
                      onClick={() => setShowSubmitConfirm(false)}
                      className="flex-1 py-1.5 bg-slate-700 text-white rounded-lg text-[10px] font-bold"
                    >
                      BELUM
                    </button>
                  </div>
                </div>
              ) : null}
              <button 
                onClick={() => setShowSubmitConfirm(true)}
                className="flex items-center space-x-1 px-2 md:px-4 py-1.5 md:py-2 bg-green-600 hover:bg-green-700 rounded-lg md:rounded-xl font-bold text-[8px] md:text-sm transition-all shrink-0"
              >
                <Send className="w-3 h-3 md:w-4 md:h-4" />
                <span>Kirim</span>
              </button>
            </div>

            <div className="relative">
              {showExitConfirm ? (
                <div className="absolute right-0 top-full mt-2 bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-2xl z-50 w-48">
                  <p className="text-[10px] font-bold text-slate-300 mb-2">Yakin ingin keluar ujian?</p>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => handleExitExam(true)}
                      className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold"
                    >
                      KELUAR
                    </button>
                    <button 
                      onClick={() => setShowExitConfirm(false)}
                      className="flex-1 py-1.5 bg-slate-700 text-white rounded-lg text-[10px] font-bold"
                    >
                      BATAL
                    </button>
                  </div>
                </div>
              ) : null}
              <button 
                onClick={() => setShowExitConfirm(true)}
                className="flex items-center space-x-1 px-2 md:px-4 py-1.5 md:py-2 bg-red-600 hover:bg-red-700 rounded-lg md:rounded-xl font-bold text-[8px] md:text-sm transition-all shadow-lg shadow-red-900/20 shrink-0"
              >
                <LogOut className="w-3 h-3 md:w-4 md:h-4" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        </div>

        {/* Security Banner */}
        <div className="bg-red-600 text-white py-1 px-4 text-[10px] font-black flex items-center justify-center space-x-2 animate-pulse">
          <ShieldAlert className="w-3 h-3" />
          <span>SISTEM PENGAWASAN AKTIF: DILARANG SCREENSHOT / BUKA TAB BARU</span>
        </div>

        {/* Google Form Iframe */}
        <div className="flex-1 bg-white relative overflow-hidden">
          {/* Multi-Dynamic Security Watermarks */}
          {watermarks.map((w) => (
            <div 
              key={w.id}
              className="absolute z-10 pointer-events-none select-none opacity-[0.04] font-black text-slate-900 transition-all duration-[3000ms] ease-in-out whitespace-nowrap"
              style={{ 
                left: `${w.x}%`, 
                top: `${w.y}%`,
                transform: `rotate(${w.rot}deg)`
              }}
            >
              <div className="flex flex-col items-center">
                <p className="text-4xl uppercase tracking-tighter">{studentName}</p>
                <p className="text-xl font-mono">{deviceId}</p>
                <p className="text-xs opacity-50">MTs Al-Khairaat Bunyu • {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          ))}

          {/* Invisible Security Grid Overlay (Prevents easy screenshots) */}
          <div className="absolute inset-0 z-20 pointer-events-none opacity-[0.02] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:20px_20px]"></div>

          {/* Madrasah Running Text Watermark */}
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center overflow-hidden">
            <motion.div
              animate={{ x: ["100%", "-100%"] }}
              transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
              className="whitespace-nowrap"
            >
              <span className="text-emerald-400 font-black text-3xl md:text-5xl opacity-30 drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] tracking-[0.3em] uppercase">
                {studentName} • {deviceId} • MTS AL-KHAIRAAT BUNYU • {studentName} • {deviceId} • MTS AL-KHAIRAAT BUNYU
              </span>
            </motion.div>
          </div>

          <iframe 
            src={(() => {
              if (!examUrl) return '';
              if (googleFormEntryId && examUrl.includes('docs.google.com/forms') && !examUrl.includes(`entry.${googleFormEntryId}=`)) {
                const separator = examUrl.includes('?') ? '&' : '?';
                return `${examUrl}${separator}entry.${googleFormEntryId}=${encodeURIComponent(studentName)}`;
              }
              return examUrl;
            })()}
            className={cn(
              "w-full h-full border-none transition-all duration-500",
              (!isFullscreen || !isVisualViewportSafe || !isSecure) ? "blur-3xl scale-110 opacity-0" : "blur-0 scale-100 opacity-100"
            )}
            title="Exam Question"
          />
        </div>

        {/* Bottom Bar */}
        <div className="bg-slate-900 text-slate-400 p-2 text-[9px] flex items-center justify-between px-4 font-bold uppercase tracking-widest">
          <div className="flex items-center space-x-2">
            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
            <span>ZERO TOLERANCE MODE: ACTIVE</span>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => handleExitExam(true)}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center space-x-2 font-black text-[10px] shadow-lg shadow-red-900/30 active:scale-95"
            >
              <XCircle className="w-4 h-4" />
              <span>SELESAI & KELUAR</span>
            </button>
            <div className="flex items-center space-x-1">
              <span className="text-[8px] text-slate-500">PWA:</span>
              <span className={cn("text-[8px] font-black", isStandalone ? "text-green-500" : "text-yellow-500")}>
                {isStandalone ? "STANDALONE" : "BROWSER"}
              </span>
            </div>
            <span>Device ID: {deviceId}</span>
            <span className="text-red-500">Security: Strict</span>
          </div>
        </div>
      </div>
    );
  }

  const [isExiting, setIsExiting] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 md:p-6">
      {/* Share Modal */}
      <AnimatePresence>
        {showShare && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShare(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden p-8 text-center"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                  <QrCode className="w-5 h-5 text-blue-600" />
                  <span>Bagikan Aplikasi</span>
                </h3>
                <button
                  onClick={() => setShowShare(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100 mb-6 inline-block">
                <img 
                  src={QR_CODE_API} 
                  alt="App QR Code" 
                  className="w-48 h-48 mx-auto"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-left ml-1">Link Aplikasi</p>
                  <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <input 
                      type="text" 
                      readOnly 
                      value={APP_URL} 
                      className="flex-1 text-[10px] font-mono text-slate-500 outline-none bg-transparent px-2 truncate"
                    />
                    <button 
                      onClick={handleCopyLink}
                      className={cn(
                        "p-2 rounded-lg transition-all shrink-0",
                        copied ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
                      )}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => setShowShare(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all"
                >
                  TUTUP
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-md space-y-6">
        {/* PWA Install Banner */}
        <AnimatePresence>
          {showInstallButton && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-blue-600 text-white p-3 md:p-4 rounded-2xl md:rounded-3xl shadow-xl flex items-center justify-between gap-3 md:gap-4"
            >
              <div className="flex items-center gap-2 md:gap-3">
                <div className="bg-white/20 p-1.5 md:p-2 rounded-lg md:rounded-xl">
                  <Maximize className="w-5 h-5 md:w-6 md:h-6" />
                </div>
                <div className="text-left">
                  <p className="font-black text-xs md:text-sm uppercase tracking-tight">Pasang Aplikasi</p>
                  <p className="text-[9px] md:text-[10px] text-blue-100 font-bold">Akses lebih cepat & aman</p>
                </div>
              </div>
              <button
                onClick={handleInstallClick}
                className="bg-white text-blue-600 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl font-black text-[10px] md:text-xs hover:bg-blue-50 transition-all shadow-lg active:scale-95 whitespace-nowrap"
              >
                PASANG
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl shadow-blue-100 border border-slate-100 overflow-hidden"
        >
        <div className="p-6 md:p-10 text-center relative">
          <button 
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              playBeep();
              setShowShare(!showShare);
            }}
            className="absolute right-4 top-4 md:right-6 md:top-6 p-2 md:p-3 bg-slate-50 hover:bg-slate-100 rounded-xl md:rounded-2xl text-slate-400 hover:text-blue-600 transition-all"
            title="Bagikan Aplikasi"
          >
            <Share2 className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-blue-600 rounded-2xl md:rounded-3xl mb-4 md:mb-6 shadow-xl shadow-blue-200">
            <ShieldAlert className="w-10 h-10 md:w-12 md:h-12 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Exambro CBT</h1>
          <div className="flex items-center justify-center space-x-2 mt-1">
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded text-[9px] font-bold">v{APP_VERSION}</span>
            <button 
              onClick={() => window.location.reload()}
              className="flex items-center space-x-1 px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded text-[9px] font-bold hover:bg-blue-100 transition-colors"
              title="Perbarui Aplikasi"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>PERBARUI</span>
            </button>
          </div>
          <p className="text-slate-500 mt-1 md:mt-2 font-medium text-sm md:text-base">MTs Al-Khairaat Bunyu</p>
          
          <div className="mt-6 md:mt-8 grid grid-cols-2 gap-2 md:gap-3">
            <div className="bg-slate-50 p-2 md:p-3 rounded-xl md:rounded-2xl border border-slate-100 flex items-center space-x-2 md:space-x-3">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <ShieldAlert className="w-3.5 h-3.5 md:w-4 md:h-4 text-green-600" />
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">Anti-Cheat</p>
                <p className="text-[10px] md:text-xs font-black text-slate-700">AKTIF</p>
              </div>
            </div>
            <div className="bg-slate-50 p-2 md:p-3 rounded-xl md:rounded-2xl border border-slate-100 flex items-center space-x-2 md:space-x-3">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <Maximize className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600" />
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">Display</p>
                <p className="text-[10px] md:text-xs font-black text-slate-700">FULLSCREEN</p>
              </div>
            </div>
          </div>

          <div className="mt-3 md:mt-4 p-2 md:p-3 bg-slate-900 rounded-xl md:rounded-2xl flex items-center justify-between px-4 md:px-5">
            <div className="flex items-center space-x-2 md:space-x-3">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[8px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest">Device Integrity</span>
            </div>
            <span className="text-[8px] md:text-[10px] text-green-500 font-black">VERIFIED</span>
          </div>
        </div>

        <div className="px-6 md:px-10 pb-8 md:pb-10 space-y-6">
          <AnimatePresence mode="wait">
            {!isNameSet ? (
              <motion.div 
                key="login"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs md:text-sm font-black text-slate-700 ml-1">Pilih Jenjang Kelas</label>
                    <div className="grid grid-cols-3 gap-2 md:gap-3">
                      {['VII', 'VIII', 'IX'].map((cls) => (
                        <button
                          key={cls}
                          onClick={() => {
                            setSelectedClass(cls);
                            setStudentName('');
                          }}
                          className={cn(
                            "py-2.5 md:py-3 rounded-xl font-black transition-all border-2 text-sm md:text-base",
                            selectedClass === cls
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                              : "bg-white border-slate-100 text-slate-600 hover:border-blue-200"
                          )}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedClass && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-2"
                    >
                      <label className="text-xs md:text-sm font-black text-slate-700 ml-1">Pilih Nama Anda</label>
                      {isLoadingStudents ? (
                        <div className="w-full py-3 md:py-4 bg-slate-50 rounded-xl md:rounded-2xl flex items-center justify-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                          <span className="text-[10px] md:text-xs font-bold text-slate-500">Memuat daftar nama...</span>
                        </div>
                      ) : (
                        <select
                          value={studentName}
                          onChange={(e) => setStudentName(e.target.value)}
                          className="w-full px-4 md:px-6 py-3 md:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all font-bold appearance-none text-sm md:text-base"
                        >
                          <option value="">-- Pilih Nama --</option>
                          {studentList.map((s) => (
                            <option key={s.uid} value={s.displayName}>
                              {s.displayName}
                            </option>
                          ))}
                        </select>
                      )}
                    </motion.div>
                  )}
                </div>
                <button 
                  onClick={handleSaveName}
                  disabled={!studentName}
                  className="w-full py-3.5 md:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl md:rounded-2xl font-black shadow-xl shadow-blue-200 transition-all disabled:opacity-50 disabled:grayscale text-sm md:text-base"
                >
                  SIMPAN IDENTITAS
                </button>
              </motion.div>
            ) : !examUrl ? (
              <motion.div 
                key="scan-step"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {!showScanner ? (
                  <div className="space-y-6">
                    <div className="bg-blue-50 p-6 rounded-3xl border-2 border-blue-100 text-center space-y-6">
                      <div className="space-y-2">
                        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-blue-200 mb-4">
                          <QrCode className="w-10 h-10 text-white" />
                        </div>
                        <h3 className="text-2xl font-black text-blue-900 uppercase leading-tight">
                          Identitas Tersimpan!
                        </h3>
                        <p className="text-slate-500 font-bold text-sm">
                          Halo, <span className="text-blue-600">{studentName}</span>. Silakan scan QR Code soal untuk memulai ujian.
                        </p>
                      </div>

                      <button 
                        onClick={startScanner}
                        className="w-full py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xl transition-all shadow-xl shadow-blue-200 flex items-center justify-center space-x-3"
                      >
                        <Camera className="w-6 h-6" />
                        <span>SCAN QR CODE SOAL</span>
                      </button>

                      <button 
                        onClick={() => {
                          localStorage.clear();
                          window.location.reload();
                        }}
                        className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                      >
                        Ganti Identitas
                      </button>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-200"></span>
                      </div>
                      <div className="relative flex justify-center text-[10px] uppercase">
                        <span className="bg-white px-4 text-slate-400 font-black tracking-widest">ATAU UPLOAD</span>
                      </div>
                    </div>

                    <label className={cn(
                      "w-full py-4 bg-white border-2 border-slate-200 hover:border-blue-500 text-slate-600 rounded-2xl font-black text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer group relative overflow-hidden",
                      isUploading && "opacity-70 pointer-events-none"
                    )}>
                      {isUploading ? (
                        <>
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          <span>MEMPROSES GAMBAR...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
                          <span>UPLOAD GAMBAR QR</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 font-bold text-center">
                      Tips: Pastikan QR Code terlihat jelas dan tidak terpotong.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div id="reader" className="overflow-hidden rounded-3xl border-4 border-slate-900 shadow-2xl bg-black aspect-square"></div>
                    <button 
                      onClick={stopScanner}
                      className="w-full py-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl font-black transition-all flex items-center justify-center space-x-2 text-sm"
                    >
                      <XCircle className="w-5 h-5" />
                      <span>BATALKAN SCAN</span>
                    </button>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="welcome"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {!showScanner ? (
                  <div className="space-y-6">
                    <div className="bg-blue-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border-2 border-blue-100 text-center space-y-4 md:space-y-6">
                      <div className="space-y-2">
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-blue-200 mb-4">
                          <Play className="w-8 h-8 md:w-10 md:h-10 text-white fill-current" />
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-blue-900 uppercase leading-tight">
                          Siap Ujian!
                        </h3>
                        <p className="text-slate-500 font-bold text-xs md:text-sm">
                          Link soal berhasil dideteksi. Klik tombol di bawah untuk masuk ke soal.
                        </p>
                      </div>

                      <div className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-blue-100 text-left space-y-3">
                        <div className="flex items-center justify-between border-b border-blue-50 pb-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Siswa</span>
                          <span className="text-xs font-bold text-blue-600">{studentName}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-blue-50 pb-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kelas</span>
                          <span className="text-xs font-bold text-blue-600">{selectedClass}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <motion.button 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleStartExam()}
                          className="w-full py-4 md:py-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl md:rounded-2xl font-black text-lg md:text-xl transition-all shadow-xl shadow-blue-200 flex items-center justify-center space-x-3"
                        >
                          <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                          <span>MULAI UJIAN</span>
                        </motion.button>
                        <button 
                          onClick={startScanner}
                          className="w-full py-3 bg-white border-2 border-blue-100 text-blue-600 hover:bg-blue-50 rounded-xl font-bold text-[10px] transition-all flex items-center justify-center space-x-2"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>SALAH SCAN? SCAN ULANG</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div id="reader" className="overflow-hidden rounded-2xl md:rounded-3xl border-4 border-slate-900 shadow-2xl bg-black aspect-square"></div>
                    <button 
                      onClick={stopScanner}
                      className="w-full py-3 md:py-4 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl md:rounded-2xl font-black transition-all flex items-center justify-center space-x-2 text-sm"
                    >
                      <XCircle className="w-4 h-4 md:w-5 md:h-5" />
                      <span>BATALKAN SCAN</span>
                    </button>
                  </div>
                )}

                <div id="reader-hidden" style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bg-slate-50 p-4 md:p-6 text-center border-t border-slate-100 flex flex-col space-y-3 md:space-y-4">
          <button 
            onClick={async () => {
              if (isExiting) return;
              setIsExiting(true);
              playBeep();
              
              // Update status to offline in Firestore before clearing local state
              if (isNameSet) {
                try {
                  const sessionRef = doc(db, 'sessions', deviceId);
                  await updateDoc(sessionRef, {
                    status: 'offline',
                    lastUpdate: serverTimestamp()
                  });
                } catch (error) {
                  console.error("Failed to update status to offline:", error);
                }
              }

              // Clear state
              localStorage.clear();
              setIsExited(true);
              setIsExiting(false);
              
              // Try to close, though restricted
              setTimeout(() => {
                window.close();
              }, 1000);
            }}
            disabled={isExiting}
            className={cn(
              "w-full py-3 md:py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl md:rounded-2xl font-black text-sm md:text-base transition-all shadow-lg shadow-red-200 flex items-center justify-center space-x-2 active:scale-95",
              isExiting && "opacity-70 cursor-not-allowed"
            )}
          >
            {isExiting ? (
              <>
                <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                <span>MEMPROSES KELUAR...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 md:w-5 md:h-5" />
                <span>KELUAR APLIKASI</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-center space-x-2 text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 md:w-4 md:h-4" />
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">Sistem Pengawasan Aktif</span>
          </div>
          
          <button 
            onClick={() => setView('supervisor')}
            className="text-[9px] md:text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors flex items-center justify-center space-x-1"
          >
            <Settings className="w-2.5 h-2.5 md:w-3 md:h-3" />
            <span>MENU PENGAWAS</span>
          </button>
        </div>
      </motion.div>
    </div>
    
    {/* Error Toast */}
    <AnimatePresence>
      {errorMessage && (
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-24 left-4 right-4 z-[100] flex justify-center pointer-events-none"
        >
          <div className="bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-red-500 pointer-events-auto">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-bold">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-white/20 rounded-lg">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Final Exit Screen Overlay */}
    <AnimatePresence>
      {isExited && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-center p-6 text-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl"
          >
            <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Sesi Berakhir</h2>
            <p className="text-slate-500 font-bold text-sm mb-8">
              Data ujian Anda telah tersimpan dengan aman. Silakan tutup aplikasi ini dari menu HP Anda.
            </p>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Terakhir</p>
                <p className="text-emerald-600 font-black">OFFLINE / SELESAI</p>
              </div>
              <p className="text-[10px] text-slate-400 font-bold italic">
                Aplikasi ini sekarang aman untuk ditutup.
              </p>
            </div>
          </motion.div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] hover:text-white transition-colors"
          >
            Masuk Kembali?
          </button>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  );
}
