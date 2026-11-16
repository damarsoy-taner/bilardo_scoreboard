let scores = { 1: 0, 2: 0 }, turn = 1, totalInnings = 1, highRuns = { 1: { hr1: 0, hr2: 0 }, 2: { hr1: 0, hr2: 0 } }, currentRun = 0;
let matchSecs = 0, currentShot, isPaused = true, shotClockPaused = false, timerInt, equalizingTurn = false;
let isPenaltyMode = false, penaltyScores = { 1: 0, 2: 0 }, penaltyRound = 1;
let historyStack = [];
const MAX_HISTORY = 50;
let prevRenderedScores = { s1: null, s2: null };
let flapCleanupTimers = {};
let flapSoundTimers = {};
let config = { mode: 'standard', standardTarget: 40, maxInnings: 45, targets: { 1: 40, 2: 40 }, shotActive: true, viewMode: 'flap' };
const VIEW_MODE_KEY = 'bilardo_gorunum_modu';
const CIRC = 471.2;
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let lastActionTime = 0;
let turnLockUntil = 0;

function guardTouchEvent(e) {
    if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (isTouchDevice && e.type === 'click') {
            return false;
        }
        if (e.type === 'touchend' || e.type === 'touchstart') {
            if (e.preventDefault) e.preventDefault();
        }
    }
    const now = Date.now();
    if (now - lastActionTime < 450) return false;
    lastActionTime = now;
    return true;
}

// Ses Sentezleyici
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(freq, dur) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
}
function playFlapSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    // Mekanik plastik/metal yaprak çarpma sesi (filtreli kısa darbe + tok gövde vuruşu)
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.03);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1850, now);
    filter.Q.setValueAtTime(1.6, now);
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.28, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start(now);

    const thud = audioCtx.createOscillator();
    const thudGain = audioCtx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(220, now);
    thud.frequency.exponentialRampToValueAtTime(80, now + 0.032);
    thudGain.gain.setValueAtTime(0.18, now);
    thudGain.gain.exponentialRampToValueAtTime(0.005, now + 0.032);
    thud.connect(thudGain);
    thudGain.connect(audioCtx.destination);
    thud.start(now);
    thud.stop(now + 0.035);
}

// Türkçe Sesli Anons Sistemi (Web Speech API)
let trVoice = null;
let speechUnlocked = false;
let speakTimer = null;
function loadTurkishVoice() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;
    const trVoices = voices.filter(v => v.lang === 'tr-TR' || (v.lang && v.lang.toLowerCase().indexOf('tr') === 0));
    if (trVoices.length === 0) {
        trVoice = null;
        return;
    }
    const matchName = (v, kw) => v.name && v.name.toLowerCase().indexOf(kw) !== -1;
    trVoice =
        trVoices.find(v => matchName(v, 'google türkçe') || matchName(v, 'google turkce') || matchName(v, 'natural') || matchName(v, 'online')) ||
        trVoices.find(v => matchName(v, 'emel') || matchName(v, 'seda')) ||
        trVoices.find(v => matchName(v, 'yelda')) ||
        trVoices.find(v => matchName(v, 'female') || matchName(v, 'kadın') || matchName(v, 'kadin')) ||
        trVoices.find(v => v.lang === 'tr-TR') ||
        trVoices[0];
}
if ('speechSynthesis' in window) {
    loadTurkishVoice();
    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = loadTurkishVoice;
    }
    if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', loadTurkishVoice);
    }
}
function unlockSpeechEngine() {
    if (speechUnlocked) return;
    speechUnlocked = true;
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if ('speechSynthesis' in window) {
        try {
            loadTurkishVoice();
            const silent = new SpeechSynthesisUtterance('');
            silent.lang = 'tr-TR';
            silent.volume = 0;
            silent.rate = 0.78;
            silent.pitch = 1.12;
            if (trVoice) silent.voice = trVoice;
            window.speechSynthesis.speak(silent);
        } catch (e) {}
    }
}
document.addEventListener('touchstart', unlockSpeechEngine, { once: true });
document.addEventListener('click', unlockSpeechEngine, { once: true });

function numberToTurkish(n) {
    const num = Math.max(0, Math.floor(n));
    const ones = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
    const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
    if (num < 10) return ones[num];
    if (num < 100) {
        const t = tens[Math.floor(num / 10)];
        const o = num % 10;
        return o === 0 ? t : `${t} ${ones[o]}`;
    }
    if (num < 1000) {
        const h = Math.floor(num / 100);
        const rem = num % 100;
        const hStr = h === 1 ? 'yüz' : `${ones[h]} yüz`;
        return rem === 0 ? hStr : `${hStr} ${numberToTurkish(rem)}`;
    }
    return String(num);
}
function speakText(text, opts) {
    if (!('speechSynthesis' in window) || !text) return;
    if (speakTimer) {
        clearTimeout(speakTimer);
        speakTimer = null;
    }
    speakTimer = setTimeout(() => {
        speakTimer = null;
        try {
            if (!trVoice) loadTurkishVoice();
            window.speechSynthesis.cancel();
            if (typeof window.speechSynthesis.resume === 'function') {
                window.speechSynthesis.resume();
            }
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'tr-TR';
            utterance.volume = 1.0;
            utterance.rate = (opts && opts.rate) ? opts.rate : 0.78;
            utterance.pitch = (opts && opts.pitch) ? opts.pitch : 1.12;
            if (trVoice) utterance.voice = trVoice;
            window.speechSynthesis.speak(utterance);
        } catch (e) {}
    }, 20);
}
function getRunPitch(run) {
    return Math.min(1.22, 1.12 + Math.max(0, run - 1) * 0.015);
}

function resetMatch() { if(confirm("Mevcut maç silinsin mi?")) location.reload(); }
function setMode(m) {
    config.mode = m;
    document.getElementById('btn-mode-standard').classList.toggle('active', m === 'standard');
    document.getElementById('btn-mode-handicap').classList.toggle('active', m === 'handicap');
    document.getElementById('standard-options').style.display = m === 'standard' ? 'flex' : 'none';
    document.getElementById('handicap-options').style.display = m === 'handicap' ? 'flex' : 'none';
}
function setStandardTarget(val) {
    config.standardTarget = val;
    document.getElementById('btn-target-30').classList.toggle('active', val === 30);
    document.getElementById('btn-target-40').classList.toggle('active', val === 40);
}
function setViewMode(mode) {
    config.viewMode = mode === 'segment' ? 'segment' : 'flap';
    try { localStorage.setItem(VIEW_MODE_KEY, config.viewMode); } catch (e) {}
    const flapBtn = document.getElementById('btn-view-flap');
    const segBtn = document.getElementById('btn-view-seg');
    if (flapBtn) flapBtn.classList.toggle('active', config.viewMode === 'flap');
    if (segBtn) segBtn.classList.toggle('active', config.viewMode === 'segment');
    prevRenderedScores = { s1: null, s2: null };
}
(function initViewMode() {
    let saved = 'flap';
    try { saved = localStorage.getItem(VIEW_MODE_KEY) || 'flap'; } catch (e) {}
    setViewMode(saved);
})();
function toggleShotActive() {
    config.shotActive = !config.shotActive;
    const btn = document.getElementById('btn-shot-toggle');
    btn.innerText = config.shotActive ? "SÜRE SİSTEMİ: AKTİF" : "SÜRE SİSTEMİ: PASİF";
    btn.classList.toggle('active', config.shotActive);
    document.getElementById('shot-settings-area').style.opacity = config.shotActive ? "1" : "0.3";
}
function startMatch() {
    config.name1 = document.getElementById('name1').value || "BEYAZ";
    config.name2 = document.getElementById('name2').value || "SARI";
    if (config.mode === 'standard') {
        config.targets = { 1: config.standardTarget, 2: config.standardTarget };
        config.maxInnings = 45;
    } else {
        const t1 = parseInt(document.getElementById('input-target-1').value);
        const t2 = parseInt(document.getElementById('input-target-2').value);
        config.targets = { 1: t1 > 0 ? t1 : 40, 2: t2 > 0 ? t2 : 30 };
        config.maxInnings = null;
    }
    equalizingTurn = false;
    isPenaltyMode = false;
    penaltyScores = { 1: 0, 2: 0 };
    penaltyRound = 1;
    historyStack = [];
    prevRenderedScores = { s1: null, s2: null };
    config.shotTime = parseInt(document.getElementById('input-shot-time').value);
    config.toCount = parseInt(document.getElementById('input-to-count').value);
    config.warnTime = parseInt(document.getElementById('input-warn-time').value) || 10;
    config.timeouts = { 1: config.toCount, 2: config.toCount };
    
    document.getElementById('disp-name1').innerText = config.name1;
    document.getElementById('disp-name2').innerText = config.name2;
    document.getElementById('target-badge-1').innerText = `(${config.targets[1]})`;
    document.getElementById('target-badge-2').innerText = `(${config.targets[2]})`;
    document.getElementById('clock-box').style.visibility = config.shotActive ? "visible" : "hidden";
    
    currentShot = config.shotTime;
    document.getElementById('settings-overlay').style.display = 'none';
    isPaused = false;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    timerInt = setInterval(tick, 1000);
    updateUI();
}
function tick() {
    if (isPaused) return;
    matchSecs++;
    let m = Math.floor(matchSecs / 60), s = matchSecs % 60;
    document.getElementById('timer-display').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    
    if (config.shotActive && !shotClockPaused && currentShot > 0) {
        currentShot--; 
        updateClockUI();
        
        if (currentShot === 15) {
            speakText('Son, ... on beş saniye', { pitch: 1.16, rate: 0.78 });
        }
        
        // SESLİ UYARI MANTIĞI
        if (currentShot <= config.warnTime && currentShot > 0) {
            playBeep(880, 0.1); // Kısa Bip
        }
        
        if (currentShot === 0) {
            playBeep(440, 0.5); // Süre bitti kalın bip
            changeTurn();
        }
    }
}
function commitRun(p, run) {
    if (run <= 0) return;
    if (run > highRuns[p].hr1) {
        highRuns[p].hr2 = highRuns[p].hr1;
        highRuns[p].hr1 = run;
    } else if (run > highRuns[p].hr2) {
        highRuns[p].hr2 = run;
    }
}
function getPlayerHighRuns(p) {
    let { hr1, hr2 } = highRuns[p];
    if (!isPenaltyMode && p === turn && currentRun > 0) {
        if (currentRun > hr1) {
            hr2 = hr1;
            hr1 = currentRun;
        } else if (currentRun > hr2) {
            hr2 = currentRun;
        }
    }
    return { hr1, hr2 };
}
function saveSnapshot() {
    historyStack.push({
        scores: { 1: scores[1], 2: scores[2] },
        turn: turn,
        totalInnings: totalInnings,
        highRuns: {
            1: { hr1: highRuns[1].hr1, hr2: highRuns[1].hr2 },
            2: { hr1: highRuns[2].hr1, hr2: highRuns[2].hr2 }
        },
        currentRun: currentRun,
        timeouts: { 1: config.timeouts[1], 2: config.timeouts[2] },
        equalizingTurn: equalizingTurn,
        isPenaltyMode: isPenaltyMode,
        penaltyScores: { 1: penaltyScores[1], 2: penaltyScores[2] },
        penaltyRound: penaltyRound
    });
    if (historyStack.length > MAX_HISTORY) historyStack.shift();
}
function undoLastAction(e) {
    if (!guardTouchEvent(e)) return;
    if (historyStack.length === 0 || isPaused) return;
    const prev = historyStack.pop();
    const hadScoreDecrease = isPenaltyMode && prev.isPenaltyMode
        ? (prev.penaltyScores[prev.turn] < penaltyScores[prev.turn] || (prev.turn === turn && prev.currentRun < currentRun))
        : (prev.scores[prev.turn] < scores[prev.turn] || (prev.turn === turn && prev.currentRun < currentRun));
    scores = prev.scores;
    turn = prev.turn;
    totalInnings = prev.totalInnings;
    highRuns = prev.highRuns;
    currentRun = prev.currentRun;
    config.timeouts = prev.timeouts;
    equalizingTurn = prev.equalizingTurn;
    isPenaltyMode = prev.isPenaltyMode;
    penaltyScores = prev.penaltyScores;
    penaltyRound = prev.penaltyRound;
    currentShot = config.shotTime;
    shotClockPaused = false;
    updatePauseBtn();
    updateUI();
    if (hadScoreDecrease) {
        speakText(`Eksi bir, ... ${numberToTurkish(currentRun)}`, { pitch: 1.08, rate: 0.76 });
    }
}
function startPenaltyMode() {
    commitRun(turn, currentRun);
    isPenaltyMode = true;
    equalizingTurn = false;
    penaltyScores = { 1: 0, 2: 0 };
    penaltyRound = 1;
    turn = 1;
    currentRun = 0;
    currentShot = config.shotTime;
    shotClockPaused = false;
    updatePauseBtn();
    speakText('Maç berabere, ... Penaltı atışları başlıyor', { pitch: 1.16, rate: 0.78 });
    updateUI();
}
function handleInteraction(p, type, e) {
    if (!guardTouchEvent(e)) return;
    if (isPaused) return;
    if (type === 'add') {
        if (turn !== p) changeTurn();
        else {
            if (Date.now() < turnLockUntil) return;
            saveSnapshot();
            if (isPenaltyMode) {
                penaltyScores[p]++; currentRun++;
                currentShot = config.shotTime;
                if (config.shotActive) { shotClockPaused = false; updatePauseBtn(); }
                if (turn === 2 && penaltyScores[2] > penaltyScores[1]) {
                    updateUI();
                    speakText('Oyun bitti, ... Sarı kazandı', { pitch: 1.18, rate: 0.78 });
                    endMatch(`TEBRİKLER ${config.name2} KAZANDI! (PENALTI)`);
                    return;
                }
                speakText(numberToTurkish(currentRun), { pitch: getRunPitch(currentRun), rate: 0.78 });
            } else {
                scores[p]++; currentRun++;
                currentShot = config.shotTime;
                if (config.shotActive) { shotClockPaused = false; updatePauseBtn(); }
                const endedOrSwitched = checkMatchEnd();
                if (!endedOrSwitched) {
                    speakText(numberToTurkish(currentRun), { pitch: getRunPitch(currentRun), rate: 0.78 });
                }
            }
        }
    } else if (type === 'sub' && turn === p && currentRun > 0) {
        if (Date.now() < turnLockUntil) return;
        saveSnapshot();
        if (isPenaltyMode) penaltyScores[p]--;
        else scores[p]--;
        currentRun--;
        speakText(`Eksi bir, ... ${numberToTurkish(currentRun)}`, { pitch: 1.08, rate: 0.76 });
    }
    updateUI();
}
function checkMatchEnd() {
    if (scores[turn] >= config.targets[turn]) {
        if (turn === 1) {
            equalizingTurn = true;
            changeTurn(true, true);
            return true;
        } else {
            if (equalizingTurn) {
                startPenaltyMode();
            } else {
                endMatch(`TEBRİKLER ${config.name2} KAZANDI!`);
            }
            return true;
        }
    }
    return false;
}
function endMatch(msg) {
    if (!isPenaltyMode) commitRun(turn, currentRun);
    currentRun = 0;
    isPaused = true; clearInterval(timerInt);
    document.getElementById('winner-text').innerText = msg;
    const tbody = document.getElementById('end-stats-body');
    const p1HR = getPlayerHighRuns(1);
    const p2HR = getPlayerHighRuns(2);
    tbody.innerHTML = `
        <tr><td>${config.name1}</td><td>${scores[1]}</td><td>${p1HR.hr1}</td><td>${p1HR.hr2}</td><td>${(scores[1]/totalInnings).toFixed(3)}</td></tr>
        <tr><td>${config.name2}</td><td>${scores[2]}</td><td>${p2HR.hr1}</td><td>${p2HR.hr2}</td><td>${(scores[2]/(turn===1?Math.max(1,totalInnings-1):totalInnings)).toFixed(3)}</td></tr>
    `;
    document.getElementById('end-match-overlay').style.display = 'flex';
}
function changeTurn(skipSnapshot = false, isEqualizingStart = false, e = null) {
    if (e && !guardTouchEvent(e)) return;
    if (!skipSnapshot) saveSnapshot();
    if (isPenaltyMode) {
        if (turn === 1) {
            speakText(`Beyaz, ... ${numberToTurkish(currentRun)}`, { pitch: 1.10, rate: 0.76 });
            turn = 2;
            turnLockUntil = Date.now() + 500;
            currentRun = 0; currentShot = config.shotTime;
            shotClockPaused = false;
            updatePauseBtn();
            updateUI();
            return;
        } else {
            if (penaltyScores[2] > penaltyScores[1]) {
                speakText('Oyun bitti, ... Sarı kazandı', { pitch: 1.18, rate: 0.78 });
                endMatch(`TEBRİKLER ${config.name2} KAZANDI! (PENALTI)`);
            } else if (penaltyScores[2] < penaltyScores[1]) {
                speakText('Oyun bitti, ... Beyaz kazandı', { pitch: 1.18, rate: 0.78 });
                endMatch(`TEBRİKLER ${config.name1} KAZANDI! (PENALTI)`);
            } else {
                penaltyRound++;
                penaltyScores = { 1: 0, 2: 0 };
                turn = 1;
                turnLockUntil = Date.now() + 500;
                currentRun = 0; currentShot = config.shotTime;
                shotClockPaused = false;
                updatePauseBtn();
                speakText(penaltyRound === 2 ? 'Penaltıda eşitlik, ... İkinci penaltı başlıyor' : 'Penaltıda eşitlik, ... Yeni penaltı turu başlıyor', { pitch: 1.14, rate: 0.78 });
                updateUI();
            }
            return;
        }
    }
    if (isEqualizingStart) {
        speakText('Sarı, ... masa açma hakkı', { pitch: 1.15, rate: 0.78 });
    } else {
        const outgoingColor = turn === 1 ? 'Beyaz' : 'Sarı';
        speakText(`${outgoingColor}, ... ${numberToTurkish(currentRun)}`, { pitch: 1.10, rate: 0.76 });
    }
    if (turn === 2) {
        if (equalizingTurn) {
            endMatch(`TEBRİKLER ${config.name1} KAZANDI!`);
            return;
        }
        if (config.maxInnings !== null && totalInnings >= config.maxInnings) {
            if (scores[1] > scores[2]) endMatch(`TEBRİKLER ${config.name1} KAZANDI!`);
            else if (scores[2] > scores[1]) endMatch(`TEBRİKLER ${config.name2} KAZANDI!`);
            else startPenaltyMode();
            return;
        }
    }
    commitRun(turn, currentRun);
    turn = (turn === 1) ? 2 : 1;
    turnLockUntil = Date.now() + 500;
    if (turn === 1) totalInnings++;
    currentRun = 0; currentShot = config.shotTime;
    shotClockPaused = false;
    updatePauseBtn();
    updateUI();
}
function buildFlapDigitHTML(oldD, newD, isFlipping) {
    if (!isFlipping) {
        return `<span class="flap-digit"><span class="flap-sizer">${newD}</span><span class="flap-top"><span class="flap-num">${newD}</span></span><span class="flap-bottom"><span class="flap-num">${newD}</span></span></span>`;
    }
    return `<span class="flap-digit flipping"><span class="flap-sizer">${newD}</span><span class="flap-top"><span class="flap-num">${newD}</span></span><span class="flap-bottom"><span class="flap-num">${oldD}</span><span class="flap-shadow"></span></span><span class="flap-leaf"><span class="flap-leaf-front"><span class="flap-num">${oldD}</span></span><span class="flap-leaf-back"><span class="flap-num">${newD}</span></span></span></span>`;
}
function renderSplitFlap(elId, value) {
    const container = document.getElementById(elId);
    const prevVal = prevRenderedScores[elId];
    if (prevVal === value && container.children.length > 0) return;

    if (flapCleanupTimers[elId]) {
        clearTimeout(flapCleanupTimers[elId]);
        flapCleanupTimers[elId] = null;
    }
    if (flapSoundTimers[elId]) {
        flapSoundTimers[elId].forEach(t => clearTimeout(t));
        flapSoundTimers[elId] = [];
    }

    const newDigits = String(value).split('');
    if (prevVal === null) {
        container.innerHTML = newDigits.map(d => buildFlapDigitHTML(d, d, false)).join('');
        prevRenderedScores[elId] = value;
        return;
    }

    const oldDigits = String(prevVal).split('');
    const sameLen = oldDigits.length === newDigits.length;
    let flipCount = 0;

    container.innerHTML = '';
    void container.offsetWidth;

    container.innerHTML = newDigits.map((newD, idx) => {
        const oldD = sameLen ? oldDigits[idx] : (oldDigits[idx] !== undefined ? oldDigits[idx] : '0');
        const changed = !sameLen || oldD !== newD;
        if (changed) flipCount++;
        return buildFlapDigitHTML(oldD, newD, changed);
    }).join('');

    flapSoundTimers[elId] = [];
    for (let k = 0; k < flipCount; k++) {
        flapSoundTimers[elId].push(setTimeout(playFlapSound, 380 + k * 30));
    }

    prevRenderedScores[elId] = value;
    if (flipCount > 0) {
        flapCleanupTimers[elId] = setTimeout(() => {
            container.innerHTML = newDigits.map(d => buildFlapDigitHTML(d, d, false)).join('');
            flapCleanupTimers[elId] = null;
        }, 720);
    }
}
const SEG_MAP = {
    '0': [1,1,1,1,1,1,0],
    '1': [0,1,1,0,0,0,0],
    '2': [1,1,0,1,1,0,1],
    '3': [1,1,1,1,0,0,1],
    '4': [0,1,1,0,0,1,1],
    '5': [1,0,1,1,0,1,1],
    '6': [1,0,1,1,1,1,1],
    '7': [1,1,1,0,0,0,0],
    '8': [1,1,1,1,1,1,1],
    '9': [1,1,1,1,0,1,1]
};
const SEG_PATHS = [
    'M 20 12 L 80 12 L 72 26 L 28 26 Z',
    'M 83 15 L 91 23 L 88 83 L 76 77 Z',
    'M 88 97 L 91 157 L 83 165 L 76 103 Z',
    'M 28 154 L 72 154 L 80 168 L 20 168 Z',
    'M 12 97 L 24 103 L 17 165 L 9 157 Z',
    'M 17 15 L 24 77 L 12 83 L 9 23 Z',
    'M 18 90 L 26 82 L 74 82 L 82 90 L 74 98 L 26 98 Z'
];
function buildSegDigitHTML(digitChar, isSmall) {
    const segs = SEG_MAP[digitChar] || SEG_MAP['0'];
    const paths = SEG_PATHS.map((d, i) => `<path class="seg-vane${segs[i] ? ' on' : ''}" d="${d}"></path>`).join('');
    return `<span class="seg-digit${isSmall ? ' seg-sm' : ''}"><svg class="seg-svg" viewBox="0 0 100 180">${paths}</svg></span>`;
}
function renderSevenSegment(elId, value, isSmall) {
    const container = document.getElementById(elId);
    const digits = String(value).split('');
    const existing = container.querySelectorAll('.seg-digit');
    const prevVal = prevRenderedScores[elId];

    if (existing.length === digits.length) {
        let changedDigits = 0;
        const oldDigits = prevVal !== null && prevVal !== undefined ? String(prevVal).split('') : null;
        digits.forEach((d, idx) => {
            if (!oldDigits || oldDigits[idx] !== d) changedDigits++;
            const segs = SEG_MAP[d] || SEG_MAP['0'];
            const vanes = existing[idx].querySelectorAll('.seg-vane');
            for (let i = 0; i < 7; i++) {
                if (vanes[i]) vanes[i].classList.toggle('on', !!segs[i]);
            }
        });
        if (!isSmall && prevVal !== null && prevVal !== undefined && changedDigits > 0) {
            for (let k = 0; k < changedDigits; k++) {
                setTimeout(playFlapSound, 90 + k * 30);
            }
        }
    } else {
        container.innerHTML = digits.map(d => buildSegDigitHTML(d, isSmall)).join('');
        if (!isSmall && prevVal !== null && prevVal !== undefined) {
            for (let k = 0; k < digits.length; k++) {
                setTimeout(playFlapSound, 90 + k * 30);
            }
        }
    }
    if (!isSmall) prevRenderedScores[elId] = value;
}
function updateUI() {
    const s1Val = isPenaltyMode ? penaltyScores[1] : scores[1];
    const s2Val = isPenaltyMode ? penaltyScores[2] : scores[2];
    if (config.viewMode === 'segment') {
        renderSevenSegment('s1', s1Val, false);
        renderSevenSegment('s2', s2Val, false);
        renderSevenSegment('run-display', currentRun, true);
        renderSevenSegment('inn-display', totalInnings, true);
    } else {
        renderSplitFlap('s1', s1Val);
        renderSplitFlap('s2', s2Val);
        document.getElementById('run-display').innerText = currentRun;
        document.getElementById('inn-display').innerText = totalInnings;
    }
    const penaltyBadge = document.getElementById('penalty-badge');
    if (penaltyBadge) {
        penaltyBadge.style.display = isPenaltyMode ? 'inline-block' : 'none';
        if (isPenaltyMode) penaltyBadge.innerText = penaltyRound > 1 ? `PENALTI - TUR ${penaltyRound}` : 'PENALTI';
    }
    const p1HR = getPlayerHighRuns(1);
    const p2HR = getPlayerHighRuns(2);
    document.getElementById('hr1-1').innerText = p1HR.hr1;
    document.getElementById('hr1-2').innerText = p1HR.hr2;
    document.getElementById('hr2-1').innerText = p2HR.hr1;
    document.getElementById('hr2-2').innerText = p2HR.hr2;
    document.getElementById('avg1').innerText = (scores[1] / totalInnings).toFixed(3);
    let p2Inn = (turn === 1) ? Math.max(1, totalInnings - 1) : totalInnings;
    document.getElementById('avg2').innerText = (scores[2] / p2Inn).toFixed(3);
    document.getElementById('card-1').className = `score-card p1-card ${turn===1?'active-turn':'inactive-turn'}`;
    document.getElementById('card-2').className = `score-card p2-card ${turn===2?'active-turn':'inactive-turn'}`;
    [1,2].forEach(p => {
        const dots = document.getElementById(`to-dots-${p}`); dots.innerHTML = '';
        for(let i=0; i<config.toCount; i++) {
            let d = document.createElement('div');
            d.className = 'timeout-dot' + (i < config.timeouts[p] ? ' active' : '');
            dots.appendChild(d);
        }
    });
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = historyStack.length === 0;
    updateClockUI();
}
function updateClockUI() {
    const sd = document.getElementById('shot-clock-display');
    const circle = document.getElementById('progress-circle');
    sd.innerText = currentShot;
    let offset = CIRC - (currentShot / config.shotTime) * CIRC;
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = currentShot <= config.warnTime ? "red" : "#00ff00";
}
function togglePause(e) {
    if (!guardTouchEvent(e)) return;
    shotClockPaused = !shotClockPaused;
    updatePauseBtn();
}
function updatePauseBtn() {
    const btn = document.getElementById('shot-clock-pause-btn');
    btn.innerText = shotClockPaused ? "DEVAM" : "PAUSE";
    btn.style.background = shotClockPaused ? "rgba(255,0,0,0.3)" : "rgba(0,0,0,0.5)";
}
function useTimeout(p, e) {
    if (!guardTouchEvent(e)) return;
    if (turn === p && config.timeouts[p] > 0) {
        saveSnapshot();
        config.timeouts[p]--; currentShot += 30;
        if (config.shotActive) { shotClockPaused = true; updatePauseBtn(); }
        updateUI();
    }
}
