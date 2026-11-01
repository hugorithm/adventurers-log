(() => {
    const input = document.querySelector('#command-input');
    const form = document.querySelector('#command-form');
    const sshCommand = input.placeholder;
    const shellIdentity = form.dataset.identity || 'visitor';
    const history = [];
    let historyIndex = 0;
    let draft = '';
    let completionVersion = 0;
    let completionRequest = null;
    let completionChoices = null;
    let interrupted = false;
    let requestPending = false;
    const completions = document.querySelector('#completions');
    const commandField = document.createElement('span');
    commandField.className = 'command-field';
    const blockCursor = document.createElement('span');
    blockCursor.className = 'command-cursor';
    blockCursor.setAttribute('aria-hidden', 'true');
    blockCursor.hidden = true;
    const cursorMeasure = document.createElement('canvas').getContext('2d');
    input.before(commandField);
    commandField.append(input, blockCursor);

    function updateBlockCursor() {
        blockCursor.hidden =
            document.activeElement !== input ||
            input.disabled ||
            form.inert ||
            input.selectionStart !== input.selectionEnd ||
            !cursorMeasure;
        if (blockCursor.hidden) return;
        const style = getComputedStyle(input);
        cursorMeasure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const position = input.selectionStart;
        const character = Array.from(input.value.slice(position))[0] || ' ';
        blockCursor.textContent = character;
        blockCursor.style.fontFamily = style.fontFamily;
        blockCursor.style.fontSize = style.fontSize;
        blockCursor.style.fontWeight = style.fontWeight;
        blockCursor.style.width = `${cursorMeasure.measureText(character).width}px`;
        blockCursor.style.left = `${parseFloat(style.paddingLeft) + cursorMeasure.measureText(input.value.slice(0, position)).width - input.scrollLeft}px`;
    }

    for (const event of [
        'input',
        'keyup',
        'click',
        'focus',
        'blur',
        'select',
        'scroll',
    ]) {
        input.addEventListener(event, updateBlockCursor);
    }
    document.addEventListener('selectionchange', updateBlockCursor);
    const cursorObserver = new MutationObserver(updateBlockCursor);
    cursorObserver.observe(input, {
        attributes: true,
        attributeFilter: ['disabled'],
    });
    cursorObserver.observe(form, {
        attributes: true,
        attributeFilter: ['inert'],
    });
    new ResizeObserver(updateBlockCursor).observe(commandField);
    document.fonts.ready.then(updateBlockCursor);

    function icons() {
        if (window.lucide) window.lucide.createIcons();
    }
    function run(command) {
        if (input.disabled) return;
        input.value = command;
        updateBlockCursor();
        form.requestSubmit();
    }
    function focusInput() {
        input.focus({ preventScroll: true });
        updateBlockCursor();
        form.scrollIntoView({ block: 'nearest' });
    }

    function resetCompletion() {
        completionVersion++;
        completionRequest?.abort();
        completionRequest = null;
        completionChoices = null;
        completions.replaceChildren();
        completions.hidden = true;
    }

    function setConnection(entered) {
        document.body.classList.toggle('connected', entered);
        document.querySelector('#connection-label').textContent = entered
            ? 'connection established'
            : 'awaiting connection';
        document.querySelector('#quick-commands').hidden = !entered;
        document.querySelector('#connection-hint').hidden = entered;
        document.querySelector('#entry-instruction').hidden = entered;
        input.placeholder = entered ? '' : sshCommand;
    }

    function stopProgram() {
        window.VimViewer?.closeAll();
        document
            .querySelectorAll('[data-game]')
            .forEach((game) => game.remove());
        window.Encore?.cleanup();
    }

    function interrupt() {
        interrupted = true;
        window.htmx.trigger(form, 'htmx:abort');
        resetCompletion();
        stopProgram();
        const result = document.createElement('section');
        result.className = 'command-result';
        const echo = document.createElement('div');
        echo.className = 'command-echo';
        echo.textContent = `${shellIdentity}:${document.querySelector('#prompt-path').textContent} $ ${input.value}^C`;
        result.append(echo);
        document.querySelector('#history').append(result);
        input.value = '';
        draft = '';
        historyIndex = history.length;
        document.querySelector('#request-error').hidden = true;
        focusInput();
    }

    document.querySelector('#year').textContent = new Date().getFullYear();
    icons();
    focusInput();
    document.body.classList.remove('crt-off');
    const crt = document.querySelector('#crt-toggle');
    function updateCrtToggle() {
        const enabled = !document.body.classList.contains('crt-off');
        const label = enabled ? 'Disable CRT effect' : 'Enable CRT effect';
        crt.setAttribute('aria-pressed', String(enabled));
        crt.setAttribute('aria-label', label);
        crt.title = label;
    }
    updateCrtToggle();
    crt.addEventListener('click', () => {
        document.body.classList.toggle('crt-off');
        updateCrtToggle();
    });

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-command]');
        if (button) run(button.dataset.command);
        const completion = event.target.closest('[data-completion]');
        if (completion) {
            input.value = completion.dataset.completion;
            resetCompletion();
            focusInput();
        }
    });
    document.addEventListener('htmx:beforeRequest', (event) => {
        if (event.detail.elt !== form) return;
        document.querySelector('#request-error').hidden = true;
        interrupted = false;
        requestPending = true;
        resetCompletion();
    });
    document.addEventListener('htmx:afterSwap', (event) => {
        if (event.detail.target.id !== 'history') return;
        if (interrupted) return;
        const response = document.querySelector(
            '#history > .command-result:last-child',
        );
        if (!response) return;
        const command = input.value;
        if (command.trim() && history.at(-1) !== command) history.push(command);
        if (history.length > 100) history.shift();
        historyIndex = history.length;
        draft = '';
        input.value = '';
        document.querySelector('#cwd').value = response.dataset.cwd;
        document.querySelector('#entered').value = response.dataset.entered;
        document.querySelector('#prompt-path').textContent =
            response.dataset.path;
        setConnection(response.dataset.entered === 'true');
        if (response.dataset.kind === 'exit' || response.dataset.kind === 'vim')
            stopProgram();
        if (response.dataset.kind === 'clear')
            document.querySelector('#welcome').hidden = true;
        const entries = document.querySelectorAll('#history > .command-result');
        if (entries.length > 100) entries[0].remove();
        window.Encore?.cleanup();
        window.VimViewer?.cleanup();
        icons();
        window.Encore?.mount(response);
        window.VimViewer?.mount(response);
        requestAnimationFrame(() => {
            if (response.querySelector('[data-game]'))
                response.scrollIntoView({ block: 'start' });
            else form.scrollIntoView({ block: 'nearest' });
        });
    });
    document.addEventListener('htmx:afterRequest', (event) => {
        if (event.detail.elt !== form) return;
        requestPending = false;
        if (!event.detail.successful && !interrupted)
            document.querySelector('#request-error').hidden = false;
        if (!document.querySelector('[data-game], [data-vim-viewer]'))
            focusInput();
    });
    document.addEventListener('keydown', (event) => {
        if (!event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 'c') {
            const selectedInput = input.selectionStart !== input.selectionEnd;
            if (
                (event.target === input && selectedInput) ||
                window.getSelection()?.toString()
            )
                return;
            const game = document.querySelector('[data-game]');
            if (event.target !== input && !requestPending && !game) return;
            event.preventDefault();
            interrupt();
        } else if (key === 'd' && event.target === input && !input.disabled) {
            event.preventDefault();
            resetCompletion();
            if (input.value === '') {
                if (document.querySelector('#entered').value === 'true')
                    run('exit');
            } else {
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const nextCharacter = Array.from(input.value.slice(start))[0];
                input.setRangeText(
                    '',
                    start,
                    end > start ? end : start + (nextCharacter?.length ?? 0),
                    'end',
                );
            }
        }
    });
    input.addEventListener('input', resetCompletion);
    input.addEventListener('keydown', async (event) => {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            resetCompletion();
            if (historyIndex === history.length) draft = input.value;
            historyIndex = Math.max(0, historyIndex - 1);
            input.value = history[historyIndex] ?? draft;
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            resetCompletion();
            historyIndex = Math.min(history.length, historyIndex + 1);
            input.value = history[historyIndex] ?? draft;
        } else if (event.key === 'Tab') {
            event.preventDefault();
            if (completionChoices && input.value === completionChoices.value) {
                const count = completionChoices.choices.length;
                completionChoices.index =
                    (completionChoices.index +
                        (event.shiftKey ? -1 : 1) +
                        count) %
                    count;
                input.value =
                    completionChoices.choices[completionChoices.index];
                completionChoices.value = input.value;
                return;
            }
            resetCompletion();
            const version = ++completionVersion;
            completionRequest = new AbortController();
            try {
                const response = await fetch('/complete', {
                    method: 'POST',
                    body: new URLSearchParams(new FormData(form)),
                    signal: completionRequest.signal,
                });
                if (!response.ok) return;
                const choices = await response.json();
                if (version !== completionVersion || !choices.length) return;
                let common = choices[0];
                for (const choice of choices) {
                    while (!choice.startsWith(common))
                        common = common.slice(0, -1);
                }
                input.value = choices.length === 1 ? choices[0] : common;
                updateBlockCursor();
                if (choices.length > 1) {
                    completionChoices = {
                        choices,
                        index: -1,
                        value: input.value,
                    };
                    choices.forEach((choice) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.dataset.completion = choice;
                        button.textContent = choice;
                        completions.append(button);
                    });
                    completions.hidden = false;
                    completions.scrollIntoView({ block: 'nearest' });
                }
            } catch {}
        } else if (event.ctrlKey && event.key.toLowerCase() === 'l') {
            event.preventDefault();
            if (document.querySelector('#entered').value === 'true')
                run('clear');
        }
    });
})();
