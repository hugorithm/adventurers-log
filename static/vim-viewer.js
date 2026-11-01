(() => {
    const viewers = new Map();
    let libraryRequest = null;

    function script(source) {
        return new Promise((resolve, reject) => {
            const element = document.createElement('script');
            element.src = source;
            element.onload = resolve;
            element.onerror = () => {
                element.remove();
                reject(new Error('Vim library unavailable'));
            };
            document.head.append(element);
        });
    }

    function loadLibrary() {
        if (!libraryRequest) {
            for (const source of [
                '/static/vendor/codemirror.css',
                '/static/vendor/codemirror-dialog.css',
            ]) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = source;
                document.head.append(link);
            }
            libraryRequest = (async () => {
                if (!window.CodeMirror)
                    await script('/static/vendor/codemirror.js');
                await script('/static/vendor/codemirror-searchcursor.js');
                await script('/static/vendor/codemirror-matchbrackets.js');
                await script('/static/vendor/codemirror-dialog.js');
                await script('/static/vendor/codemirror-vim.js');
                const vim = window.CodeMirror.Vim;
                const quit = (editor) => editor.state.portfolioViewer?.close();
                vim.defineEx('quit', 'q', quit);
                vim.defineEx('wq', 'wq', quit);
                vim.defineEx('xit', 'x', quit);
                vim.defineEx('write', 'w', (editor) => {
                    if (editor.state.portfolioViewer)
                        editor.state.portfolioViewer.message.textContent =
                            'E45: read-only file';
                });
            })().catch((error) => {
                libraryRequest = null;
                throw error;
            });
        }
        return libraryRequest;
    }

    function closeAll() {
        for (const [root, viewer] of viewers) {
            viewer.destroy();
            root.remove();
        }
        viewers.clear();
    }

    async function mount(container) {
        const root = container.querySelector('[data-vim-viewer]');
        if (!root) return;
        closeAll();
        document.querySelector('.terminal-app').append(root);
        const controller = new AbortController();
        const form = document.querySelector('#command-form');
        const closeButton = root.querySelector('[data-vim-close]');
        const message = root.querySelector('[data-vim-message]');
        let editor = null;
        form.inert = true;

        function destroy() {
            controller.abort();
            editor?.toTextArea();
            form.inert = false;
        }
        function close() {
            destroy();
            viewers.delete(root);
            root.remove();
            const input = document.querySelector('#command-input');
            input.focus({ preventScroll: true });
            form.scrollIntoView({ block: 'nearest' });
        }
        viewers.set(root, { destroy });
        closeButton.addEventListener('click', close, {
            signal: controller.signal,
        });
        closeButton.focus({ preventScroll: true });
        message.textContent = 'Loading...';

        try {
            await loadLibrary();
        } catch {
            if (!controller.signal.aborted)
                message.textContent =
                    'Unable to load Vim. Close this file and try cat instead.';
            return;
        }
        if (controller.signal.aborted || !root.isConnected) return;

        editor = window.CodeMirror.fromTextArea(
            root.querySelector('[data-vim-source]'),
            {
                keyMap: 'vim',
                readOnly: true,
                lineNumbers: true,
                lineWrapping: true,
                mode: 'text/plain',
                cursorScrollMargin: 5,
                inputStyle: 'textarea',
                showCursorWhenSelecting: true,
            },
        );
        editor.state.portfolioViewer = { close, message };
        editor.on('beforeChange', (_editor, change) => change.cancel());
        editor.on('cursorActivity', () => {
            const cursor = editor.getCursor();
            root.querySelector('[data-vim-position]').textContent =
                `${cursor.line + 1}:${cursor.ch + 1}`;
        });
        editor.on('vim-mode-change', (mode) => {
            root.querySelector('[data-vim-mode]').textContent =
                mode.mode.toUpperCase();
        });
        root.addEventListener(
            'keydown',
            (event) => {
                if (event.key !== 'Tab') return;
                event.preventDefault();
                if (document.activeElement === closeButton) editor.focus();
                else closeButton.focus();
            },
            { signal: controller.signal },
        );
        message.textContent = root.dataset.file;
        editor.refresh();
        editor.focus();
    }

    window.VimViewer = {
        mount,
        closeAll,
        cleanup() {
            for (const [root, viewer] of viewers) {
                if (!root.isConnected) {
                    viewer.destroy();
                    viewers.delete(root);
                }
            }
        },
    };
})();
