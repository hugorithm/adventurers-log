(() => {
    const games = new Map();
    const melody = [
        0, 1, 2, 1, 0, 1, 3, 2, 1, 0, 2, 3, 2, 1, 0, 1, 2, 0, 3, 2, 1, 2, 3, 0,
    ];
    const colors = ['#a5e4d1', '#8bc9df', '#e6d28e', '#d2adcc'];
    const stars = [
        {
            x: 130,
            y: 170,
            name: 'Code',
            note: 'Code: making complex things feel simple.',
        },
        {
            x: 285,
            y: 80,
            name: 'Piano',
            note: 'Piano: debugging a melody, one wrong note at a time.',
        },
        {
            x: 440,
            y: 165,
            name: 'Trails',
            note: 'Trails: the scenic route is usually the right one.',
        },
        {
            x: 590,
            y: 95,
            name: 'Curiosity',
            note: 'Curiosity: the reason this hidden program exists.',
        },
    ];

    function mount(container) {
        const root = container.querySelector('[data-game]');
        if (!root) return;
        for (const [otherRoot, game] of games) {
            game.destroy();
            otherRoot.remove();
        }
        games.clear();
        const canvas = root.querySelector('canvas');
        const context = canvas.getContext('2d');
        const scoreLabel = root.querySelector('[data-score]');
        const status = root.querySelector('[data-game-status]');
        const message = root.querySelector('[data-game-message]');
        const startButton = root.querySelector('[data-game-start]');
        const soundButton = root.querySelector('[data-game-sound]');
        const buttons = [...root.querySelectorAll('[data-lane]')];
        const starButtons = [...root.querySelectorAll('[data-star]')];
        const skyControls = root.querySelector('[data-sky-controls]');
        const constellationNote = root.querySelector('[data-constellation]');
        let selectedStar = 0;
        const controller = new AbortController();
        const options = { signal: controller.signal };
        const flashes = [0, 0, 0, 0];
        let frame = 0;
        let running = false;
        let started = 0;
        let notes = [];
        let score = 0;
        let best = 0;
        let hits = 0;
        let audio = null;
        let sound = false;
        try {
            best = Number(localStorage.getItem('hugo-encore-best')) || 0;
        } catch {}
        root.querySelector('[data-best]').textContent = String(best).padStart(
            4,
            '0',
        );

        function draw(time = performance.now()) {
            context.fillStyle = '#0d1110';
            context.fillRect(0, 0, 720, 300);
            if (!running) {
                for (let index = 0; index < 64; index++) {
                    context.fillStyle = index % 3 === 0 ? '#728c7b' : '#304338';
                    context.fillRect(
                        (index * 137 + 33) % 720,
                        (index * 83 + 17) % 300,
                        2,
                        2,
                    );
                }
                context.strokeStyle = '#557c6b';
                context.setLineDash([3, 6]);
                context.beginPath();
                stars.forEach((star, index) =>
                    index
                        ? context.lineTo(star.x, star.y)
                        : context.moveTo(star.x, star.y),
                );
                context.stroke();
                context.setLineDash([]);
                stars.forEach((star, index) => {
                    context.fillStyle = colors[index];
                    const size = index === selectedStar ? 8 : 5;
                    context.fillRect(
                        star.x - size / 2,
                        star.y - size / 2,
                        size,
                        size,
                    );
                    if (index === selectedStar) {
                        context.strokeStyle = colors[index];
                        context.strokeRect(star.x - 12, star.y - 12, 24, 24);
                    }
                    context.font = '12px "IBM Plex Mono", monospace';
                    context.textAlign = 'center';
                    context.fillText(star.name, star.x, star.y + 32);
                });
                context.fillStyle = '#75887c';
                context.font = '11px "IBM Plex Mono", monospace';
                context.fillText('a few things in my orbit.', 360, 266);
                return;
            }
            for (let lane = 0; lane < 4; lane++) {
                if (flashes[lane] > time) {
                    context.fillStyle = `${colors[lane]}22`;
                    context.fillRect(lane * 180, 0, 180, 300);
                }
                context.strokeStyle = '#26372e';
                context.beginPath();
                context.moveTo(lane * 180, 0);
                context.lineTo(lane * 180, 300);
                context.stroke();
            }
            context.strokeStyle = '#a5e4d177';
            context.setLineDash([4, 6]);
            context.beginPath();
            context.moveTo(0, 254);
            context.lineTo(720, 254);
            context.stroke();
            context.setLineDash([]);
            const elapsed = (time - started) / 1000;
            for (const note of notes) {
                if (note.hit || note.missed) continue;
                const vertical = 254 + (elapsed - note.at) * 150;
                if (vertical > 290) {
                    note.missed = true;
                    continue;
                }
                if (vertical < -20) continue;
                context.fillStyle = colors[note.lane];
                context.fillRect(note.lane * 180 + 25, vertical - 9, 130, 18);
                context.fillStyle = '#0d111066';
                context.fillRect(note.lane * 180 + 30, vertical - 5, 120, 2);
            }
        }

        function finish() {
            running = false;
            skyControls.hidden = false;
            constellationNote.hidden = false;
            best = Math.max(best, score);
            try {
                localStorage.setItem('hugo-encore-best', String(best));
            } catch {}
            root.querySelector('[data-best]').textContent = String(
                best,
            ).padStart(4, '0');
            status.textContent = `${hits} / ${melody.length} notes`;
            message.textContent =
                hits === melody.length
                    ? 'Perfect. The mountains can wait.'
                    : 'every melody starts somewhere.';
            startButton.querySelector('span').textContent = 'Play again';
            draw();
        }

        function tick(time) {
            draw(time);
            if (!running) return;
            if ((time - started) / 1000 > notes.at(-1).at + 1) {
                finish();
                return;
            }
            frame = requestAnimationFrame(tick);
        }

        function playTone(lane) {
            if (!sound || !audio) return;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.value = [261.63, 329.63, 392, 440][lane];
            gain.gain.setValueAtTime(0.0001, audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(
                0.18,
                audio.currentTime + 0.01,
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                audio.currentTime + 0.6,
            );
            oscillator.connect(gain);
            gain.connect(audio.destination);
            oscillator.start();
            oscillator.stop(audio.currentTime + 0.65);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
            };
        }

        function strike(lane) {
            const now = performance.now();
            flashes[lane] = now + 140;
            buttons[lane].classList.add('active');
            setTimeout(() => buttons[lane].classList.remove('active'), 140);
            playTone(lane);
            if (running) {
                const elapsed = (now - started) / 1000;
                const note = notes.find(
                    (note) =>
                        note.lane === lane &&
                        !note.hit &&
                        !note.missed &&
                        Math.abs(note.at - elapsed) < 0.24,
                );
                if (note) {
                    note.hit = true;
                    hits++;
                    score += Math.abs(note.at - elapsed) < 0.12 ? 100 : 50;
                    scoreLabel.textContent = String(score).padStart(4, '0');
                    status.textContent = 'in the groove';
                } else status.textContent = 'find the rhythm';
            } else {
                draw(now);
                setTimeout(() => draw(), 150);
            }
        }

        startButton.addEventListener(
            'click',
            () => {
                cancelAnimationFrame(frame);
                audio?.resume();
                score = 0;
                hits = 0;
                scoreLabel.textContent = '0000';
                notes = melody.map((lane, index) => ({
                    lane,
                    at: 2 + index * 0.62,
                    hit: false,
                    missed: false,
                }));
                running = true;
                skyControls.hidden = true;
                constellationNote.hidden = true;
                started = performance.now();
                status.textContent = 'follow the notes';
                message.textContent = 'a tiny detour from the command line.';
                startButton.querySelector('span').textContent = 'Restart';
                document.activeElement?.blur();
                frame = requestAnimationFrame(tick);
            },
            options,
        );
        soundButton.addEventListener(
            'click',
            async () => {
                try {
                    if (!audio)
                        audio = new (window.AudioContext ||
                            window.webkitAudioContext)();
                    await audio.resume();
                    sound = !sound;
                    soundButton.setAttribute('aria-pressed', String(sound));
                    soundButton.setAttribute(
                        'aria-label',
                        sound ? 'Mute sound' : 'Enable sound',
                    );
                    soundButton.title = sound ? 'Mute sound' : 'Enable sound';
                    soundButton.innerHTML = `<i data-lucide="${sound ? 'volume-2' : 'volume-x'}"></i>`;
                    window.lucide?.createIcons();
                } catch {
                    message.textContent =
                        'sound is unavailable in this browser.';
                }
            },
            options,
        );
        buttons.forEach((button, lane) =>
            button.addEventListener(
                'pointerdown',
                (event) => {
                    event.preventDefault();
                    strike(lane);
                },
                options,
            ),
        );
        function selectStar(index) {
            selectedStar = index;
            starButtons.forEach((button, buttonIndex) =>
                button.setAttribute(
                    'aria-pressed',
                    String(buttonIndex === index),
                ),
            );
            constellationNote.textContent = stars[index].note;
            draw();
        }
        starButtons.forEach((button, index) =>
            button.addEventListener('click', () => selectStar(index), options),
        );
        canvas.addEventListener(
            'pointerdown',
            (event) => {
                if (running) return;
                const bounds = canvas.getBoundingClientRect();
                const point = {
                    x: ((event.clientX - bounds.left) * 720) / bounds.width,
                    y: ((event.clientY - bounds.top) * 300) / bounds.height,
                };
                const index = stars.findIndex(
                    (star) =>
                        Math.hypot(star.x - point.x, star.y - point.y) < 40,
                );
                if (index >= 0) selectStar(index);
            },
            options,
        );
        buttons.forEach((button, lane) =>
            button.addEventListener(
                'keydown',
                (event) => {
                    if (
                        (event.key === 'Enter' || event.key === ' ') &&
                        !event.repeat
                    ) {
                        event.preventDefault();
                        strike(lane);
                    }
                },
                options,
            ),
        );
        document.addEventListener(
            'keydown',
            (event) => {
                if (
                    event.target.matches('input, textarea') ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.altKey ||
                    event.repeat
                )
                    return;
                const lane = ['d', 'f', 'j', 'k'].indexOf(
                    event.key.toLowerCase(),
                );
                if (lane >= 0) {
                    event.preventDefault();
                    strike(lane);
                }
                if (event.key === 'Escape') close();
            },
            options,
        );
        document.addEventListener(
            'visibilitychange',
            () => {
                if (document.hidden && running) {
                    cancelAnimationFrame(frame);
                    finish();
                    message.textContent =
                        'Paused for life. Play again whenever.';
                }
            },
            options,
        );
        function destroy() {
            running = false;
            cancelAnimationFrame(frame);
            controller.abort();
            audio?.close();
        }
        function close() {
            destroy();
            games.delete(root);
            root.remove();
            document
                .querySelector('#command-input')
                .focus({ preventScroll: true });
        }
        root.querySelector('[data-game-close]').addEventListener(
            'click',
            close,
            options,
        );
        games.set(root, { destroy });
        draw();
    }

    window.Encore = {
        mount,
        cleanup() {
            for (const [root, game] of games) {
                if (!root.isConnected) {
                    game.destroy();
                    games.delete(root);
                }
            }
        },
    };
})();
