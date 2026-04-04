let wakeLock = null;
let countdownInterval = null;
let countdownRemaining = 0;
let alarmAudio = null;

// --- Clock ---

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours() % 12 || 12);
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
    const month = now.toLocaleDateString('en-US', { month: 'long' });
    const day = now.getDate();

    document.getElementById("clock").textContent = `${hours}:${minutes}`;
    document.getElementById("meta").textContent = `${weekday}, ${month} ${day}`;
}

// --- Countdown ---

function createAlarmAudio() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 0.25;
    const beeps = 6;
    const gap = 0.18;
    const totalLength = beeps * (duration + gap);
    const buf = ctx.createBuffer(1, ctx.sampleRate * totalLength, ctx.sampleRate);
    const data = buf.getChannelData(0);

    for (let b = 0; b < beeps; b++) {
        const startSample = Math.floor((b * (duration + gap)) * ctx.sampleRate);
        const endSample = startSample + Math.floor(duration * ctx.sampleRate);
        const freq = b % 2 === 0 ? 880 : 1100;
        for (let i = startSample; i < endSample; i++) {
            const t = (i - startSample) / ctx.sampleRate;
            const envelope = Math.min(t / 0.01, 1) * Math.min((duration - t) / 0.02, 1);
            data[i] = Math.sin(2 * Math.PI * freq * t) * 0.5 * envelope;
        }
    }

    return { ctx, buf };
}

function playAlarm() {
    const { ctx, buf } = createAlarmAudio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    alarmAudio = { context: ctx, source: src };
    src.onended = () => { ctx.close(); };
}

function stopAlarm() {
    if (alarmAudio) {
        try { alarmAudio.source.stop(); } catch (_) { }
        try { alarmAudio.context.close(); } catch (_) { }
        alarmAudio = null;
    }
}

function formatCountdown(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function updateCountdownDisplay() {
    document.getElementById("cd-display").textContent = formatCountdown(countdownRemaining);
}

function startCountdown() {
    const minutes = parseInt(document.getElementById("cd-minutes").value) || 0;
    const seconds = parseInt(document.getElementById("cd-seconds").value) || 0;
    const totalSeconds = minutes * 60 + seconds;
    if (totalSeconds <= 0) return;

    countdownRemaining = totalSeconds;

    document.getElementById("countdown-setup").classList.add("hidden");
    document.getElementById("countdown-running").classList.remove("hidden");
    document.getElementById("cd-status").textContent = "";

    updateCountdownDisplay();

    countdownInterval = setInterval(() => {
        countdownRemaining--;
        updateCountdownDisplay();
        if (countdownRemaining <= 0) {
            clearInterval(countdownInterval);
            countdownInterval = null;
            document.getElementById("cd-status").textContent = "The timer is up!";
            playAlarm();
        }
    }, 1000);
}

function stopCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = null;
    stopAlarm();
    document.getElementById("countdown-running").classList.add("hidden");
    document.getElementById("countdown-setup").classList.remove("hidden");
}

function resetCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = null;
    stopAlarm();
    document.getElementById("countdown-running").classList.add("hidden");
    document.getElementById("countdown-setup").classList.remove("hidden");
    document.getElementById("cd-minutes").value = "";
    document.getElementById("cd-seconds").value = "";
}

// --- Tabs ---

function switchTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    document.querySelectorAll(".view-layer").forEach(layer => {
        layer.classList.toggle("active-view", layer.id === tab + "-view");
    });

    if (tab === "time") {
        resetCountdown();
    } else {
        document.getElementById("cd-minutes").focus();
    }
}

// --- Wake Lock & Fullscreen ---

async function requestWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (_) { }
}

async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch (_) { }
    wakeLock = null;
}

function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else {
        document.documentElement.requestFullscreen().catch(() => {});
    }
}

function handleFullscreenHotkey(e) {
    if (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
    }
}

window.addEventListener("load", () => {
    const clockEl = document.getElementById("clock");
    const shell = document.querySelector(".clock-shell");
    updateClock();

    // Lock shell height to Time view's size
    requestAnimationFrame(() => {
        shell.style.height = shell.offsetHeight + "px";
    });

    setInterval(updateClock, 1000);
    requestWakeLock();
    document.addEventListener("keydown", handleFullscreenHotkey);
    clockEl.addEventListener("click", toggleFullscreen);
    clockEl.addEventListener("click", requestWakeLock);

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.addEventListener("keydown", (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (e.key === " " && (countdownInterval || alarmAudio)) {
            e.preventDefault();
            stopCountdown();
        } else if (e.key === "c" || e.key === "C") {
            switchTab("countdown");
        } else if (e.key === "t" || e.key === "T") {
            switchTab("time");
        }
    });

    document.querySelectorAll("#cd-minutes, #cd-seconds").forEach(input => {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                startCountdown();
            }
        });
    });
});

document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" ? requestWakeLock() : releaseWakeLock();
});

window.addEventListener("beforeunload", releaseWakeLock);
