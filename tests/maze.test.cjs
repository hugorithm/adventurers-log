const test = require('node:test');
const assert = require('node:assert/strict');
const { MazeGame, WIDTH, HEIGHT, KEYBINDS } = require('../static/maze.js');

test('the original maze is connected and every pellet is reachable', () => {
    const game = new MazeGame();
    const visited = new Set();
    const queue = [{ x: 10, y: 19 }];
    while (queue.length) {
        const position = queue.shift();
        const key = `${position.x},${position.y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        for (const direction of ['left', 'down', 'up', 'right']) {
            const next = game.destination(position, direction);
            if (next) queue.push(next);
        }
    }
    for (const position of game.pellets.keys())
        assert.ok(visited.has(position), position);
    assert.equal(game.maze.length, HEIGHT);
    assert.ok(game.maze.every((row) => row.length === WIDTH));
});

test('Vim HJKL controls, walls, tunnels, and queued turns', () => {
    const game = new MazeGame();
    assert.deepEqual(KEYBINDS, { h: 'left', j: 'down', k: 'up', l: 'right' });
    assert.equal(game.destination({ x: 1, y: 1 }, 'up'), null);
    assert.deepEqual(game.destination({ x: 0, y: 11 }, 'left'), {
        x: 20,
        y: 11,
    });
    game.start();
    game.steer('down');
    game.step();
    assert.equal(game.player.y, 20);
    assert.equal(game.score, 10);
});

test('power pellets allow eating ghosts; normal collisions cost lives', () => {
    const game = new MazeGame();
    game.player = { x: 1, y: 1, direction: 'right', queued: 'right' };
    game.eat();
    assert.equal(game.score, 50);
    assert.ok(game.frightened > 0);
    game.ghosts[0].x = 1;
    game.ghosts[0].y = 1;
    game.collision();
    assert.equal(game.score, 250);
    assert.ok(game.ghosts[0].eaten);
    game.frightened = 0;
    game.invulnerable = 0;
    game.ghosts[1].x = 1;
    game.ghosts[1].y = 1;
    game.collision();
    assert.equal(game.lives, 2);
    assert.deepEqual([game.player.x, game.player.y], [10, 19]);
});

test('pause, game over, new game, and next level preserve correct state', () => {
    const game = new MazeGame();
    game.start();
    game.pause();
    game.advance(200);
    assert.equal(game.tick, 0);
    game.pause();
    game.advance(200);
    assert.equal(game.tick, 1);
    game.pellets.clear();
    game.step();
    assert.equal(game.state, 'cleared');
    game.start();
    assert.equal(game.level, 2);
    game.state = 'gameover';
    game.start();
    assert.equal(game.level, 1);
    assert.equal(game.lives, 3);
    assert.equal(game.score, 0);
});
