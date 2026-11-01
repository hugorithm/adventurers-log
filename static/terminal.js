(() => {
    const input = document.querySelector('#command-input');
    const form = document.querySelector('#command-form');
    const history = [];
    let historyIndex = 0;
    let draft = '';
    let completionVersion = 0;
    let completionRequest = null;
    let completionChoices = null;
    let interrupted = false;
    let requestPending = false;
    const completions = document.querySelector('#completions');

    function icons() {
        if (window.lucide) window.lucide.createIcons();
    }
    function run(command) {
        if (input.disabled) return;
        input.value = command;
        form.requestSubmit();
    }
    function focusInput() {
        input.focus({ preventScroll: true });
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
            ? 'connection established' : 'awaiting connection';
        document.querySelector('#quick-commands').hidden = !entered;
        document.querySelector('#connection-hint').hidden = entered;
        document.querySelector('#entry-instruction').hidden = entered;
        input.placeholder = entered ? '' : 'ssh hugo';
    }

    function stopProgram() {
        document.querySelectorAll('[data-game]').forEach(game => game.remove());
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
        echo.textContent = `visitor@hugo:${document.querySelector('#prompt-path').textContent} $ ${input.value}^C`;
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
    requestAnimationFrame(() => form.scrollIntoView({ block: 'nearest' }));
    try {
        document.body.classList.toggle(
            'crt-off',
            localStorage.getItem('hugo-crt') === 'off',
        );
    } catch {}
    const crt = document.querySelector('#crt-toggle');
    crt.setAttribute(
        'aria-pressed',
        String(!document.body.classList.contains('crt-off')),
    );
    crt.addEventListener('click', () => {
        const off = document.body.classList.toggle('crt-off');
        crt.setAttribute('aria-pressed', String(!off));
        try {
            localStorage.setItem('hugo-crt', off ? 'off' : 'on');
        } catch {}
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
        if (response.dataset.kind === 'exit') stopProgram();
        if (response.dataset.kind === 'clear')
            document.querySelector('#welcome').hidden = true;
        const entries = document.querySelectorAll('#history > .command-result');
        if (entries.length > 100) entries[0].remove();
        window.Encore?.cleanup();
        icons();
        window.Encore?.mount(response);
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
        if (!document.querySelector('[data-game]')) focusInput();
    });
    document.addEventListener('keydown', event => {
        if (!event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key === 'c') {
            const selectedInput = input.selectionStart !== input.selectionEnd;
            if ((event.target === input && selectedInput) || window.getSelection()?.toString()) return;
            const game = document.querySelector('[data-game]');
            if (event.target !== input && !requestPending && !game) return;
            event.preventDefault();
            interrupt();
        } else if (key === 'd' && event.target === input && !input.disabled) {
            event.preventDefault();
            resetCompletion();
            if (input.value === '') {
                if (document.querySelector('#entered').value === 'true') run('exit');
            } else {
                const start = input.selectionStart;
                const end = input.selectionEnd;
                const nextCharacter = Array.from(input.value.slice(start))[0];
                input.setRangeText('', start, end > start ? end : start + (nextCharacter?.length ?? 0), 'end');
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
                completionChoices.index = (completionChoices.index + (event.shiftKey ? -1 : 1) + count) % count;
                input.value = completionChoices.choices[completionChoices.index];
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
                if (choices.length > 1) {
                    completionChoices = { choices, index: -1, value: input.value };
                    choices.forEach(choice => {
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
