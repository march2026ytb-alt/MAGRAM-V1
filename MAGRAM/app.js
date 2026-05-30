/* =========================================
   MAGRAM PORTAL ENGINE (app.js)
   ========================================= */

// --- 1. CLOUDINARY & METADATA SYNC MANAGERS ---
const CloudinaryConfig = {
    cloudName: 'dxoaaid7p',
    apiKey: '979617936638814',
    apiSecret: 'jDEK1Q-1q2iToHe_uEITbQS2Lco'
};

const CLOUD_SYNC_URL = 'https://kvdb.io/magram_db_7f83a21b8c/portalState';

async function sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function uploadToCloudinary(subjectId, category, file) {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `magram/${subjectId}/${category}`;
    
    // Cloudinary signature parameters (sorted alphabetically): folder and timestamp
    const signatureStr = `folder=${folder}&timestamp=${timestamp}${CloudinaryConfig.apiSecret}`;
    const signature = await sha1(signatureStr);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', CloudinaryConfig.apiKey);
    formData.append('timestamp', timestamp);
    formData.append('folder', folder);
    formData.append('signature', signature);
    
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CloudinaryConfig.cloudName}/auto/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Cloudinary upload failed');
    }
    
    const data = await response.json();
    return {
        id: data.public_id,
        subjectId: subjectId,
        category: category,
        fileName: file.name,
        fileSize: formatBytes(file.size),
        fileType: file.type,
        fileUrl: data.secure_url
    };
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

async function pushStateToCloud() {
    try {
        const payload = {
            subjects: State.subjects,
            topics: State.topics,
            files: State.files,
            announcements: State.announcements,
            portalDescription: State.portalDescription
        };
        await fetch(CLOUD_SYNC_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        console.log("Cloud sync completed.");
    } catch (e) {
        console.warn("Cloud sync failed (offline or rate limit):", e);
    }
}

async function pullStateFromCloud() {
    try {
        const response = await fetch(CLOUD_SYNC_URL);
        if (response.ok) {
            const data = await response.json();
            if (data.subjects && data.topics) {
                State.subjects = data.subjects;
                State.topics = data.topics;
                State.files = data.files || {};
                State.announcements = data.announcements || [];
                State.portalDescription = data.portalDescription || "";
                
                // Synchronize to local storage for cached backup
                localStorage.setItem('magram_subjects', JSON.stringify(State.subjects));
                localStorage.setItem('magram_topics', JSON.stringify(State.topics));
                localStorage.setItem('magram_files', JSON.stringify(State.files));
                localStorage.setItem('magram_announcements', JSON.stringify(State.announcements));
                localStorage.setItem('magram_portal_desc', State.portalDescription);
                return true;
            }
        }
    } catch (e) {
        console.warn("Could not pull state from cloud, using local cache:", e);
    }
    return false;
}

// --- 2. GLOBAL PORTAL STATE ENGINE ---
const State = {
    subjects: [],
    topics: {}, // Mapping: subjectId -> Array of topics
    files: {},  // Mapping: subjectId -> Array of files
    announcements: [],
    portalDescription: "Welcome to MAGRAM Study Portal. A central hub for syllabus topics, educational resources, past question papers, and focus schedules.",
    activeView: 'explorer',
    activeSubjectId: null,
    isAdmin: false,
    focusTimeToday: 0 // In minutes
};

// Seed Initial Data (Default configuration)
const DEFAULT_SUBJECTS = [
    { id: 'math', name: 'Mathematics', code: 'MATH-201', theme: 'purple', icon: 'calculator' },
    { id: 'phys', name: 'Physics Mechanics', code: 'PHYS-102', theme: 'blue', icon: 'atom' },
    { id: 'cs', name: 'Computer Science', code: 'COMP-303', theme: 'teal', icon: 'code' }
];

const DEFAULT_TOPICS = {
    'math': [
        {
            id: 'math-t1',
            name: 'Vector Calculus & Fields',
            desc: 'Study of vector spaces, gradient, divergence, curl, and conservative fields, integrating path line integrals across complex dynamic dimensions.',
            ytLinks: [
                { id: 'yt-m1', title: 'Gradient, Divergence & Curl Intuition', url: 'https://www.youtube.com/watch?v=rB83DpBJQsE' },
                { id: 'yt-m2', title: 'Line Integrals Course Lecture', url: 'https://www.youtube.com/watch?v=32SOnv_e8C0' }
            ]
        },
        {
            id: 'math-t2',
            name: 'Linear Algebra & Matrices',
            desc: 'Core understanding of linear transformations, determinants, eigenvalues, eigenvectors, and spectral theorems.',
            ytLinks: [
                { id: 'yt-m3', title: 'Essence of Linear Algebra - 3Blue1Brown', url: 'https://www.youtube.com/watch?v=fNk_zzaMoSs' }
            ]
        }
    ],
    'phys': [
        {
            id: 'phys-t1',
            name: 'Newtonian Classical Mechanics',
            desc: 'Reviewing inertia, rotational dynamics, angular momentum conservation, torque equations, and satellite orbital velocities.',
            ytLinks: [
                { id: 'yt-p1', title: 'Rotational Dynamics Lecture - Walter Lewin', url: 'https://www.youtube.com/watch?v=hGvNugf19Q4' }
            ]
        },
        {
            id: 'phys-t2',
            name: 'Quantum Physics Fundamentals',
            desc: 'Introduction to wave-particle duality, Planck constant, Heisenberg uncertainty theorem, and Schrödinger equation basics.',
            ytLinks: [
                { id: 'yt-p2', title: 'The Map of Quantum Physics', url: 'https://www.youtube.com/watch?v=pK9M1JtI6g0' }
            ]
        }
    ],
    'cs': [
        {
            id: 'cs-t1',
            name: 'Advanced Data Structures & Algorithms',
            desc: 'Graph pathfinding (Dijkstra, A*), balancing trees, dynamic programming paradigms, and algorithmic time complexity optimizations.',
            ytLinks: [
                { id: 'yt-c1', title: 'Introduction to Algorithms MIT', url: 'https://www.youtube.com/watch?v=HtSuA80QTgI' },
                { id: 'yt-c2', title: 'Dynamic Programming Easy-to-Hard', url: 'https://www.youtube.com/watch?v=oBt53YbR9K0' }
            ]
        },
        {
            id: 'cs-t2',
            name: 'Modern Web System Design',
            desc: 'Architecting scalable server-side systems, RESTful microservices, WebSocket bidirectional nodes, client-side browser caching, and indexing algorithms.',
            ytLinks: [
                { id: 'yt-c3', title: 'System Design Basics for Beginners', url: 'https://www.youtube.com/watch?v=i53Gi_K397I' }
            ]
        }
    ]
};

const DEFAULT_ANNOUNCEMENTS = [
    { id: 'ann-1', title: 'Welcome to MAGRAM', content: 'Explore subjects, download past question papers, compile lecture notes, and utilize our integrated Focus Space for deep studying.', date: 'May 30, 2026' },
    { id: 'ann-2', title: 'Cloud Sync Active', content: 'All course resources, syllabus topics, and reference materials are now automatically backed up and synced in real-time.', date: 'May 30, 2026' }
];

// State persistence
function loadState() {
    const cachedSubjects = localStorage.getItem('magram_subjects');
    const cachedTopics = localStorage.getItem('magram_topics');
    const cachedFiles = localStorage.getItem('magram_files');
    const cachedAnnouncements = localStorage.getItem('magram_announcements');
    const cachedPortalDesc = localStorage.getItem('magram_portal_desc');
    const cachedFocus = localStorage.getItem('magram_focus_time');
    
    if (cachedSubjects) {
        State.subjects = JSON.parse(cachedSubjects);
    } else {
        State.subjects = DEFAULT_SUBJECTS;
        localStorage.setItem('magram_subjects', JSON.stringify(DEFAULT_SUBJECTS));
    }

    if (cachedTopics) {
        State.topics = JSON.parse(cachedTopics);
    } else {
        State.topics = DEFAULT_TOPICS;
        localStorage.setItem('magram_topics', JSON.stringify(DEFAULT_TOPICS));
    }

    if (cachedFiles) {
        State.files = JSON.parse(cachedFiles);
    } else {
        State.files = {};
        localStorage.setItem('magram_files', JSON.stringify({}));
    }

    if (cachedAnnouncements) {
        State.announcements = JSON.parse(cachedAnnouncements);
    } else {
        State.announcements = DEFAULT_ANNOUNCEMENTS;
        localStorage.setItem('magram_announcements', JSON.stringify(DEFAULT_ANNOUNCEMENTS));
    }

    if (cachedPortalDesc) {
        State.portalDescription = cachedPortalDesc;
    } else {
        localStorage.setItem('magram_portal_desc', State.portalDescription);
    }

    if (cachedFocus) {
        State.focusTimeToday = parseInt(cachedFocus);
    } else {
        State.focusTimeToday = 0;
    }
}

function verifyPasscode(code) {
    return code === 'ama@123';
}

function saveSubjects() {
    localStorage.setItem('magram_subjects', JSON.stringify(State.subjects));
}

function saveTopics() {
    localStorage.setItem('magram_topics', JSON.stringify(State.topics));
}

function saveFiles() {
    localStorage.setItem('magram_files', JSON.stringify(State.files));
}

function saveAnnouncements() {
    localStorage.setItem('magram_announcements', JSON.stringify(State.announcements));
}

function savePortalDesc() {
    localStorage.setItem('magram_portal_desc', State.portalDescription);
}

function updateGlobalStats() {
    document.getElementById('globalSubjectCount').innerText = State.subjects.length;
    document.getElementById('globalFocusTime').innerText = `${State.focusTimeToday}m`;
}

// --- 3. AMBIENT AUDIO WEB SYNTHESIS MIXER ---
class AmbientMixer {
    constructor() {
        this.ctx = null;
        this.channels = {
            rain: { node: null, volume: null, active: false, creator: this.createRain.bind(this) },
            brownian: { node: null, volume: null, active: false, creator: this.createBrownNoise.bind(this) },
            forest: { node: null, volume: null, active: false, creator: this.createForest.bind(this) },
            cafe: { node: null, volume: null, active: false, creator: this.createCafe.bind(this) },
            lofi: { node: null, volume: null, active: false, creator: this.createLofi.bind(this) }
        };
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggleChannel(type, volumeValue) {
        this.init();
        const chan = this.channels[type];
        
        if (chan.active) {
            // Stop & cleanup sound node
            this.stopChannel(type);
        } else {
            // Synthesize and start sound
            const synth = chan.creator();
            chan.node = synth;
            
            // Set up volume
            chan.volume = this.ctx.createGain();
            chan.volume.gain.value = volumeValue;
            
            // Connect
            if (synth.outputNode) {
                synth.outputNode.connect(chan.volume);
            } else if (synth.source) {
                synth.source.connect(chan.volume);
            }
            chan.volume.connect(this.ctx.destination);
            
            chan.active = true;
        }
    }

    setChannelVolume(type, val) {
        if (this.channels[type].active && this.channels[type].volume) {
            this.channels[type].volume.gain.value = val;
        }
    }

    stopChannel(type) {
        const chan = this.channels[type];
        if (chan.active && chan.node) {
            try {
                if (chan.node.source) chan.node.source.stop();
                if (chan.node.oscs) {
                    chan.node.oscs.forEach(o => {
                        try { o.osc.stop(); } catch(e){}
                    });
                }
                if (chan.node.timer) clearInterval(chan.node.timer);
            } catch (err) {
                console.warn("Stopping node error: ", err);
            }
            chan.node = null;
            chan.volume = null;
            chan.active = false;
        }
    }

    stopAll() {
        Object.keys(this.channels).forEach(type => this.stopChannel(type));
    }

    // Ambient Synthesizer 1: Brown Noise
    createBrownNoise() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Brownian mathematical integration rumble
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; // Gain compensation
        }

        const brownSource = this.ctx.createBufferSource();
        brownSource.buffer = noiseBuffer;
        brownSource.loop = true;
        brownSource.start();

        return { source: brownSource, outputNode: brownSource };
    }

    // Ambient Synthesizer 2: Bandpass Rain
    createRain() {
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1100;
        filter.Q.value = 0.8;

        whiteNoise.connect(filter);
        whiteNoise.start();

        return { source: whiteNoise, outputNode: filter };
    }

    // Ambient Synthesizer 3: Forest & Sweeping Wind
    createForest() {
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.8;

        // Base wind rustle from white noise
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const windSource = this.ctx.createBufferSource();
        windSource.buffer = noiseBuffer;
        windSource.loop = true;

        const windFilter = this.ctx.createBiquadFilter();
        windFilter.type = 'bandpass';
        windFilter.frequency.value = 450;
        windFilter.Q.value = 0.7;

        // Slow sweep LFO
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.04; // super slow sweep
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 180; // Sweeps 270Hz to 630Hz

        lfo.connect(lfoGain);
        lfoGain.connect(windFilter.frequency);

        windSource.connect(windFilter);
        windFilter.connect(gainNode);

        lfo.start();
        windSource.start();

        // High frequency random bird whistles
        const birdTimer = setInterval(() => {
            if (!this.ctx || this.ctx.state === 'closed') {
                clearInterval(birdTimer);
                return;
            }
            if (this.channels.forest.active && Math.random() < 0.08) {
                const now = this.ctx.currentTime;
                const chirp = this.ctx.createOscillator();
                const chirpGain = this.ctx.createGain();
                
                chirp.type = 'sine';
                chirp.frequency.setValueAtTime(1900 + Math.random() * 500, now);
                chirp.frequency.exponentialRampToValueAtTime(2900 + Math.random() * 900, now + 0.12);
                
                chirpGain.gain.setValueAtTime(0.008, now);
                chirpGain.gain.exponentialRampToValueAtTime(0.00001, now + 0.15);
                
                chirp.connect(chirpGain);
                chirpGain.connect(gainNode);
                
                chirp.start(now);
                chirp.stop(now + 0.16);
            }
        }, 600);

        return { source: windSource, outputNode: gainNode, timer: birdTimer };
    }

    // Ambient Synthesizer 4: Cozy Fireplace Sparks (Cozy Lounge Vibe)
    createCafe() {
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.9;

        // Low frequency hum
        const rumble = this.createBrownNoise();
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 130;

        rumble.outputNode.connect(lowpass);
        lowpass.connect(gainNode);

        // Clicking keyboard & fireplace pops
        const crackleTimer = setInterval(() => {
            if (!this.ctx || this.ctx.state === 'closed') {
                clearInterval(crackleTimer);
                return;
            }
            if (this.channels.cafe.active && Math.random() < 0.18) {
                const click = this.ctx.createOscillator();
                const clickGain = this.ctx.createGain();
                
                click.type = 'triangle';
                click.frequency.value = 2500 + Math.random() * 3500;
                
                clickGain.gain.setValueAtTime(0.015 + Math.random() * 0.02, this.ctx.currentTime);
                clickGain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + 0.015);
                
                click.connect(clickGain);
                clickGain.connect(gainNode);
                
                click.start();
                click.stop(this.ctx.currentTime + 0.025);
            }
        }, 60);

        return { source: rumble.source, outputNode: gainNode, timer: crackleTimer };
    }

    // Ambient Synthesizer 5: Modulated Warm Lofi Chords
    createLofi() {
        const gainNode = this.ctx.createGain();
        gainNode.gain.value = 0.35;
        const oscs = [];

        // E Minor 7 chord structure (smooth pads)
        const notes = [164.81, 196.00, 246.94, 293.66]; // E3, G3, B3, D4
        notes.forEach(frequency => {
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = frequency;

            const oscGain = this.ctx.createGain();
            oscGain.gain.value = 0.06;

            // Warm organic volume LFO
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = 0.12 + Math.random() * 0.08;
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = 0.04;

            lfo.connect(lfoGain);
            lfoGain.connect(oscGain.gain);

            osc.connect(oscGain);
            oscGain.connect(gainNode);

            lfo.start();
            osc.start();

            oscs.push({ osc, lfo });
        });

        return { source: null, outputNode: gainNode, oscs: oscs };
    }
}

const AudioMixer = new AmbientMixer();

// --- 4. FOCUS POMODORO TIMER ENGINE ---
class FocusTimer {
    constructor() {
        this.timeRemaining = 1500; // 25 minutes
        this.totalDuration = 1500;
        this.timerId = null;
        this.isRunning = false;
        this.mode = 'work'; // 'work', 'short', 'long'
        
        // Progress circle parameters (r=120, circumference = 2 * PI * 120 = 753.98)
        this.circumference = 2 * Math.PI * 120;
    }

    init() {
        this.timeRemaining = 1500;
        this.totalDuration = 1500;
        this.updateDisplay();
        this.bindEvents();
    }

    bindEvents() {
        const playBtn = document.getElementById('timerPlayBtn');
        const resetBtn = document.getElementById('timerResetBtn');
        const presets = document.querySelectorAll('.preset-btn');

        playBtn.addEventListener('click', () => this.toggle());
        resetBtn.addEventListener('click', () => this.reset());

        presets.forEach(btn => {
            btn.addEventListener('click', (e) => {
                presets.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                
                this.mode = btn.dataset.mode;
                const duration = parseInt(btn.dataset.duration);
                this.setDuration(duration);
            });
        });
    }

    setDuration(seconds) {
        this.stop();
        this.totalDuration = seconds;
        this.timeRemaining = seconds;
        this.updateDisplay();
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    }

    start() {
        if (this.isRunning) return;
        
        // Audio init safety
        AudioMixer.init();
        
        this.isRunning = true;
        document.getElementById('playIcon').setAttribute('data-lucide', 'pause');
        document.getElementById('timerLabel').innerText = this.mode === 'work' ? 'FOCUSING' : 'ON BREAK';
        document.getElementById('timerLabel').style.color = this.mode === 'work' ? 'var(--color-primary)' : 'var(--color-secondary)';
        lucide.createIcons();

        this.timerId = setInterval(() => {
            this.timeRemaining--;
            this.updateDisplay();

            if (this.timeRemaining <= 0) {
                this.completeCycle();
            }
        }, 1000);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.timerId);
        document.getElementById('playIcon').setAttribute('data-lucide', 'play');
        document.getElementById('timerLabel').innerText = 'PAUSED';
        document.getElementById('timerLabel').style.color = 'var(--text-muted)';
        lucide.createIcons();
    }

    reset() {
        this.stop();
        this.timeRemaining = this.totalDuration;
        this.updateDisplay();
        document.getElementById('timerLabel').innerText = 'READY';
        document.getElementById('timerLabel').style.color = 'var(--text-muted)';
    }

    completeCycle() {
        this.stop();
        
        // Trigger notification sound
        this.triggerSystemBeep();

        if (this.mode === 'work') {
            const minutesFocus = Math.round(this.totalDuration / 60);
            State.focusTimeToday += minutesFocus;
            localStorage.setItem('magram_focus_time', State.focusTimeToday);
            updateGlobalStats();
            alert("Amazing focus session completed! Time for a well-deserved break.");
        } else {
            alert("Break finished! Let's get back to work.");
        }

        this.reset();
    }

    triggerSystemBeep() {
        try {
            const context = AudioMixer.ctx || new (window.AudioContext || window.webkitAudioContext)();
            const osc = context.createOscillator();
            const gain = context.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, context.currentTime);
            osc.frequency.exponentialRampToValueAtTime(900, context.currentTime + 0.3);
            
            gain.gain.setValueAtTime(0.2, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.35);
            
            osc.connect(gain);
            gain.connect(context.destination);
            
            osc.start();
            osc.stop(context.currentTime + 0.4);
        } catch(e) {
            console.error("System sound error: ", e);
        }
    }

    updateDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        
        const padMin = String(minutes).padStart(2, '0');
        const padSec = String(seconds).padStart(2, '0');
        
        document.getElementById('timeDisplay').innerText = `${padMin}:${padSec}`;
        
        // Circular stroke offset calculations
        const circle = document.getElementById('timerProgressCircle');
        const fraction = this.timeRemaining / this.totalDuration;
        const offset = this.circumference * (1 - fraction);
        
        circle.style.strokeDashoffset = offset;
    }
}

const TimerEngine = new FocusTimer();

// --- 5. INTERACTIVE RENDER & ROUTING SYSTEM ---
const Router = {
    init() {
        const navButtons = document.querySelectorAll('.nav-item');
        
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                navButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const targetView = btn.dataset.view;
                this.navigate(targetView);
            });
        });

        // Search subject handler
        document.getElementById('subjectSearch').addEventListener('input', (e) => {
            this.renderSubjectGrid(e.target.value);
        });

        // Filter topic handler
        document.getElementById('topicSearch').addEventListener('input', (e) => {
            this.renderSubjectSyllabus(State.activeSubjectId, e.target.value);
        });

        // Breadcrumb back click
        document.getElementById('backToExplorer').addEventListener('click', () => {
            this.navigate('explorer');
        });

        // Edit active subject button click
        document.getElementById('editActiveSubjectBtn').addEventListener('click', () => {
            if (State.activeSubjectId) {
                CreatorSuite.openSubjectModal(State.activeSubjectId);
            }
        });
    },

    navigate(view) {
        State.activeView = view;
        document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
        
        if (view === 'explorer') {
            document.getElementById('view-explorer').classList.add('active');
            document.getElementById('mainTitle').innerText = "Subject Explorer";
            this.renderSubjectGrid();
            this.renderAnnouncements();
            this.renderPortalDescription();
        } else if (view === 'focus') {
            document.getElementById('view-focus').classList.add('active');
            document.getElementById('mainTitle').innerText = "Focus Space";
        } else if (view === 'detail') {
            document.getElementById('view-subject-detail').classList.add('active');
            // Subject title set during transition
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // View 1 Renderer: Grid of Subjects
    async renderSubjectGrid(filterText = '') {
        const grid = document.getElementById('subjectsGrid');
        grid.innerHTML = '';

        const normalizedFilter = filterText.toLowerCase().trim();
        const filteredSubjects = State.subjects.filter(subj => 
            subj.name.toLowerCase().includes(normalizedFilter) || 
            subj.code.toLowerCase().includes(normalizedFilter)
        );

        for (const subj of filteredSubjects) {
            // Fetch file counters directly from state
            const allFiles = State.files[subj.id] || [];
            const papersCount = allFiles.filter(f => f.category === 'papers').length;
            const notesCount = allFiles.filter(f => f.category === 'notes').length;

            const card = document.createElement('div');
            card.className = `card subject-card subject-theme-${subj.theme}`;
            card.style.setProperty('--subject-color', `var(--subject-theme-${subj.theme})`);
            
            card.innerHTML = `
                <div class="subject-card-header">
                    <div class="subject-icon-box">
                        <i data-lucide="${subj.icon}"></i>
                    </div>
                    ${State.isAdmin ? `
                        <div class="subject-card-actions">
                            <button class="subject-edit-btn" data-id="${subj.id}" title="Edit Subject">
                                <i data-lucide="pencil"></i>
                            </button>
                            <button class="subject-delete-btn" data-id="${subj.id}" title="Delete Subject">
                                <i data-lucide="trash-2"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="subject-card-body">
                    <h4>${subj.name}</h4>
                    <span class="subject-code">${subj.code}</span>
                </div>
                <div class="subject-card-footer">
                    <div class="subject-stat">
                        <i data-lucide="file-text"></i>
                        <span>${papersCount} Papers</span>
                    </div>
                    <div class="subject-stat">
                        <i data-lucide="book-marked"></i>
                        <span>${notesCount} Notes</span>
                    </div>
                </div>
            `;

            // Card navigation click handler
            card.addEventListener('click', (e) => {
                // Ignore click if delete or edit button is clicked
                if (e.target.closest('.subject-delete-btn') || e.target.closest('.subject-edit-btn')) return;
                this.openSubjectDetail(subj);
            });

            // Action listeners
            if (State.isAdmin) {
                const editBtn = card.querySelector('.subject-edit-btn');
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    CreatorSuite.openSubjectModal(subj.id);
                });

                const delBtn = card.querySelector('.subject-delete-btn');
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete ${subj.name}? This removes all syllabus topics, papers, and notes associated with it.`)) {
                        this.deleteSubject(subj.id);
                    }
                });
            }

            grid.appendChild(card);
        }

        // Add special "Create New" card if editor is unlocked
        if (State.isAdmin) {
            const addCard = document.createElement('div');
            addCard.className = 'card subject-card add-subject-card';
            addCard.innerHTML = `
                <i data-lucide="plus"></i>
                <span>Create Subject</span>
            `;
            addCard.addEventListener('click', () => {
                document.getElementById('addSubjectModal').classList.add('active');
            });
            grid.appendChild(addCard);
        }

        lucide.createIcons();
    },

    deleteSubject(id) {
        State.subjects = State.subjects.filter(s => s.id !== id);
        delete State.topics[id];
        delete State.files[id];
        saveSubjects();
        saveTopics();
        saveFiles();
        pushStateToCloud();
        this.renderSubjectGrid();
        updateGlobalStats();
    },

    // Navigation into dynamic Subject Page
    openSubjectDetail(subject) {
        State.activeSubjectId = subject.id;
        this.navigate('detail');
        
        document.getElementById('mainTitle').innerText = subject.name;
        document.getElementById('subjectDetailName').innerText = subject.name;
        document.getElementById('subjectDetailCode').innerText = subject.code;

        // Apply customized colors to the subject page dynamically
        const detailPanel = document.getElementById('view-subject-detail');
        // Clean old theme classes
        detailPanel.className = 'view-panel active';
        detailPanel.classList.add(`subject-theme-${subject.theme}`);

        this.renderSubjectSyllabus(subject.id);
        this.loadVaultResources(subject.id);
    },

    // Render Syllabus & Topics accordion
    renderSubjectSyllabus(subjectId, filterText = '') {
        const container = document.getElementById('topicsAccordion');
        container.innerHTML = '';

        const topicsList = State.topics[subjectId] || [];
        const normalizedFilter = filterText.toLowerCase().trim();

        const filtered = topicsList.filter(top => 
            top.name.toLowerCase().includes(normalizedFilter) || 
            (top.desc && top.desc.toLowerCase().includes(normalizedFilter))
        );

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="no-files-placeholder">
                    No syllabus topics defined. Add topics in Editor Mode!
                </div>
            `;
            return;
        }

        filtered.forEach(topic => {
            const topicItem = document.createElement('div');
            topicItem.className = 'topic-item';
            topicItem.id = `topic-${topic.id}`;
            
            let ytLinksHTML = '';
            if (topic.ytLinks && topic.ytLinks.length > 0) {
                topic.ytLinks.forEach(link => {
                    ytLinksHTML += `
                        <div class="yt-link-card">
                            <a href="${link.url}" target="_blank" class="yt-info">
                                <i data-lucide="youtube"></i>
                                <span class="yt-title">${link.title}</span>
                            </a>
                            ${State.isAdmin ? `
                                <button class="yt-delete-btn" data-topic-id="${topic.id}" data-link-id="${link.id}" title="Remove YouTube link">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            ` : ''}
                        </div>
                    `;
                });
            } else {
                ytLinksHTML = `<span class="file-size-limit">No educational YouTube references attached.</span>`;
            }

            topicItem.innerHTML = `
                <div class="topic-header">
                    <div class="topic-header-title-box">
                        <i data-lucide="chevron-down" class="topic-chevron"></i>
                        <h4>${topic.name}</h4>
                    </div>
                </div>
                <div class="topic-body">
                    <p class="topic-desc">${topic.desc || 'No summary overview provided.'}</p>
                    
                    <div class="yt-section-header">
                        <h5>YouTube Lectures & Resources</h5>
                        ${State.isAdmin ? `
                            <button class="btn btn-sm btn-accent add-yt-link-trigger" data-topic-id="${topic.id}">
                                <i data-lucide="plus"></i>
                                <span>Attach Lecture</span>
                            </button>
                        ` : ''}
                    </div>
                    <div class="yt-links-grid">
                        ${ytLinksHTML}
                    </div>

                    ${State.isAdmin ? `
                        <div class="topic-actions">
                            <button class="btn btn-sm btn-sec btn-delete-topic" data-topic-id="${topic.id}">
                                <i data-lucide="trash-2"></i>
                                <span>Delete Topic</span>
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;

            // Expandable Accordion click handler
            const header = topicItem.querySelector('.topic-header');
            header.addEventListener('click', () => {
                const currentlyExpanded = container.querySelector('.topic-item.expanded');
                if (currentlyExpanded && currentlyExpanded !== topicItem) {
                    currentlyExpanded.classList.remove('expanded');
                }
                topicItem.classList.toggle('expanded');
            });

            // Action Triggers
            if (State.isAdmin) {
                // Delete YouTube link listener
                topicItem.querySelectorAll('.yt-delete-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const tId = btn.dataset.topicId;
                        const lId = btn.dataset.linkId;
                        this.deleteYoutubeLink(subjectId, tId, lId);
                    });
                });

                // Attach YouTube trigger listener
                topicItem.querySelector('.add-yt-link-trigger').addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.currentTopicIdForYt = topic.id;
                    document.getElementById('ytTitleField').value = '';
                    document.getElementById('ytUrlField').value = '';
                    document.getElementById('ytUrlError').style.display = 'none';
                    document.getElementById('addYoutubeModal').classList.add('active');
                });

                // Delete topic listener
                topicItem.querySelector('.btn-delete-topic').addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Remove topic "${topic.name}" from syllabus?`)) {
                        this.deleteTopic(subjectId, topic.id);
                    }
                });
            }

            container.appendChild(topicItem);
        });

        lucide.createIcons();
    },

    deleteTopic(subjId, topicId) {
        State.topics[subjId] = State.topics[subjId].filter(t => t.id !== topicId);
        saveTopics();
        pushStateToCloud();
        this.renderSubjectSyllabus(subjId);
    },

    deleteYoutubeLink(subjId, topicId, linkId) {
        const topics = State.topics[subjId] || [];
        const topic = topics.find(t => t.id === topicId);
        if (topic) {
            topic.ytLinks = topic.ytLinks.filter(l => l.id !== linkId);
            saveTopics();
            pushStateToCloud();
            this.renderSubjectSyllabus(subjId);
        }
    },

    // Load & Render Resource list from IndexedDB
    async loadVaultResources(subjectId) {
        this.renderResourceList(subjectId, 'papers', 'papersFileList');
        this.renderResourceList(subjectId, 'notes', 'notesFileList');
    },

    async renderResourceList(subjectId, category, elementId) {
        const container = document.getElementById(elementId);
        container.innerHTML = '';

        const allFiles = State.files[subjectId] || [];
        const files = allFiles.filter(f => f.category === category);

        if (files.length === 0) {
            container.innerHTML = `
                <div class="no-files-placeholder">
                    No uploaded ${category === 'papers' ? 'question papers' : 'study notes'} available.
                </div>
            `;
            return;
        }

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            const icon = category === 'papers' ? 'file-text' : 'book-marked';
            const accentClass = category === 'papers' ? 'text-primary' : 'text-secondary';

            item.innerHTML = `
                <div class="file-item-info">
                    <div class="file-icon-box">
                        <i data-lucide="${icon}" class="${accentClass}"></i>
                    </div>
                    <div class="file-details">
                        <span class="file-name" title="${file.fileName}">${file.fileName}</span>
                        <span class="file-size">${file.fileSize}</span>
                    </div>
                </div>
                <div class="file-item-actions">
                    <a href="${file.fileUrl}" target="_blank" class="btn-file-action btn-download-file" title="Download file" style="display:flex;align-items:center;justify-content:center;text-decoration:none;">
                        <i data-lucide="download"></i>
                    </a>
                    ${State.isAdmin ? `
                        <button class="btn-file-action delete btn-delete-file" data-id="${file.id}" title="Delete file">
                            <i data-lucide="trash-2"></i>
                        </button>
                    ` : ''}
                </div>
            `;

            // Delete file binding
            if (State.isAdmin) {
                item.querySelector('.btn-delete-file').addEventListener('click', async () => {
                    if (confirm(`Are you sure you want to delete ${file.fileName}?`)) {
                        State.files[subjectId] = State.files[subjectId].filter(f => f.id !== file.id);
                        saveFiles();
                        await pushStateToCloud();
                        this.renderResourceList(subjectId, category, elementId);
                    }
                });
            }

            container.appendChild(item);
        });

        lucide.createIcons();
    },

    renderAnnouncements() {
        const list = document.getElementById('announcementsList');
        list.innerHTML = '';

        if (State.announcements.length === 0) {
            list.innerHTML = `<span class="file-size-limit">No announcements posted on the board.</span>`;
            return;
        }

        const sorted = [...State.announcements].reverse();

        sorted.forEach(ann => {
            const item = document.createElement('div');
            item.className = 'announcement-item';
            item.innerHTML = `
                <div class="announcement-item-header">
                    <h4>${ann.title}</h4>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="announcement-date">${ann.date}</span>
                        ${State.isAdmin ? `
                            <button class="announcement-delete-btn" data-id="${ann.id}" title="Delete announcement">
                                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
                <p class="announcement-content">${ann.content}</p>
            `;

            if (State.isAdmin) {
                item.querySelector('.announcement-delete-btn').addEventListener('click', async () => {
                    if (confirm(`Are you sure you want to delete this announcement?`)) {
                        State.announcements = State.announcements.filter(a => a.id !== ann.id);
                        saveAnnouncements();
                        await pushStateToCloud();
                        this.renderAnnouncements();
                    }
                });
            }

            list.appendChild(item);
        });

        lucide.createIcons();
    },

    renderPortalDescription() {
        const textEl = document.getElementById('portalDescText');
        textEl.innerText = State.portalDescription || "Welcome to MAGRAM Study Portal. A central hub for syllabus topics, educational resources, past question papers, and focus schedules.";
    }
};

// --- 6. AUTHORIZATION MANAGER (Viewer vs Editor privileges) ---
const AuthManager = {
    init() {
        const authBtn = document.getElementById('authBtn');
        const authModal = document.getElementById('authModal');
        const cancelBtn = document.getElementById('cancelAuthBtn');
        const submitBtn = document.getElementById('submitAuthBtn');
        const passcodeField = document.getElementById('passcodeField');
        const toggleVisibilityBtn = document.getElementById('togglePasscodeVisibilityBtn');
        const eyeIcon = document.getElementById('passcodeEyeIcon');

        authBtn.addEventListener('click', () => {
            if (State.isAdmin) {
                // Lock permissions (logout)
                this.lockAdmin();
            } else {
                // Show modal overlay passcode prompt
                passcodeField.value = '';
                document.getElementById('authError').style.display = 'none';
                authModal.classList.add('active');
                passcodeField.focus();
            }
        });

        cancelBtn.addEventListener('click', () => {
            authModal.classList.remove('active');
        });

        submitBtn.addEventListener('click', () => this.verifyPasscode());
        
        passcodeField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.verifyPasscode();
            }
        });

        // Hide toggle passcode visibility
        toggleVisibilityBtn.addEventListener('click', () => {
            if (passcodeField.type === 'password') {
                passcodeField.type = 'text';
                eyeIcon.setAttribute('data-lucide', 'eye-off');
            } else {
                passcodeField.type = 'password';
                eyeIcon.setAttribute('data-lucide', 'eye');
            }
            lucide.createIcons();
        });
    },

    verifyPasscode() {
        const passcode = document.getElementById('passcodeField').value;
        const modal = document.querySelector('.modal-card');
        const error = document.getElementById('authError');

        if (passcode === 'ama@123') {
            this.unlockAdmin();
            document.getElementById('authModal').classList.remove('active');
        } else {
            // Incorrect passcode animations
            error.style.display = 'block';
            modal.classList.add('shake');
            setTimeout(() => modal.classList.remove('shake'), 400);
        }
    },

    unlockAdmin() {
        State.isAdmin = true;
        
        // Update widgets
        document.getElementById('statusDot').className = 'status-dot authorized pulsing';
        document.getElementById('statusText').innerText = "Editor Mode";
        document.getElementById('statusText').style.color = "var(--color-green)";
        document.getElementById('authBtnText').innerText = "Lock Editor";
        document.getElementById('authBtn').classList.add('unlocked-state');
        document.getElementById('authBtnIcon').setAttribute('data-lucide', 'unlock');

        // Reveal admin DOM nodes
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));

        // Refresh views to include admin additions
        if (State.activeView === 'explorer') {
            Router.renderSubjectGrid();
        } else if (State.activeView === 'detail') {
            Router.renderSubjectSyllabus(State.activeSubjectId);
            Router.loadVaultResources(State.activeSubjectId);
        }
        
        lucide.createIcons();
    },

    lockAdmin() {
        State.isAdmin = false;

        // Reset widgets
        document.getElementById('statusDot').className = 'status-dot pulsing';
        document.getElementById('statusText').innerText = "Viewer Mode";
        document.getElementById('statusText').style.color = "var(--text-secondary)";
        document.getElementById('authBtnText').innerText = "Unlock Editor";
        document.getElementById('authBtn').classList.remove('unlocked-state');
        document.getElementById('authBtnIcon').setAttribute('data-lucide', 'lock');

        // Hide admin DOM nodes
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));

        // Refresh views to strip edit additions
        if (State.activeView === 'explorer') {
            Router.renderSubjectGrid();
        } else if (State.activeView === 'detail') {
            Router.renderSubjectSyllabus(State.activeSubjectId);
            Router.loadVaultResources(State.activeSubjectId);
        }

        lucide.createIcons();
    }
};

// --- 7. SUBJECT CREATION & ASSETS DROP-ZONE HANDLERS ---
const CreatorSuite = {
    init() {
        // Modal cancel hooks
        document.getElementById('cancelAddSubjectBtn').addEventListener('click', () => {
            document.getElementById('addSubjectModal').classList.remove('active');
        });
        document.getElementById('cancelAddTopicBtn').addEventListener('click', () => {
            document.getElementById('addTopicModal').classList.remove('active');
        });
        document.getElementById('cancelAddYtBtn').addEventListener('click', () => {
            document.getElementById('addYoutubeModal').classList.remove('active');
        });

        // Subject Swatch selection
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                swatches.forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });
        });

        // Form Submit bindings
        document.getElementById('createNewSubjectBtn').addEventListener('click', () => {
            this.openSubjectModal();
        });

        document.getElementById('addTopicBtn').addEventListener('click', () => {
            document.getElementById('topicNameField').value = '';
            document.getElementById('topicDescField').value = '';
            document.getElementById('addTopicModal').classList.add('active');
        });

        document.getElementById('submitAddSubjectBtn').addEventListener('click', () => this.saveSubject());
        document.getElementById('submitAddTopicBtn').addEventListener('click', () => this.createNewTopic());
        document.getElementById('submitAddYtBtn').addEventListener('click', () => this.attachYoutubeLink());

        // Announcements modal hooks
        document.getElementById('cancelAddAnnBtn').addEventListener('click', () => {
            document.getElementById('addAnnouncementModal').classList.remove('active');
        });
        document.getElementById('addAnnouncementBtn').addEventListener('click', () => {
            document.getElementById('annTitleField').value = '';
            document.getElementById('annContentField').value = '';
            document.getElementById('addAnnouncementModal').classList.add('active');
        });
        document.getElementById('submitAddAnnBtn').addEventListener('click', () => this.createNewAnnouncement());

        // Portal description modal hooks
        document.getElementById('cancelEditDescBtn').addEventListener('click', () => {
            document.getElementById('editPortalDescModal').classList.remove('active');
        });
        document.getElementById('editPortalDescBtn').addEventListener('click', () => {
            document.getElementById('portalDescField').value = State.portalDescription;
            document.getElementById('editPortalDescModal').classList.add('active');
        });
        document.getElementById('submitPortalDescBtn').addEventListener('click', () => this.savePortalDescription());

        // File vault upload drops initialization
        this.initFileUploader('uploaderPapers', 'fileInputPapers', 'papers');
        this.initFileUploader('uploaderNotes', 'fileInputNotes', 'notes');
    },

    openSubjectModal(subjectId = null) {
        const modal = document.getElementById('addSubjectModal');
        const nameField = document.getElementById('subjectNameField');
        const codeField = document.getElementById('subjectCodeField');
        const iconField = document.getElementById('subjectIconField');
        const submitBtn = document.getElementById('submitAddSubjectBtn');
        const titleEl = modal.querySelector('.modal-header h3');

        // Clear active colors
        const swatches = document.querySelectorAll('.color-swatch');
        swatches.forEach(s => s.classList.remove('active'));

        if (subjectId) {
            // Edit mode
            window.editingSubjectId = subjectId;
            const subject = State.subjects.find(s => s.id === subjectId);
            
            nameField.value = subject.name;
            codeField.value = subject.code;
            iconField.value = subject.icon;
            titleEl.innerText = "Modify Study Subject";
            submitBtn.innerText = "Save Changes";

            const swatch = modal.querySelector(`.color-swatch[data-color="${subject.theme}"]`);
            if (swatch) swatch.classList.add('active');
        } else {
            // Add mode
            window.editingSubjectId = null;
            nameField.value = '';
            codeField.value = '';
            iconField.value = 'book-open';
            titleEl.innerText = "Create Study Subject";
            submitBtn.innerText = "Create Subject";

            // Default blue swatch active
            const swatch = modal.querySelector(`.color-swatch[data-color="blue"]`);
            if (swatch) swatch.classList.add('active');
        }

        modal.classList.add('active');
    },

    saveSubject() {
        const name = document.getElementById('subjectNameField').value.trim();
        const code = document.getElementById('subjectCodeField').value.trim();
        const activeSwatch = document.querySelector('.color-swatch.active');
        const theme = activeSwatch ? activeSwatch.dataset.color : 'blue';
        const icon = document.getElementById('subjectIconField').value;

        if (!name || !code) {
            alert("Subject Title and Course Code are required!");
            return;
        }

        if (window.editingSubjectId) {
            // Editing existing subject
            const subject = State.subjects.find(s => s.id === window.editingSubjectId);
            if (subject) {
                subject.name = name;
                subject.code = code;
                subject.theme = theme;
                subject.icon = icon;
                saveSubjects();
                pushStateToCloud();
            }
        } else {
            // Creating new subject
            const id = 'subj-' + Date.now();
            const newSubject = { id, name, code, theme, icon };
            State.subjects.push(newSubject);
            State.topics[id] = [];
            State.files[id] = [];
            saveSubjects();
            saveTopics();
            saveFiles();
            pushStateToCloud();
            updateGlobalStats();
        }
        
        document.getElementById('addSubjectModal').classList.remove('active');
        
        // If we are currently viewing this subject's detail, refresh headers
        if (State.activeView === 'detail' && State.activeSubjectId === window.editingSubjectId) {
            const subject = State.subjects.find(s => s.id === State.activeSubjectId);
            if (subject) {
                Router.openSubjectDetail(subject);
            }
        } else {
            Router.renderSubjectGrid();
        }
        
        window.editingSubjectId = null;
    },

    createNewAnnouncement() {
        const title = document.getElementById('annTitleField').value.trim();
        const content = document.getElementById('annContentField').value.trim();

        if (!title || !content) {
            alert("Announcement Title and Message are required!");
            return;
        }

        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        const formattedDate = new Date().toLocaleDateString('en-US', options);

        const newAnn = {
            id: 'ann-' + Date.now(),
            title,
            content,
            date: formattedDate
        };

        State.announcements.push(newAnn);
        saveAnnouncements();
        pushStateToCloud();

        document.getElementById('addAnnouncementModal').classList.remove('active');
        Router.renderAnnouncements();
    },

    savePortalDescription() {
        const desc = document.getElementById('portalDescField').value.trim();

        State.portalDescription = desc || "Welcome to MAGRAM Study Portal. A central hub for syllabus topics, educational resources, past question papers, and focus schedules.";
        savePortalDesc();
        pushStateToCloud();

        document.getElementById('editPortalDescModal').classList.remove('active');
        Router.renderPortalDescription();
    },

    createNewTopic() {
        const name = document.getElementById('topicNameField').value.trim();
        const desc = document.getElementById('topicDescField').value.trim();
        const activeSubjId = State.activeSubjectId;

        if (!name) {
            alert("Topic title is required!");
            return;
        }

        const newTopic = {
            id: 'top-' + Date.now(),
            name,
            desc,
            ytLinks: []
        };

        if (!State.topics[activeSubjId]) {
            State.topics[activeSubjId] = [];
        }

        State.topics[activeSubjId].push(newTopic);
        saveTopics();
        pushStateToCloud();

        document.getElementById('addTopicModal').classList.remove('active');
        Router.renderSubjectSyllabus(activeSubjId);
    },

    attachYoutubeLink() {
        const title = document.getElementById('ytTitleField').value.trim();
        const url = document.getElementById('ytUrlField').value.trim();
        const activeSubjId = State.activeSubjectId;
        const activeTopicId = window.currentTopicIdForYt;

        if (!title || !url) {
            alert("YouTube label and lecture link are required!");
            return;
        }

        // Basic Youtube URL validation
        const ytRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
        if (!ytRegex.test(url)) {
            document.getElementById('ytUrlError').style.display = 'block';
            return;
        }

        const topics = State.topics[activeSubjId] || [];
        const topic = topics.find(t => t.id === activeTopicId);

        if (topic) {
            if (!topic.ytLinks) topic.ytLinks = [];
            
            topic.ytLinks.push({
                id: 'yt-' + Date.now(),
                title,
                url
            });

            saveTopics();
            pushStateToCloud();
            document.getElementById('addYoutubeModal').classList.remove('active');
            Router.renderSubjectSyllabus(activeSubjId);
        }
    },

    // Beautiful Drag & Drop File Upload system backing up to IndexedDB
    initFileUploader(dropZoneId, fileInputId, category) {
        const dropZone = document.getElementById(dropZoneId);
        const fileInput = document.getElementById(fileInputId);

        // Click triggering selection
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFilesUpload(e.target.files, category);
        });

        // Drag events styling classes
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        ['dragleave', 'dragend'].forEach(type => {
            dropZone.addEventListener(type, () => {
                dropZone.classList.remove('dragover');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            this.handleFilesUpload(e.dataTransfer.files, category);
        });
    },

    async handleFilesUpload(files, category) {
        if (files.length === 0) return;
        
        const activeSubjId = State.activeSubjectId;
        const uploadLimit = 20 * 1024 * 1024; // 20MB limit
        const dropZone = document.getElementById(category === 'papers' ? 'uploaderPapers' : 'uploaderNotes');
        const originalContent = dropZone.innerHTML;

        // Pulse loading animation in uploader area
        dropZone.innerHTML = `
            <div class="upload-content">
                <span class="status-dot pulsing authorized" style="width:24px;height:24px;margin-bottom:8px;"></span>
                <p style="color:var(--subject-color); font-weight:600;">Uploading to Cloud Locker...</p>
                <span class="file-size-limit">Storing securely on Cloudinary</span>
            </div>
        `;
        dropZone.style.pointerEvents = 'none';

        try {
            for (const file of files) {
                if (file.size > uploadLimit) {
                    alert(`File "${file.name}" exceeds the 20MB storage limit.`);
                    continue;
                }

                const uploadedFile = await uploadToCloudinary(activeSubjId, category, file);
                
                if (!State.files[activeSubjId]) {
                    State.files[activeSubjId] = [];
                }
                State.files[activeSubjId].push(uploadedFile);
            }

            saveFiles();
            await pushStateToCloud();
            
            // Re-render resources list
            Router.renderResourceList(activeSubjId, category, category === 'papers' ? 'papersFileList' : 'notesFileList');
        } catch (err) {
            console.error("Cloudinary upload failed: ", err);
            alert(`Failed to upload to Cloudinary: ${err.message || err}`);
        } finally {
            dropZone.innerHTML = originalContent;
            dropZone.style.pointerEvents = 'auto';
            lucide.createIcons();
        }
    }
};

// --- 8. AUDIO MIXER INTERACTIVE BINDINGS ---
const MixerUI = {
    init() {
        const soundRows = document.querySelectorAll('.sound-row');
        
        soundRows.forEach(row => {
            const type = row.dataset.sound;
            const toggleBtn = row.querySelector('.sound-toggle');
            const slider = row.querySelector('.sound-slider');

            toggleBtn.addEventListener('click', () => {
                // Initialize audio mixer on first user interact (Chrome/Webkit rules)
                AudioMixer.init();

                const isActivating = !row.classList.contains('active');
                
                if (isActivating) {
                    row.classList.add('active');
                    toggleBtn.querySelector('i').setAttribute('data-lucide', 'pause');
                    slider.disabled = false;
                    
                    // Activate channel
                    AudioMixer.toggleChannel(type, parseFloat(slider.value));
                } else {
                    row.classList.remove('active');
                    toggleBtn.querySelector('i').setAttribute('data-lucide', 'play');
                    slider.disabled = true;
                    
                    // Kill channel
                    AudioMixer.stopChannel(type);
                }
                
                lucide.createIcons();
            });

            slider.addEventListener('input', (e) => {
                const vol = parseFloat(e.target.value);
                AudioMixer.setChannelVolume(type, vol);
            });
        });
    }
};

// --- 9. BOOTSTRAPPING PORTAL LAUNCH ---
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Initial State Loading (instant local backup)
    loadState();

    // 2. Synchronize portal data with the cloud
    const cloudSynced = await pullStateFromCloud();
    if (cloudSynced) {
        console.log("Portal state synced from Cloud KV Database.");
    } else {
        // If first launch, initialize the cloud database with standard seed template
        await pushStateToCloud();
    }

    // 3. Initiate subsystems
    Router.init();
    AuthManager.init();
    CreatorSuite.init();
    TimerEngine.init();
    MixerUI.init();

    // 4. Set initial view and statistics
    Router.navigate('explorer');
    updateGlobalStats();

    // Initial lucide load
    lucide.createIcons();
});

// Window lifecycle shutdown cleanup
window.addEventListener('beforeunload', () => {
    AudioMixer.stopAll();
});
