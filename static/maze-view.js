(() => {
    const games = new Map();
    let engineRequest = null;

    function loadEngine() {
        if (window.Phaser) return Promise.resolve();
        if (!engineRequest) {
            engineRequest = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/static/vendor/phaser.min.js';
                script.onload = resolve;
                script.onerror = () => {
                    engineRequest = null;
                    script.remove();
                    reject(new Error('Game engine unavailable'));
                };
                document.head.append(script);
            });
        }
        return engineRequest;
    }

    async function mount(container) {
        const root = container.querySelector('[data-game]');
        if (!root) return;
        for (const [otherRoot, game] of games) {
            game.destroy();
            otherRoot.remove();
        }
        games.clear();
        const controller = new AbortController();
        const options = { signal: controller.signal };
        const stage = root.querySelector('[data-maze-stage]');
        const startButton = root.querySelector('[data-game-start]');
        const pauseButton = root.querySelector('[data-game-pause]');
        const soundButton = root.querySelector('[data-game-sound]');
        const status = root.querySelector('[data-game-status]');
        const model = new window.MazeChase.MazeGame();
        let engine = null;
        let audio = null;
        let sound = false;
        let best = 0;
        try {
            best = Number(localStorage.getItem('hugo-maze-best')) || 0;
        } catch {}

        function updateLabels() {
            if (model.score > best) {
                best = model.score;
                try {
                    localStorage.setItem('hugo-maze-best', String(best));
                } catch {}
            }
            root.querySelector('[data-score]').textContent = String(
                model.score,
            ).padStart(6, '0');
            root.querySelector('[data-best]').textContent = String(
                best,
            ).padStart(6, '0');
            root.querySelector('[data-lives]').textContent = model.lives;
            root.querySelector('[data-level]').textContent = String(
                model.level,
            ).padStart(2, '0');
            root.dataset.state = model.state;
            startButton.querySelector('span').textContent =
                model.state === 'cleared'
                    ? 'Next level'
                    : model.state === 'gameover'
                      ? 'Play again'
                      : model.state === 'paused'
                        ? 'Resume'
                        : 'Play';
            startButton.hidden = model.state === 'playing';
            pauseButton.hidden = !['playing', 'paused'].includes(model.state);
            pauseButton.setAttribute(
                'aria-label',
                model.state === 'paused' ? 'Resume game' : 'Pause game',
            );
            status.textContent = model.frightened
                ? 'POWER UP'
                : {
                      ready: 'READY',
                      playing: 'LEVEL ' + model.level,
                      paused: 'PAUSED',
                      cleared: 'MAZE CLEAR',
                      gameover: 'GAME OVER',
                  }[model.state];
        }

        function tone(event) {
            if (!sound || !audio || window.SiteAudio.muted || document.hidden) return;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            oscillator.type = 'square';
            oscillator.frequency.value =
                {
                    pellet: 390,
                    power: 780,
                    ghost: 980,
                    fruit: 650,
                    death: 100,
                    level: 1100,
                    life: 880,
                }[event] || 440;
            gain.gain.setValueAtTime(0.025, audio.currentTime);
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                audio.currentTime + 0.09,
            );
            oscillator.connect(gain);
            gain.connect(window.SiteAudio.output);
            oscillator.start();
            oscillator.stop(audio.currentTime + 0.1);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
            };
        }

        function destroy() {
            controller.abort();
            engine?.destroy(true);
        }
        function close() {
            destroy();
            games.delete(root);
            root.remove();
            const input = document.querySelector('#command-input');
            input.focus({ preventScroll: true });
            input.scrollIntoView({ block: 'nearest' });
        }
        games.set(root, { destroy });
        root.querySelector('[data-game-close]').addEventListener(
            'click',
            close,
            options,
        );
        updateLabels();
        startButton.disabled = true;
        status.textContent = 'LOADING';

        try {
            await loadEngine();
        } catch {
            if (!controller.signal.aborted)
                status.textContent = 'GAME UNAVAILABLE';
            return;
        }
        if (controller.signal.aborted || !root.isConnected) return;

        const { WIDTH, HEIGHT, DIRECTIONS, KEYBINDS } = window.MazeChase;
        const TILE = 20;

        class MazeScene extends Phaser.Scene {
            create() {
                this.board = this.add.graphics();
                this.items = this.add.graphics();
                this.actors = this.add.graphics();
                this.overlay = this.add
                    .text((WIDTH * TILE) / 2, 13 * TILE + 10, 'READY!', {
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: '16px',
                        color: '#ffdf55',
                        backgroundColor: '#000000',
                        padding: { x: 8, y: 4 },
                    })
                    .setOrigin(0.5)
                    .setDepth(10);
                this.drawBoard();
                this.drawActors(0);
                this.drawItems(0);
                stage
                    .querySelector('canvas')
                    .setAttribute(
                        'aria-label',
                        'Maze chase board with pellets and four ghosts',
                    );
                startButton.disabled = false;
                updateLabels();
            }

            drawBoard() {
                const graphics = this.board;
                graphics
                    .fillStyle(0x000000)
                    .fillRect(0, 0, WIDTH * TILE, HEIGHT * TILE);
                graphics.lineStyle(2, 0x3156ef);
                model.maze.forEach((row, rowIndex) =>
                    row.forEach((wall, column) => {
                        if (!wall) return;
                        const x = column * TILE;
                        const y = rowIndex * TILE;
                        graphics.fillStyle(0x080c22).fillRect(x, y, TILE, TILE);
                        if (rowIndex > 0 && !model.maze[rowIndex - 1][column])
                            graphics.lineBetween(x, y + 1, x + TILE, y + 1);
                        if (
                            rowIndex < HEIGHT - 1 &&
                            !model.maze[rowIndex + 1][column]
                        )
                            graphics.lineBetween(
                                x,
                                y + TILE - 1,
                                x + TILE,
                                y + TILE - 1,
                            );
                        if (column > 0 && !row[column - 1])
                            graphics.lineBetween(x + 1, y, x + 1, y + TILE);
                        if (column < WIDTH - 1 && !row[column + 1])
                            graphics.lineBetween(
                                x + TILE - 1,
                                y,
                                x + TILE - 1,
                                y + TILE,
                            );
                    }),
                );
                graphics
                    .lineStyle(1, 0x45425f)
                    .strokeRoundedRect(
                        8 * TILE + 3,
                        10 * TILE + 3,
                        5 * TILE - 6,
                        3 * TILE - 6,
                        7,
                    );
            }

            drawItems(time) {
                const graphics = this.items.clear();
                graphics.fillStyle(0xf2d5ab);
                for (const [position, power] of model.pellets) {
                    const [column, row] = position.split(',').map(Number);
                    graphics.fillCircle(
                        column * TILE + TILE / 2,
                        row * TILE + TILE / 2,
                        power ? 4 + Math.sin(time / 120) : 1.7,
                    );
                }
                if (model.fruit) {
                    const x = model.fruit.x * TILE + 10;
                    const y = model.fruit.y * TILE + 10;
                    graphics
                        .fillStyle(0xff5167)
                        .fillCircle(x - 3, y + 2, 4)
                        .fillCircle(x + 4, y + 2, 4);
                    graphics
                        .lineStyle(2, 0x6cde91)
                        .lineBetween(x, y - 5, x - 3, y)
                        .lineBetween(x, y - 5, x + 4, y);
                }
            }

            drawActors(time) {
                const graphics = this.actors.clear();
                const player = model.player;
                const angles = {
                    right: 0,
                    down: Math.PI / 2,
                    left: Math.PI,
                    up: -Math.PI / 2,
                };
                const opening = 0.15 + Math.abs(Math.sin(time / 90)) * 0.5;
                const angle = angles[player.direction];
                if (!model.invulnerable || model.tick % 3 !== 0) {
                    graphics
                        .fillStyle(0xffdf38)
                        .slice(
                            player.x * TILE + 10,
                            player.y * TILE + 10,
                            8,
                            angle + opening,
                            angle + Math.PI * 2 - opening,
                            false,
                        )
                        .fillPath();
                }
                model.ghosts.forEach((ghost) => {
                    const x = ghost.x * TILE + 10;
                    const y = ghost.y * TILE + 10;
                    const scared = model.frightened > 0 && !ghost.eaten;
                    const color = scared
                        ? model.frightened < 10 && model.tick % 2
                            ? 0xf0e5d8
                            : 0x3454e9
                        : ghost.color;
                    if (!ghost.eaten) {
                        graphics
                            .fillStyle(color)
                            .fillCircle(x, y - 2, 8)
                            .fillRect(x - 8, y - 2, 16, 9);
                        for (let foot = 0; foot < 3; foot++)
                            graphics.fillTriangle(
                                x - 8 + foot * 6,
                                y + 6,
                                x - 3 + foot * 6,
                                y + 6,
                                x - 6 + foot * 6,
                                y + 9,
                            );
                    }
                    if (scared) {
                        graphics
                            .fillStyle(0xffffff)
                            .fillCircle(x - 3, y - 2, 1.2)
                            .fillCircle(x + 3, y - 2, 1.2);
                        graphics
                            .lineStyle(1, 0xffffff)
                            .lineBetween(x - 4, y + 3, x + 4, y + 3);
                    } else {
                        const vector = DIRECTIONS[ghost.direction];
                        graphics
                            .fillStyle(0xffffff)
                            .fillEllipse(x - 3.5, y - 2, 5.5, 7)
                            .fillEllipse(x + 3.5, y - 2, 5.5, 7);
                        graphics
                            .fillStyle(0x254cce)
                            .fillCircle(
                                x - 3.5 + vector.x * 1.5,
                                y - 2 + vector.y * 1.5,
                                1.7,
                            )
                            .fillCircle(
                                x + 3.5 + vector.x * 1.5,
                                y - 2 + vector.y * 1.5,
                                1.7,
                            );
                    }
                });
            }

            update(time, delta) {
                model.advance(delta);
                while (model.events.length) tone(model.events.shift());
                this.drawItems(time);
                this.drawActors(time);
                this.overlay.setVisible(model.state !== 'playing');
                this.overlay.setText(
                    {
                        ready: 'READY!',
                        paused: 'PAUSED',
                        cleared: 'MAZE CLEAR!',
                        gameover: 'GAME OVER',
                    }[model.state] || '',
                );
                updateLabels();
            }
        }

        engine = new Phaser.Game({
            type: Phaser.CANVAS,
            width: WIDTH * TILE,
            height: HEIGHT * TILE,
            parent: stage,
            backgroundColor: '#000000',
            pixelArt: true,
            audio: { noAudio: true },
            banner: false,
            scene: MazeScene,
            fps: { target: 60, forceSetTimeOut: true },
        });

        function start() {
            model.start();
            if (audio) window.SiteAudio.resume().catch(() => {});
            updateLabels();
            document.activeElement?.blur();
        }
        startButton.addEventListener('click', start, options);
        pauseButton.addEventListener(
            'click',
            () => {
                model.pause();
                updateLabels();
                document.activeElement?.blur();
            },
            options,
        );
        root.querySelectorAll('[data-direction]').forEach((button) => {
            button.addEventListener(
                'pointerdown',
                (event) => {
                    event.preventDefault();
                    if (model.state === 'ready') start();
                    model.steer(button.dataset.direction);
                    document.activeElement?.blur();
                },
                options,
            );
            button.addEventListener(
                'click',
                () => model.steer(button.dataset.direction),
                options,
            );
        });
        document.addEventListener(
            'keydown',
            (event) => {
                if (
                    event.target.matches('input, textarea') ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.altKey
                )
                    return;
                const direction =
                    KEYBINDS[event.key.toLowerCase()] ||
                    {
                        ArrowLeft: 'left',
                        ArrowDown: 'down',
                        ArrowUp: 'up',
                        ArrowRight: 'right',
                    }[event.key];
                if (direction) {
                    event.preventDefault();
                    if (model.state === 'ready') start();
                    model.steer(direction);
                } else if (event.key === ' ') {
                    event.preventDefault();
                    if (['ready', 'gameover', 'cleared'].includes(model.state))
                        start();
                    else model.pause();
                    updateLabels();
                } else if (event.key === 'Escape') close();
            },
            options,
        );
        document.addEventListener(
            'visibilitychange',
            () => {
                if (document.hidden && model.state === 'playing') {
                    model.pause();
                    updateLabels();
                }
            },
            options,
        );
        soundButton.addEventListener(
            'click',
            async () => {
                try {
                    audio = await window.SiteAudio.resume();
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
                    status.textContent = 'SOUND UNAVAILABLE';
                }
            },
            options,
        );
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
