(function (global) {
    const WIDTH = 21;
    const HEIGHT = 23;
    const DIRECTIONS = {
        left: { x: -1, y: 0 },
        down: { x: 0, y: 1 },
        up: { x: 0, y: -1 },
        right: { x: 1, y: 0 },
    };
    const KEYBINDS = { h: 'left', j: 'down', k: 'up', l: 'right' };
    const key = (x, y) => `${x},${y}`;

    function createMaze() {
        const maze = Array.from({ length: HEIGHT }, (_, row) =>
            Array.from(
                { length: WIDTH },
                (_, column) =>
                    row === 0 ||
                    row === HEIGHT - 1 ||
                    column === 0 ||
                    column === WIDTH - 1,
            ),
        );
        for (const row of [2, 5, 8, 14, 17, 20]) {
            for (const column of [2, 5, 8, 12, 15, 18]) {
                for (let offsetY = 0; offsetY < 2; offsetY++) {
                    for (
                        let offsetX = 0;
                        offsetX < (column === 18 ? 1 : 2);
                        offsetX++
                    ) {
                        maze[row + offsetY][column + offsetX] = true;
                    }
                }
            }
        }
        for (let row = 10; row <= 12; row++) {
            for (let column = 8; column <= 12; column++)
                maze[row][column] = false;
        }
        maze[11][0] = false;
        maze[11][WIDTH - 1] = false;
        return maze;
    }

    class MazeGame {
        constructor() {
            this.maze = createMaze();
            this.score = 0;
            this.lives = 3;
            this.level = 1;
            this.state = 'ready';
            this.extraLife = false;
            this.events = [];
            this.prepareLevel();
        }

        prepareLevel() {
            this.pellets = new Map();
            for (let row = 0; row < HEIGHT; row++) {
                for (let column = 0; column < WIDTH; column++) {
                    if (
                        !this.maze[row][column] &&
                        !(row >= 10 && row <= 12 && column >= 8 && column <= 12)
                    ) {
                        this.pellets.set(key(column, row), false);
                    }
                }
            }
            for (const [column, row] of [
                [1, 1],
                [19, 1],
                [1, 21],
                [19, 21],
            ]) {
                this.pellets.set(key(column, row), true);
            }
            this.pellets.delete(key(10, 19));
            this.initialPellets = this.pellets.size;
            this.fruit = null;
            this.fruitSpawned = false;
            this.elapsed = 0;
            this.tick = 0;
            this.resetActors();
        }

        resetActors() {
            this.player = { x: 10, y: 19, direction: 'left', queued: 'left' };
            this.ghosts = [
                { x: 10, y: 9, color: 0xff595e, corner: { x: 19, y: 1 } },
                { x: 9, y: 11, color: 0xffa5cf, corner: { x: 1, y: 1 } },
                { x: 10, y: 11, color: 0x63e2e7, corner: { x: 19, y: 21 } },
                { x: 11, y: 11, color: 0xffb260, corner: { x: 1, y: 21 } },
            ].map((ghost, index) => ({
                ...ghost,
                direction: 'up',
                eaten: false,
                release: index * 12,
            }));
            this.frightened = 0;
            this.ghostCombo = 0;
            this.invulnerable = 12;
        }

        start() {
            if (this.state === 'gameover') {
                this.score = 0;
                this.lives = 3;
                this.level = 1;
                this.extraLife = false;
                this.prepareLevel();
            } else if (this.state === 'cleared') {
                this.level++;
                this.prepareLevel();
            }
            this.state = 'playing';
        }

        pause() {
            if (this.state === 'playing') this.state = 'paused';
            else if (this.state === 'paused') this.state = 'playing';
        }

        steer(direction) {
            if (DIRECTIONS[direction]) this.player.queued = direction;
        }

        destination(actor, direction) {
            const vector = DIRECTIONS[direction];
            let column = actor.x + vector.x;
            const row = actor.y + vector.y;
            if (row === 11) column = (column + WIDTH) % WIDTH;
            if (
                row < 0 ||
                row >= HEIGHT ||
                column < 0 ||
                column >= WIDTH ||
                this.maze[row][column]
            )
                return null;
            return { x: column, y: row };
        }

        addScore(points) {
            this.score += points;
            if (!this.extraLife && this.score >= 10000) {
                this.extraLife = true;
                this.lives++;
                this.events.push('life');
            }
        }

        eat() {
            const position = key(this.player.x, this.player.y);
            if (this.pellets.has(position)) {
                const power = this.pellets.get(position);
                this.pellets.delete(position);
                this.addScore(power ? 50 : 10);
                this.events.push(power ? 'power' : 'pellet');
                if (power) {
                    this.frightened = Math.max(25, 55 - this.level * 3);
                    this.ghostCombo = 0;
                }
            }
            if (
                !this.fruitSpawned &&
                this.initialPellets - this.pellets.size >= 70
            ) {
                this.fruit = { x: 10, y: 13, remaining: 60 };
                this.fruitSpawned = true;
            }
            if (
                this.fruit &&
                this.player.x === this.fruit.x &&
                this.player.y === this.fruit.y
            ) {
                this.addScore(100 * this.level);
                this.fruit = null;
                this.events.push('fruit');
            }
        }

        collision() {
            for (const ghost of this.ghosts) {
                if (
                    ghost.x !== this.player.x ||
                    ghost.y !== this.player.y ||
                    ghost.eaten
                )
                    continue;
                if (this.frightened > 0) {
                    ghost.eaten = true;
                    this.addScore(200 * 2 ** Math.min(this.ghostCombo++, 3));
                    this.events.push('ghost');
                } else if (this.invulnerable === 0) {
                    this.lives--;
                    this.events.push('death');
                    if (this.lives === 0) this.state = 'gameover';
                    else this.resetActors();
                    return true;
                }
            }
            return false;
        }

        target(ghost, index) {
            if (ghost.eaten) return { x: 10, y: 11 };
            if (this.tick % 160 < 40) return ghost.corner;
            const vector = DIRECTIONS[this.player.direction];
            if (index === 1)
                return {
                    x: this.player.x + vector.x * 4,
                    y: this.player.y + vector.y * 4,
                };
            if (index === 2)
                return {
                    x: 2 * (this.player.x + vector.x * 2) - this.ghosts[0].x,
                    y: 2 * (this.player.y + vector.y * 2) - this.ghosts[0].y,
                };
            if (
                index === 3 &&
                Math.hypot(ghost.x - this.player.x, ghost.y - this.player.y) < 6
            )
                return ghost.corner;
            return this.player;
        }

        moveGhost(ghost, index) {
            if (ghost.release > 0) {
                ghost.release--;
                return;
            }
            if (this.frightened > 0 && !ghost.eaten && this.tick % 2 === 0)
                return;
            const current = DIRECTIONS[ghost.direction];
            let choices = Object.keys(DIRECTIONS).filter((direction) =>
                this.destination(ghost, direction),
            );
            const forward = choices.filter(
                (direction) =>
                    DIRECTIONS[direction].x !== -current.x ||
                    DIRECTIONS[direction].y !== -current.y,
            );
            if (forward.length) choices = forward;
            if (!choices.length) return;
            const target = this.target(ghost, index);
            choices.sort((left, right) => {
                const first = this.destination(ghost, left);
                const second = this.destination(ghost, right);
                const distance =
                    Math.hypot(first.x - target.x, first.y - target.y) -
                    Math.hypot(second.x - target.x, second.y - target.y);
                return this.frightened && !ghost.eaten ? -distance : distance;
            });
            ghost.direction = choices[0];
            Object.assign(ghost, this.destination(ghost, ghost.direction));
            if (ghost.eaten && ghost.x === 10 && ghost.y === 11) {
                ghost.eaten = false;
                ghost.release = 12;
            }
        }

        step() {
            if (this.state !== 'playing') return;
            this.tick++;
            if (this.invulnerable) this.invulnerable--;
            if (this.frightened) this.frightened--;
            if (this.fruit && --this.fruit.remaining === 0) this.fruit = null;
            if (this.destination(this.player, this.player.queued))
                this.player.direction = this.player.queued;
            const next = this.destination(this.player, this.player.direction);
            if (next) Object.assign(this.player, next);
            this.eat();
            if (this.collision()) return;
            this.ghosts.forEach((ghost, index) => this.moveGhost(ghost, index));
            if (this.collision()) return;
            if (this.pellets.size === 0) {
                this.state = 'cleared';
                this.events.push('level');
            }
        }

        advance(delta) {
            if (this.state !== 'playing') return;
            this.elapsed += Math.min(delta, 250);
            const interval = Math.max(90, 160 - (this.level - 1) * 8);
            while (this.elapsed >= interval && this.state === 'playing') {
                this.elapsed -= interval;
                this.step();
            }
        }
    }

    const api = { MazeGame, createMaze, WIDTH, HEIGHT, DIRECTIONS, KEYBINDS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.MazeChase = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
