(() => {
    const button = document.querySelector('#audio-toggle');
    const storageKey = 'hugo-site-muted';
    let muted = false;
    let activated = false;
    let context = null;
    let output = null;
    let music = null;
    let timer = null;
    let nextNote = 0;
    let step = 0;
    try {
        muted = localStorage.getItem(storageKey) === 'true';
    } catch {}

    function updateButton() {
        const label = muted ? 'Unmute website' : 'Mute website';
        button.setAttribute('aria-pressed', String(muted));
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}" aria-hidden="true"></i>`;
        window.lucide?.createIcons();
    }

    function note(pitch, time, duration, volume, voice) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const frequency = 440 * 2 ** ((pitch - 69) / 12);
        oscillator.type = voice === 'pulse' ? 'square' : 'triangle';
        oscillator.frequency.value = frequency;
        oscillator.connect(envelope);
        envelope.connect(music);
        envelope.gain.setValueAtTime(0, time);
        envelope.gain.linearRampToValueAtTime(volume, time + (voice === 'pulse' ? 0.008 : 0.06));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.start(time);
        oscillator.stop(time + duration + 0.02);
        oscillator.onended = () => {
            oscillator.disconnect();
            envelope.disconnect();
        };
    }

    function schedule() {
        if (muted || document.hidden || context.state !== 'running') return;
        const chords = [
            [50, 53, 57, 64],
            [46, 50, 53, 57],
            [53, 57, 60, 64],
            [48, 55, 58, 62],
        ];
        const melody = [
            [74, null, null, null, 76, null, 77, null, null, null, 76, null, 69, null, null, null],
            [72, null, null, null, null, null, 69, null, 65, null, null, null, null, null, null, null],
            [69, null, null, null, 72, null, null, null, 76, null, null, null, 74, null, null, null],
            [67, null, null, null, null, null, 70, null, 74, null, null, null, 72, null, null, null],
        ];
        const pattern = [0, null, 2, null, 1, null, 3, 2, null, 1, null, 2, null, 3, null, null];
        nextNote = Math.max(nextNote, context.currentTime + 0.02);
        while (nextNote < context.currentTime + 0.2) {
            const bar = Math.floor(step / 16) % chords.length;
            const position = step % 16;
            const chord = chords[bar];
            const arpeggio = pattern[position];
            const lead = melody[bar][position];
            if (arpeggio !== null)
                note(chord[arpeggio] + 12, nextNote, 0.24, 0.012, 'pulse');
            if (lead !== null)
                note(lead, nextNote, 1.1, 0.023, 'lead');
            if (position === 0 || position === 8)
                note(chord[0] - 12 + (position === 8 ? 7 : 0), nextNote, 2.6, 0.038, 'bass');
            step++;
            nextNote += 0.375;
        }
    }

    function pause() {
        clearInterval(timer);
        timer = null;
        if (context) context.suspend().catch(() => {});
    }

    async function resume() {
        activated = true;
        if (!context) {
            const AudioEngine = window.AudioContext || window.webkitAudioContext;
            if (!AudioEngine) throw new Error('Audio unavailable');
            context = new AudioEngine();
            output = context.createGain();
            output.gain.value = muted ? 0 : 0.65;
            output.connect(context.destination);
            music = context.createBiquadFilter();
            music.type = 'lowpass';
            music.frequency.value = 1400;
            music.Q.value = 0.5;
            music.connect(output);
            const echo = context.createDelay(1);
            const feedback = context.createGain();
            const wet = context.createGain();
            echo.delayTime.value = 0.5625;
            feedback.gain.value = 0.22;
            wet.gain.value = 0.18;
            music.connect(echo);
            echo.connect(feedback);
            feedback.connect(echo);
            echo.connect(wet);
            wet.connect(output);
        }
        if (!muted && !document.hidden) {
            await context.resume();
            if (muted || document.hidden) {
                pause();
            } else if (timer === null) {
                nextNote = context.currentTime + 0.05;
                schedule();
                timer = setInterval(schedule, 100);
            }
        }
        return context;
    }

    function start() {
        resume().catch(() => {
            muted = true;
            updateButton();
            button.title = 'Audio unavailable; try unmuting again';
        });
    }

    button.addEventListener('click', () => {
        muted = !muted;
        try {
            localStorage.setItem(storageKey, String(muted));
        } catch {}
        if (output) output.gain.value = muted ? 0 : 0.65;
        updateButton();
        if (muted) pause();
        else start();
    });
    document.addEventListener('pointerdown', (event) => {
        if (!event.isTrusted || event.target.closest('#audio-toggle')) return;
        if (!activated && !muted) start();
    });
    document.addEventListener('keydown', (event) => {
        if (!event.isTrusted || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target.closest('#audio-toggle')) return;
        if (!activated && !muted) start();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pause();
        else if (activated && !muted) start();
    });
    window.SiteAudio = {
        resume,
        get output() { return output; },
        get muted() { return muted; },
    };
    updateButton();
})();